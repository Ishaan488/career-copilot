# Career Copilot — WSL2 Windows 11 Auto-Start & Operational Guide

> **Authoritative Reference:** Doc 16 §5–§6, Doc 17 §M14  
> **Environment:** Windows 11 Host + WSL2 (`Ubuntu-D` or standard Ubuntu) + systemd + Windows Task Scheduler

This guide details how to configure Career Copilot to start automatically on Windows 11 boot/login, maintain headless services reliably, handle laptop sleep/hibernation gaps, and configure headed browser support via WSLg for human-in-the-loop takeover.

---

## 1. WSL2 Prerequisites & Systemd Setup

### 1.1 Enable systemd in WSL2
Ensure systemd is enabled inside your WSL2 distribution (`/etc/wsl.conf`):

```ini
# /etc/wsl.conf
[boot]
systemd=true

[automount]
enabled=true
options="metadata,umask=22,fmask=11"
```

After modifying `/etc/wsl.conf`, restart WSL from Windows PowerShell:
```powershell
wsl --shutdown
```

### 1.2 Verify Services Inside WSL
Ensure PostgreSQL is running as a systemd service:
```bash
sudo systemctl enable --now postgresql
sudo systemctl status postgresql
```

---

## 2. Systemd Service Units for Career Copilot

We manage Career Copilot using systemd user units or system units. Using user units avoids requiring `sudo` and links directly to the developer user account.

### 2.1 Web Service Unit (`~/.config/systemd/user/career-copilot-web.service`)
Create the directory if it does not exist:
```bash
mkdir -p ~/.config/systemd/user
```

Create `~/.config/systemd/user/career-copilot-web.service`:
```ini
[Unit]
Description=Career Copilot Next.js Web Application
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=/mnt/e/personal/career-copilot
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5s
KillMode=mixed
TimeoutStopSec=15s

[Install]
WantedBy=default.target
```

### 2.2 Worker Service Unit (`~/.config/systemd/user/career-copilot-worker.service`)
Create `~/.config/systemd/user/career-copilot-worker.service`:
```ini
[Unit]
Description=Career Copilot Background Worker (pg-boss & Playwright)
After=network.target postgresql.service career-copilot-web.service

[Service]
Type=simple
WorkingDirectory=/mnt/e/personal/career-copilot
Environment=NODE_ENV=production
# WSLg Display forwarding for headed takeover (Doc 12 §4, Doc 16 §6)
Environment=DISPLAY=:0
Environment=WAYLAND_DISPLAY=wayland-0
Environment=XDG_RUNTIME_DIR=/mnt/wslg/runtime-dir
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=10s
KillMode=mixed
TimeoutStopSec=30s

[Install]
WantedBy=default.target
```

### 2.3 Enable and Start User Services
```bash
# Enable lingering so user services run even when no interactive shell is open
sudo loginctl enable-linger $USER

# Reload and enable services
systemctl --user daemon-reload
systemctl --user enable --now career-copilot-web.service
systemctl --user enable --now career-copilot-worker.service

# Check service status
systemctl --user status career-copilot-web.service
systemctl --user status career-copilot-worker.service
```

---

## 3. Windows 11 Task Scheduler (Host Auto-Start)

WSL2 instances stop automatically if no Windows processes keep them active. A scheduled task starts WSL on Windows login and keeps it alive.

### 3.1 PowerShell Startup Script (`scripts/wsl-keepalive.ps1`)
Save this script on your Windows host (e.g. `E:\personal\career-copilot\scripts\wsl-keepalive.ps1`):

```powershell
# scripts/wsl-keepalive.ps1
# Keeps the WSL2 distribution alive and verifies that Career Copilot services are running.

param(
    [string]$Distro = "Ubuntu-D"
)

Write-Host "Initializing Career Copilot on WSL ($Distro)..." -ForegroundColor Cyan

# Trigger WSL distribution startup and ensure user systemd target is reached
wsl.exe -d $Distro -- bash -lc "systemctl --user start default.target"

# Verify health of the web server
$healthy = $false
for ($i = 1; $i -le 10; $i++) {
    Start-Sleep -Seconds 2
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/health" -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            Write-Host "Career Copilot Web Server is HEALTHY (200 OK)." -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "Waiting for service startup (attempt $i/10)..." -ForegroundColor Yellow
    }
}

if (-not $healthy) {
    Write-Warning "Career Copilot health check timed out. Inspect logs via 'journalctl --user -xeu career-copilot-web'."
}
```

### 3.2 Create the Windows Scheduled Task
You can register this task using PowerShell with Administrator privileges:

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File E:\personal\career-copilot\scripts\wsl-keepalive.ps1 -Distro Ubuntu-D"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Days 365)
Register-ScheduledTask -TaskName "CareerCopilotAutoStart" -Action $action -Trigger $trigger -Settings $settings -Description "Auto-starts Career Copilot services in WSL2 on Windows login."
```

---

## 4. Laptop Sleep, Hibernation & Gap Detection

### 4.1 Missed Job Sync Gap Detection
When a laptop sleeps or hibernates, scheduled cron jobs (`0 */6 * * *`) may miss their scheduled execution window.

Career Copilot includes built-in gap detection in `source-sync`:
- When the worker starts up, it inspects `job_sources` table.
- For each active source:
  $$\Delta t = \text{currentTime} - \text{lastSuccessAt}$$
- If $\Delta t > 1.25 \times \text{expectedInterval}$, the worker immediately enqueues a sync job rather than waiting for the next cron boundary.
- Database sync timestamps and retry counters are safely persisted across machine reboots.

### 4.2 Handling WSL Clock Drift
After waking from hibernation, WSL2 clocks can occasionally drift from the Windows host clock, causing SSL/TLS failures with Gemini API or external ATS endpoints.

WSL2 automatically syncs time via the Hyper-V time synchronization service, but if clock drift is observed:
```bash
# Force clock synchronization in WSL
sudo hwclock -s
```

---

## 5. WSLg Graphical Display Support (Headed Takeover)

Under Windows 11, WSL2 includes **WSLg** (Windows Subsystem for Linux GUI) natively:
- No third-party X-servers (like VcXsrv or Xming) are required.
- Playwright automatically uses WSLg when `DISPLAY=:0` and `WAYLAND_DISPLAY=wayland-0` are set.
- When an ATS presents a CAPTCHA or requires human intervention, the application enters `headed_takeover` mode:
  1. The worker launches Chromium in headed mode with the session cookie jar.
  2. A native Windows browser window appears on your desktop.
  3. You solve the CAPTCHA or fill out the complex form field.
  4. Clicking "Resume Automation" or closing the takeover dialog hands session state back to the headless pipeline.

### Verification Command
Verify WSLg functionality inside your WSL distribution:
```bash
wsl -d Ubuntu-D -- bash -lc "npx playwright launch --headless=false"
```
A blank Chromium window should appear on your Windows desktop.

---

## 6. Daily Operations Cheat Sheet

| Task | Command |
| :--- | :--- |
| **Check Web Server** | `curl http://127.0.0.1:3000/api/health` |
| **Check Web Logs** | `journalctl --user -u career-copilot-web.service -f` |
| **Check Worker Logs**| `journalctl --user -u career-copilot-worker.service -f` |
| **Restart Services** | `systemctl --user restart career-copilot-web career-copilot-worker` |
| **Create Manual Backup** | `npm run backup` |
| **Trigger Retention** | `npm run retention` |
| **Export User Data** | `npm run data:export` |
| **Stop All Services** | `systemctl --user stop career-copilot-web career-copilot-worker` |

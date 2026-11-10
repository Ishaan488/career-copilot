# 01 — Phase 0: Repository & Environment Audit

Audit date: 2026-11-10 (updated after user chose WSL2 as primary environment, Q10/Q11).

## 1. Repository
- `E:\personal\career-copilot` — new repo, docs only. Sibling projects in `E:\personal` are unrelated; MUST NOT be modified or imported.
- Q13 (open): move canonical working tree to WSL ext4 `~/dev/career-copilot`.

## 2. Windows host
| Item | Finding |
|------|---------|
| OS | Windows 11, 15.8 GB RAM, ~52 GB free on E: |
| Node / npm | v22.21.1 / 10.9.4 (Windows) — **not used for dev** (WSL is primary) |
| Git | 2.46.1 |
| Docker Desktop | 29.3.1 installed, **stopped** → not used |
| Python | 3.11 → not used |
| PostgreSQL (Windows) | 18.1 service `postgresql-x64-18` Running, Automatic; `port=5432`, `listen_addresses='*'`, `max_connections=100`, `shared_buffers=128MB` |

## 3. WSL2 findings (distro `Ubuntu-D`)
| Item | Finding |
|------|---------|
| Version | WSL2, Ubuntu 24.04.4 LTS, **systemd enabled** (`/etc/wsl.conf`), default user `ishaan` |
| Resources | ~7.8 GB RAM visible, ~948 GB disk free on ext4 |
| Node | **not installed** in WSL (`node: command not found`). `npm` resolves to the Windows npm via PATH interop → misleading; must install Node via nvm |
| Git | 2.43.0 |
| PostgreSQL | not installed |
| Windows interop | PATH appended (leak) — recommend `appendWindowsPath=false` |
| WSLg (headed browser) | **not verified** → M0 task |

## 4. PostgreSQL decision (Q11)
Options considered:
1. Reuse Windows PG 18: version suitable and running, but listens on all interfaces, lives outside the WSL dev environment, cross-OS networking (NAT/mirrored mode dependent), and DB backups/ownership split across OSes. **Rejected** for this project.
2. Docker: avoided per user.
3. **Native PostgreSQL 16 inside WSL2 via apt (chosen):** lightest reliable setup, systemd-managed, localhost-only, same OS as Node/Playwright, portable to a Linux VPS.
Minimum supported: PostgreSQL ≥ 15 (uses `gen_random_uuid()`, `pg_trgm`).
Informational for the user: the Windows PG 18 service accepts connections on all interfaces; consider restricting `listen_addresses`/firewall (not changed by this project).

## 5. M0 verification checklist (agent fills results here)
- [ ] User ran doc 16 §1 (nvm Node 22, apt postgresql, Playwright deps) — `which node` under `~/.nvm`
- [ ] `psql` connects as role `career` to `career_copilot` and `career_copilot_test`
- [ ] Extensions available: `pg_trgm`
- [ ] `npx playwright install chromium` succeeded; headless smoke OK
- [ ] WSLg headed smoke (`BROWSER_HEADLESS=false`) OK / not available (record)
- [ ] Repo at `~/dev/career-copilot`, `npm install` speed acceptable
- [ ] Idle RAM measured

## 6. Reuse / change / missing
Reuse: nothing. Missing: Node in WSL, PG in WSL, entire codebase. Unsuitable: `/mnt/e` as a working directory; Windows PATH leaking into WSL.

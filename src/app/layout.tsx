import type { ReactNode } from 'react';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { TopNav } from '@/components/TopNav';

export const metadata = {
  title: 'Career Copilot',
  description: 'AI-powered personal job discovery and application automation platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#f8fafc' }}>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <Sidebar />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <TopNav />
            <div style={{ flex: 1, padding: '1.5rem' }}>{children}</div>
          </div>
        </div>
      </body>
    </html>
  );
}

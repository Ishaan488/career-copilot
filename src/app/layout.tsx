import type { ReactNode } from 'react';

export const metadata = {
  title: 'Career Copilot',
  description: 'AI-powered personal job discovery and application automation platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>{children}</body>
    </html>
  );
}

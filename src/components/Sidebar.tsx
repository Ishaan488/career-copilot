import Link from 'next/link';

export function Sidebar() {
  const navSections = [
    {
      group: 'Work',
      items: [
        { label: 'Dashboard', href: '/' },
        { label: 'Jobs', href: '/jobs' },
        { label: 'Recommended', href: '/recommended' },
        { label: 'Saved', href: '/saved' },
        { label: 'Applications', href: '/applications' },
        { label: 'Review Center', href: '/review' },
      ],
    },
    {
      group: 'Discover',
      items: [
        { label: 'Companies', href: '/companies' },
        { label: 'Sources', href: '/sources' },
      ],
    },
    {
      group: 'Prepare',
      items: [
        { label: 'Resumes', href: '/resumes' },
        { label: 'Profile', href: '/profile' },
        { label: 'Preferences', href: '/preferences' },
        { label: 'Autonomy', href: '/autonomy' },
        { label: 'Reusable Q&A', href: '/reusable-answers' },
      ],
    },
    {
      group: 'System',
      items: [
        { label: 'Automation', href: '/automation' },
        { label: 'Notifications', href: '/notifications' },
        { label: 'Activity', href: '/activity' },
        { label: 'Settings', href: '/settings' },
      ],
    },
  ];

  return (
    <aside style={{ width: '240px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', minHeight: '100vh', padding: '1.25rem 1rem' }}>
      <div style={{ marginBottom: '1.5rem', paddingLeft: '0.5rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Career Copilot</h2>
        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Operations Assistant</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {navSections.map((section) => (
          <div key={section.group}>
            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', paddingLeft: '0.5rem' }}>
              {section.group}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    style={{
                      display: 'block',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.375rem',
                      fontSize: '0.875rem',
                      color: '#334155',
                      textDecoration: 'none',
                      fontWeight: '500',
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

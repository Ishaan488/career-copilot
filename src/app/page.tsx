import Link from 'next/link';

export default function DashboardPage() {
  const stats = [
    { label: 'New Today', count: 0, href: '/jobs?status=new', color: '#2563eb' },
    { label: 'Worth Considering', count: 0, href: '/recommended', color: '#16a34a' },
    { label: 'Needs Review', count: 0, href: '/review', color: '#d97706' },
    { label: 'In Progress', count: 0, href: '/applications?status=preparing', color: '#6366f1' },
  ];

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a', margin: '0 0 0.25rem 0' }}>Dashboard</h1>
        <p style={{ color: '#64748b', margin: 0, fontSize: '0.875rem' }}>
          Overview of your active job discovery pipeline and application workflows.
        </p>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            style={{
              display: 'block',
              background: '#ffffff',
              borderRadius: '0.5rem',
              padding: '1.25rem',
              border: '1px solid #e2e8f0',
              textDecoration: 'none',
            }}
          >
            <div style={{ fontSize: '0.8125rem', fontWeight: '500', color: '#64748b', marginBottom: '0.5rem' }}>
              {s.label}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: s.color }}>
              {s.count}
            </div>
          </Link>
        ))}
      </div>

      {/* Grid: Attention & Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Needs Attention */}
        <section style={{ background: '#ffffff', borderRadius: '0.5rem', border: '1px solid #e2e8f0', padding: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#0f172a', margin: '0 0 1rem 0' }}>
            Needs Your Attention
          </h2>
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
            Nothing needs review right now.
          </div>
        </section>

        {/* Recent Activity */}
        <section style={{ background: '#ffffff', borderRadius: '0.5rem', border: '1px solid #e2e8f0', padding: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#0f172a', margin: '0 0 1rem 0' }}>
            Recent Automation Activity
          </h2>
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>
            No recent activity recorded.
          </div>
        </section>
      </div>
    </main>
  );
}

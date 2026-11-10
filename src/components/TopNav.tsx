import { WorkerStatusPill } from './WorkerStatusPill';

export function TopNav() {
  return (
    <header
      style={{
        height: '60px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.5rem',
        background: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <input
          type="search"
          placeholder="Search jobs, companies... (Press / to focus)"
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px solid #cbd5e1',
            fontSize: '0.875rem',
            width: '280px',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <WorkerStatusPill />
      </div>
    </header>
  );
}

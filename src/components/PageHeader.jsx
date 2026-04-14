import { openMobileSidebar } from './Layout/Sidebar';

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div className="page-header-left">
        <button className="btn-icon mobile-menu-btn" onClick={openMobileSidebar}>☰</button>
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}

      <style>{`
        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 28px 12px;
          position: sticky;
          top: 0;
          background: var(--bg-main);
          z-index: 10;
          border-bottom: 1px solid var(--border);
        }
        .page-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .page-title { font-size: 1.35rem; }
        .page-subtitle { font-size: 0.78rem; color: var(--text-muted); margin-top: 2px; }
        .page-header-actions { display: flex; gap: 8px; }
        .mobile-menu-btn { display: none; }
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex; }
          .page-header { padding: 14px 16px 10px; }
        }
      `}</style>
    </header>
  );
}

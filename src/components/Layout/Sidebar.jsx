import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getQuotaEta, isAuthError } from '../../services/api';

const NAV_ITEMS = [
  { section: 'Utama' },
  { path: '/today',    icon: '☀️', label: 'Hari Ini' },
  { path: '/chat',     icon: '💬', label: 'Chat' },
  { section: 'Kelola' },
  { path: '/goals',    icon: '🎯', label: 'Goals' },
  { path: '/time',     icon: '⏰', label: 'Waktu' },
  { path: '/finance',  icon: '💰', label: 'Keuangan' },
  { section: 'Lainnya' },
  { path: '/memory',   icon: '🧠', label: 'Memory' },
  { path: '/strategy', icon: '📋', label: 'Strategi' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function Sidebar({ onOpenContextPanel }) {
  const [quotaState, setQuotaState] = useState('ok');

  useEffect(() => {
    let timer = null;

    const loadQuota = () => {
      getQuotaEta()
        .then(d => {
          if (d?.state) setQuotaState(d.state);
        })
        .catch((err) => {
          if (isAuthError(err) && timer) {
            clearInterval(timer);
            timer = null;
          }
        });
    };

    loadQuota();
    timer = setInterval(loadQuota, 60_000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  const dotClass = quotaState === 'ok' ? '' : quotaState === 'rate_limited' ? 'warning' : 'error';
  const quotaLabel = quotaState === 'ok' ? 'Log quota normal' : quotaState === 'rate_limited' ? 'Rate limited' : 'Daily limit';

  return (
    <>
      <aside className="sidebar" id="sidebar">
        <div className="sidebar-brand">
          <h2><span className="emoji">🤖</span> Felicia</h2>
          <div className="sidebar-brand-sub">Personal AI Assistant</div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item, i) => {
            if (item.section) {
              return <div key={i} className="nav-section-label">{item.section}</div>;
            }
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                onClick={() => closeMobileSidebar()}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="quota-mini">
            <span className={`quota-dot ${dotClass}`} />
            {quotaLabel}
          </div>
          <button
            className="sidebar-ctx-btn"
            onClick={() => { closeMobileSidebar(); onOpenContextPanel?.(); }}
            title="Konteks & Memory"
          >
            📦 Konteks &amp; Memory
          </button>
        </div>
      </aside>
      <div className="sidebar-overlay" id="sidebarOverlay" onClick={closeMobileSidebar} />
    </>
  );
}

function closeMobileSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('open');
}

export function openMobileSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebarOverlay')?.classList.add('open');
}

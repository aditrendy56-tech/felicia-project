import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

const highlights = [
  {
    title: 'Hari ini lebih cepat',
    text: 'Lihat jadwal, mode, dan quick ask dari satu halaman ringkas.',
  },
  {
    title: 'Memory tetap nyambung',
    text: 'Konversi transcript, simpan konteks, dan kelola ingatan personal.',
  },
  {
    title: 'Langsung masuk dashboard',
    text: 'Buka Today, Chat, Goals, Time, dan halaman lain tanpa ribet.',
  },
];

const stats = [
  { label: 'Mode aktif', value: 'DROP / CHAOS / OVERWORK' },
  { label: 'Integrasi', value: 'Supabase · Gemini · Calendar' },
  { label: 'Fokus', value: 'Personal AI command center' },
];

export default function LandingPage() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyOverflowY: body.style.overflowY,
      rootHeight: root?.style.height ?? '',
      rootMinHeight: root?.style.minHeight ?? '',
    };

    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    body.style.overflowY = 'auto';

    if (root) {
      root.style.height = 'auto';
      root.style.minHeight = '100%';
    }

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.overflowY = previous.bodyOverflowY;

      if (root) {
        root.style.height = previous.rootHeight;
        root.style.minHeight = previous.rootMinHeight;
      }
    };
  }, []);

  return (
    <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="landing-badge">Felicia Project</div>
          <h1>Personal AI assistant yang rapi, cepat, dan tetap nyambung ke hidupmu.</h1>
          <p>
            Landing page ini jadi pintu masuk ke dashboard Felicia — tempat buat cek jadwal,
            ngobrol, simpan memory, dan kelola mode harian tanpa harus buka banyak tab.
          </p>
          <div className="landing-actions">
            <Link className="btn btn-primary" to="/today">
              Buka Dashboard
            </Link>
            <Link className="btn btn-ghost" to="/chat">
              Masuk Chat
            </Link>
          </div>
          <div className="landing-stats">
            {stats.map((item) => (
              <div key={item.label} className="landing-stat">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-preview card">
          <div className="landing-preview-header">
            <span className="landing-window-dot" />
            <span className="landing-window-dot" />
            <span className="landing-window-dot" />
          </div>
          <div className="landing-preview-body">
            <div className="preview-panel preview-panel-main">
              <span className="preview-label">Today</span>
              <strong>Selamat datang kembali, Adit.</strong>
              <p>Agenda, mode, dan quick action tampil di satu tempat.</p>
            </div>
            <div className="preview-grid">
              <div className="preview-panel">
                <span className="preview-label">Schedule</span>
                <strong>09:00 – Meeting</strong>
                <p>Briefing tim dan update prioritas.</p>
              </div>
              <div className="preview-panel">
                <span className="preview-label">Memory</span>
                <strong>Context panel</strong>
                <p>Transcript, import JSON, dan note manual.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-highlights">
        {highlights.map((item) => (
          <article key={item.title} className="landing-card card">
            <h2>{item.title}</h2>
            <p>{item.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

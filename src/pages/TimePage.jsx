import PageHeader from '../components/PageHeader';
import './GenericPage.css';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 06:00 - 19:00

export default function TimePage() {
  return (
    <div className="time-page page-active">
      <PageHeader
        title="⏰ Waktu"
        subtitle="Calendar view & focus blocks"
      />

      <div className="generic-grid">
        {/* Today timeline */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-title">📅 Timeline Hari Ini</div>
          <div className="timeline">
            {HOURS.map(h => (
              <div key={h} className="timeline-row">
                <span className="timeline-hour">{String(h).padStart(2, '0')}:00</span>
                <div className="timeline-slot" />
              </div>
            ))}
          </div>
        </div>

        {/* Focus Blocks */}
        <div className="card">
          <div className="card-title">🎯 Focus Blocks</div>
          <div className="placeholder-content">
            <p className="text-muted">Atur waktu fokus untuk deep work.</p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>＋ Tambah Block</button>
          </div>
        </div>

        {/* Week Planner */}
        <div className="card">
          <div className="card-title">📋 Week Planner</div>
          <div className="placeholder-content">
            <p className="text-muted">Rencana minggu ini — coming soon.</p>
          </div>
        </div>

        {/* Insights */}
        <div className="card">
          <div className="card-title">📊 Time Insights</div>
          <div className="placeholder-content">
            <p className="text-muted">Analisis waktu — bagaimana kamu menghabiskan waktu minggu ini.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

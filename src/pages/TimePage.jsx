import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import { getEvents, deleteEventAction } from '../services/api';
import './GenericPage.css';

const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 06:00 - 19:00

function getTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function TimePage() {
  const [selectedDate, setSelectedDate] = useState(getTodayIso());
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    let isActive = true;
    setLoadingEvents(true);
    setEventsError('');

    getEvents(selectedDate)
      .then((data) => {
        if (!isActive) return;
        setEvents(Array.isArray(data?.events) ? data.events : []);
      })
      .catch((err) => {
        if (!isActive) return;
        setEvents([]);
        setEventsError(err?.message || 'Gagal memuat jadwal.');
      })
      .finally(() => {
        if (isActive) setLoadingEvents(false);
      });

    return () => {
      isActive = false;
    };
  }, [selectedDate]);

  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => (left.start || '').localeCompare(right.start || '')),
    [events]
  );

  async function handleDeleteEvent(eventId, summary) {
    if (!confirm(`Hapus event "${summary}"?`)) return;
    setDeletingId(eventId);
    setActionMsg('');
    try {
      const result = await deleteEventAction(eventId);
      setActionMsg(result?.message || 'Event berhasil dihapus.');
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setTimeout(() => setActionMsg(''), 3000);
    } catch (err) {
      setActionMsg(`❌ ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="time-page page-active">
      <PageHeader
        title="⏰ Waktu"
        subtitle="Calendar view & focus blocks"
      />

      <div className="generic-grid">
        {/* Today timeline */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-title">📅 Timeline Jadwal</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input
              className="input input-sm"
              style={{ maxWidth: 180 }}
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDate(getTodayIso())}>Hari Ini</button>
          </div>

          {loadingEvents ? (
            <>
              <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 16, width: '60%' }} />
            </>
          ) : eventsError ? (
            <p className="text-error" style={{ fontSize: '0.85rem' }}>⚠️ {eventsError}</p>
          ) : sortedEvents.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Tidak ada event untuk tanggal ini.</p>
          ) : (
            <div className="settings-list">
              {sortedEvents.map((eventItem) => (
                <div key={eventItem.id} className="settings-item" style={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{eventItem.summary || '(Tanpa judul)'}</div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                      {eventItem.start} — {eventItem.end}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleDeleteEvent(eventItem.id, eventItem.summary)}
                      disabled={deletingId === eventItem.id}
                      style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    >
                      {deletingId === eventItem.id ? '...' : '❌'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {actionMsg && (
            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8, padding: '6px 8px', background: 'var(--bg-hover)', borderRadius: 6 }}>
              {actionMsg}
            </div>
          )}

          <div className="timeline" style={{ marginTop: 14 }}>
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

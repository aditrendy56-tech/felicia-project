import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { sendChat, getQuotaEta, setMode, getEvents, isAuthError } from '../services/api';
import './TodayPage.css';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat Pagi';
  if (h < 15) return 'Selamat Siang';
  if (h < 18) return 'Selamat Sore';
  return 'Selamat Malam';
}

function formatDateID() {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function getEventTimeLabel(event) {
  const raw = event?.start || event?.startISO || event?.startTime || event?.dateTime || '';
  if (!raw) return '??:??';

  if (typeof raw === 'string' && /^\d{2}:\d{2}$/.test(raw)) return raw;
  if (typeof raw === 'string' && /^\d{2}\.\d{2}$/.test(raw)) return raw.replace('.', ':');
  if (typeof raw === 'string' && raw.length >= 16 && raw.includes('T')) {
    return raw.slice(11, 16).replace('.', ':');
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).replace('.', ':');
  }

  return '??:??';
}

function getWibDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getTodayCacheKey() {
  return `felicia_today_schedule_v2:${getWibDateKey()}`;
}

function getCachedTodaySchedule() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(getTodayCacheKey());
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.date || parsed.date !== getWibDateKey()) return null;
    if (!Array.isArray(parsed?.schedule)) return null;

    return parsed.schedule;
  } catch {
    return null;
  }
}

function saveCachedTodaySchedule(schedule) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(getTodayCacheKey(), JSON.stringify({
      date: getWibDateKey(),
      schedule,
      savedAt: new Date().toISOString(),
    }));
  } catch {
    // ignore storage quota / disabled storage
  }
}

function parseScheduleLine(line) {
  if (typeof line !== 'string') {
    return { time: '--:--', title: String(line || '') };
  }

  const splitIdx = line.indexOf(' - ');
  if (splitIdx === -1) {
    return { time: '--:--', title: line };
  }

  return {
    time: line.slice(0, splitIdx).trim(),
    title: line.slice(splitIdx + 3).trim(),
  };
}

export default function TodayPage() {
  const [schedule, setSchedule] = useState(() => getCachedTodaySchedule() || []);
  const [loadingSched, setLoadingSched] = useState(true);
  const [refreshingSched, setRefreshingSched] = useState(false);
  const [quotaState, setQuotaState] = useState(null);
  const [quickInput, setQuickInput] = useState('');
  const [quickReply, setQuickReply] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [modeLoading, setModeLoading] = useState(false);
  const [modeMsg, setModeMsg] = useState('');
  const [authHint, setAuthHint] = useState('');

  async function loadTodaySchedule({ forceRefresh = false } = {}) {
    if (!forceRefresh) {
      const cachedSchedule = getCachedTodaySchedule();

      if (cachedSchedule && cachedSchedule.length > 0) {
        setSchedule(cachedSchedule);
        setLoadingSched(false);
        setAuthHint('');
        return;
      }
    }

    if (forceRefresh) {
      setRefreshingSched(true);
    } else {
      setLoadingSched(true);
    }

    try {
      const d = await getEvents();
      setAuthHint('');

      if (d?.events && Array.isArray(d.events)) {
        const formatted = d.events.map(event => 
          `${getEventTimeLabel(event)} - ${event.summary || 'No title'}`
        );
        const finalSchedule = formatted.length > 0 ? formatted : ['Tidak ada jadwal hari ini'];
        setSchedule(finalSchedule);
        saveCachedTodaySchedule(finalSchedule);
      } else {
        const finalSchedule = ['Tidak ada jadwal hari ini'];
        setSchedule(finalSchedule);
        saveCachedTodaySchedule(finalSchedule);
      }
    } catch (err) {
      if (isAuthError(err)) {
        setAuthHint('🔐 API token belum diset / tidak valid. Data dashboard butuh autentikasi.');
        const finalSchedule = ['🔐 Pasang token API dulu untuk memuat jadwal.'];
        setSchedule(finalSchedule);
        saveCachedTodaySchedule(finalSchedule);
        return;
      }

      setSchedule(['Gagal memuat jadwal']);
    } finally {
      setLoadingSched(false);
      setRefreshingSched(false);
    }
  }

  useEffect(() => {
    loadTodaySchedule();

    // Quota
    getQuotaEta().then(setQuotaState).catch(() => {});
  }, []);

  async function handleRefreshSchedule() {
    if (loadingSched || refreshingSched) return;
    await loadTodaySchedule({ forceRefresh: true });
  }

  async function handleQuickAsk() {
    const text = quickInput.trim();
    if (!text || quickLoading) return;
    setQuickInput('');
    setQuickLoading(true);
    setQuickReply('');
    try {
      const d = await sendChat({ message: text, chatType: 'utama' });
      setQuickReply(d?.reply || 'Hmm, coba lagi nanti.');
    } catch (err) {
      setQuickReply(isAuthError(err) ? '🔐 API token belum valid. Set token dulu ya.' : '⚠️ Gagal menghubungi server.');
    } finally {
      setQuickLoading(false);
    }
  }

  async function handleSetMode(modeName) {
    if (modeLoading) return;
    setModeLoading(true);
    setModeMsg('');
    try {
      const result = await setMode(modeName);
      setModeMsg(result?.message || `Mode ${modeName} diaktifkan.`);
      setTimeout(() => setModeMsg(''), 4000);
    } catch (err) {
      setModeMsg(isAuthError(err) ? '🔐 API token belum valid. Tidak bisa set mode.' : `❌ Gagal aktivasi mode: ${err.message}`);
    } finally {
      setModeLoading(false);
    }
  }

  return (
    <div className="today-page page-active">
      <PageHeader
        title={`${getGreeting()}, Adit! ☀️`}
        subtitle={formatDateID()}
      />
      {authHint && <div className="text-muted" style={{ marginBottom: 10, fontSize: '0.85rem' }}>{authHint}</div>}

      <div className="today-grid">
        {/* ── Jadwal ── */}
        <div className="card today-card schedule-card">
          <div className="schedule-header">
            <div className="schedule-header-left">
              <div className="card-title">📅 Jadwal Hari Ini</div>
              {!loadingSched && (
                <div className="schedule-meta">
                  {schedule.some(item => String(item).toLowerCase().includes('tidak ada jadwal'))
                    ? 'Hari ini lebih longgar'
                    : `${schedule.length} aktivitas terjadwal`}
                </div>
              )}
            </div>
            <button
              className="btn btn-ghost btn-sm schedule-refresh-btn"
              onClick={handleRefreshSchedule}
              disabled={loadingSched || refreshingSched}
            >
              {refreshingSched ? 'Memuat...' : 'Refresh Jadwal'}
            </button>
          </div>
          {loadingSched ? (
            <div className="sched-skeleton" role="status" aria-live="polite">
              <div className="skeleton" style={{ height: 48, width: '100%', marginBottom: 10, borderRadius: 10 }} />
              <div className="skeleton" style={{ height: 48, width: '100%', marginBottom: 10, borderRadius: 10 }} />
              <div className="skeleton" style={{ height: 48, width: '100%', borderRadius: 10 }} />
            </div>
          ) : schedule.length === 0 ? (
            <div className="schedule-empty">
              <div className="schedule-empty-icon">🌤️</div>
              <p className="text-muted" style={{ fontSize: '0.88rem' }}>Tidak ada jadwal hari ini. Nikmati ritme santaimu ✨</p>
            </div>
          ) : (
            <ul className="sched-list">
              {schedule.map((line, i) => {
                const parsed = parseScheduleLine(line);
                const isMessageOnly = parsed.time === '--:--';

                return (
                  <li key={i} className={`sched-item ${isMessageOnly ? 'is-message' : ''}`}>
                    <div className="sched-time-pill">{parsed.time}</div>
                    <div className="sched-content">
                      <div className="sched-title">{parsed.title}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Tanya Felicia ── */}
        <div className="card today-card ask-card">
          <div className="card-title">💬 Tanya Felicia</div>
          <div className="ask-input-row">
            <input
              id="today-quick-ask"
              name="todayQuickAsk"
              className="input"
              placeholder="Tanya apa aja..."
              value={quickInput}
              onChange={e => setQuickInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQuickAsk()}
              disabled={quickLoading}
            />
            <button className="btn btn-primary" onClick={handleQuickAsk} disabled={quickLoading}>
              {quickLoading ? '...' : 'Kirim'}
            </button>
          </div>
          {quickReply && (
            <div className="ask-reply">
              <p>{quickReply}</p>
            </div>
          )}
        </div>

        {/* ── Quota Status ── */}
        <div className="card today-card quota-card">
          <div className="card-title">📦 Quota AI</div>
          {quotaState ? (
            <div className="quota-info">
              <span className={`badge ${quotaState.state === 'ok' ? 'badge-success' : quotaState.state === 'rate_limited' ? 'badge-warning' : 'badge-error'}`}>
                {quotaState.state === 'ok' ? '✅ OK' : quotaState.state === 'rate_limited' ? '⏳ Rate Limited' : '🚫 Daily Limit'}
              </span>
              {quotaState.warning && <p className="quota-warn">{quotaState.warning}</p>}
            </div>
          ) : (
            <div className="skeleton" style={{ height: 20, width: '50%' }} />
          )}
        </div>

        {/* ── Goals Preview ── */}
        <div className="card today-card goals-preview-card">
          <div className="card-title">🎯 Goals</div>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>Coming soon — lacak target mingguan & bulananmu di sini.</p>
        </div>

        {/* ── Finance Preview ── */}
        <div className="card today-card finance-preview-card">
          <div className="card-title">💰 Keuangan</div>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>Coming soon — tracking pemasukan & pengeluaran harian.</p>
        </div>

        {/* ── Quick Actions ── */}
        <div className="card today-card quick-card">
          <div className="card-title">⚡ Quick Mode Actions</div>
          <div className="quick-buttons">
            <button className="btn btn-ghost btn-sm" onClick={() => handleSetMode('drop')} disabled={modeLoading}>😮‍💨 DROP</button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleSetMode('chaos')} disabled={modeLoading}>🌀 CHAOS</button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleSetMode('overwork')} disabled={modeLoading}>🛑 OVERWORK</button>
          </div>
          {modeMsg && (
            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8, padding: '6px 8px', background: 'var(--bg-hover)', borderRadius: 6 }}>
              {modeMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

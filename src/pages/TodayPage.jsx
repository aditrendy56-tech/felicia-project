import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { sendChat, getQuotaEta, setMode } from '../services/api';
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

export default function TodayPage() {
  const [schedule, setSchedule] = useState([]);
  const [loadingSched, setLoadingSched] = useState(true);
  const [quotaState, setQuotaState] = useState(null);
  const [quickInput, setQuickInput] = useState('');
  const [quickReply, setQuickReply] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);
  const [modeLoading, setModeLoading] = useState(false);
  const [modeMsg, setModeMsg] = useState('');

  useEffect(() => {
    // Fetch today's schedule
    sendChat({ message: 'jadwal hari ini', chatType: 'utama' })
      .then(d => {
        if (d?.reply) {
          // Parse reply text into simple items
          const lines = d.reply.split('\n').filter(l => l.trim());
          setSchedule(lines);
        }
      })
      .catch(() => setSchedule(['Gagal memuat jadwal']))
      .finally(() => setLoadingSched(false));

    // Quota
    getQuotaEta().then(setQuotaState).catch(() => {});
  }, []);

  async function handleQuickAsk() {
    const text = quickInput.trim();
    if (!text || quickLoading) return;
    setQuickInput('');
    setQuickLoading(true);
    setQuickReply('');
    try {
      const d = await sendChat({ message: text, chatType: 'utama' });
      setQuickReply(d?.reply || 'Hmm, coba lagi nanti.');
    } catch {
      setQuickReply('⚠️ Gagal menghubungi server.');
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
      setModeMsg(`❌ Gagal aktivasi mode: ${err.message}`);
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

      <div className="today-grid">
        {/* ── Jadwal ── */}
        <div className="card today-card schedule-card">
          <div className="card-title">📅 Jadwal Hari Ini</div>
          {loadingSched ? (
            <div className="sched-skeleton">
              <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 16, width: '60%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 16, width: '70%' }} />
            </div>
          ) : schedule.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Tidak ada jadwal hari ini 🎉</p>
          ) : (
            <ul className="sched-list">
              {schedule.map((line, i) => (
                <li key={i} className="sched-item">{line}</li>
              ))}
            </ul>
          )}
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

        {/* ── Tanya Felicia ── */}
        <div className="card today-card ask-card">
          <div className="card-title">💬 Tanya Felicia</div>
          <div className="ask-input-row">
            <input
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
      </div>
    </div>
  );
}

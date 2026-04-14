import { useState } from 'react';
import { convertTranscript, importMemoryItems } from '../services/api';
import './ContextMemoryPanel.css';

/* ── Example templates ── */
const SEED_TEMPLATE = JSON.stringify([
  {
    category: 'personal',
    topicKey: 'hobby_coding',
    content: 'Suka coding dan explore teknologi baru',
    memoryType: 'fact',
  },
  {
    category: 'skill',
    topicKey: 'skill_python',
    content: 'Mahir Python dan data science',
    memoryType: 'fact',
  },
  {
    category: 'event',
    content: 'Selesai project freelance pertama',
    eventDate: '2024-06-01',
    memoryType: 'event',
  },
], null, 2);

const TRANSCRIPT_TEMPLATE = `[You]: Halo, aku lagi ngerjain project React nih
[Felicia]: Wah, project apa yang kamu bikin?
[You]: Bikin dashboard buat visualisasi data penjualan
[Felicia]: Keren! Pakai library apa?
[You]: Recharts, lumayan gampang dipakenya`;

/* ── Panel component ── */
export default function ContextMemoryPanel({ isOpen, onClose }) {
  /* ── Transcript state ── */
  const [transcript, setTranscript] = useState('');
  const [txDate, setTxDate] = useState('');
  const [txStart, setTxStart] = useState('');
  const [txEnd, setTxEnd] = useState('');
  const [txSplit, setTxSplit] = useState('auto');
  const [txLoading, setTxLoading] = useState(false);
  const [txResult, setTxResult] = useState('');
  const [txError, setTxError] = useState('');

  /* ── Import JSON state ── */
  const [importJson, setImportJson] = useState('');
  const [importDate, setImportDate] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [importError, setImportError] = useState('');

  /* ── Toast ── */
  const [toast, setToast] = useState('');
  const showToast = (msg, isError = false) => {
    setToast(isError ? `❌ ${msg}` : `✅ ${msg}`);
    setTimeout(() => setToast(''), 3500);
  };

  /* ── Convert transcript handler ── */
  async function handleConvert() {
    if (!transcript.trim()) return showToast('Transcript kosong', true);
    setTxLoading(true);
    setTxError('');
    setTxResult('');
    try {
      const data = await convertTranscript({
        transcript: transcript.trim(),
        eventDate: txDate || null,
        startDate: txStart || null,
        endDate: txEnd || null,
        splitMode: txSplit,
      });
      const items = data?.items ?? [];
      if (items.length === 0) {
        setTxError('Tidak ada item yang berhasil di-convert.');
      } else {
        const limited = items.slice(0, 40);
        setTxResult(JSON.stringify(limited, null, 2));
        setImportJson(JSON.stringify(limited, null, 2));
        showToast(`${limited.length} item siap di-import (lihat tab Import JSON)`);
      }
    } catch (e) {
      setTxError(e.message);
      showToast(e.message, true);
    } finally {
      setTxLoading(false);
    }
  }

  /* ── Import JSON handler ── */
  async function handleImport() {
    if (!importJson.trim()) return showToast('JSON kosong', true);
    let items;
    try {
      items = JSON.parse(importJson);
      if (!Array.isArray(items)) throw new Error('Harus array JSON');
      if (items.length > 120) {
        showToast('Max 120 items. Hapus sebagian lalu coba lagi.', true);
        return;
      }
    } catch (e) {
      setImportError(`JSON tidak valid: ${e.message}`);
      showToast(`JSON tidak valid: ${e.message}`, true);
      return;
    }
    setImportLoading(true);
    setImportError('');
    setImportMsg('');
    try {
      const result = await importMemoryItems(items, importDate || null);
      const msg = `✅ Import selesai — ${result.imported ?? 0} imported, ${result.skipped ?? 0} skipped`;
      setImportMsg(msg);
      showToast(msg.replace('✅ ', ''));
    } catch (e) {
      setImportError(e.message);
      showToast(e.message, true);
    } finally {
      setImportLoading(false);
    }
  }

  /* ── Active tab ── */
  const [tab, setTab] = useState('transcript');

  if (!isOpen) return null;

  return (
    <>
      <div className="cmp-overlay" onClick={onClose} />
      <aside className="cmp-panel">
        <div className="cmp-header">
          <span className="cmp-title">📦 Konteks &amp; Memory</span>
          <button className="cmp-close" onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        {/* Tabs */}
        <div className="cmp-tabs">
          <button className={`cmp-tab ${tab === 'transcript' ? 'active' : ''}`} onClick={() => setTab('transcript')}>
            🗒️ Convert Transcript
          </button>
          <button className={`cmp-tab ${tab === 'import' ? 'active' : ''}`} onClick={() => setTab('import')}>
            📥 Import JSON
          </button>
        </div>

        <div className="cmp-body">

          {/* ── Tab: Convert Transcript ── */}
          {tab === 'transcript' && (
            <div className="cmp-section">
              <p className="cmp-desc">
                Paste chat transcript mentah (format <code>[You]: ...</code> / <code>[Felicia]: ...</code>).
                Felicia akan extract memory-memory penting dari percakapan.
              </p>

              <div className="cmp-field">
                <label className="cmp-label">Transcript</label>
                <textarea
                  className="cmp-textarea tall"
                  placeholder="[You]: ...\n[Felicia]: ..."
                  value={transcript}
                  onChange={e => setTranscript(e.target.value)}
                />
                <button
                  className="cmp-link-btn"
                  onClick={() => setTranscript(TRANSCRIPT_TEMPLATE)}
                >
                  Contoh transcript
                </button>
              </div>

              <div className="cmp-row">
                <div className="cmp-field">
                  <label className="cmp-label">Tanggal (opsional)</label>
                  <input className="input input-sm" type="date" value={txDate} onChange={e => setTxDate(e.target.value)} />
                </div>
                <div className="cmp-field">
                  <label className="cmp-label">Mulai</label>
                  <input className="input input-sm" type="date" value={txStart} onChange={e => setTxStart(e.target.value)} />
                </div>
                <div className="cmp-field">
                  <label className="cmp-label">Akhir</label>
                  <input className="input input-sm" type="date" value={txEnd} onChange={e => setTxEnd(e.target.value)} />
                </div>
                <div className="cmp-field">
                  <label className="cmp-label">Split mode</label>
                  <select className="input input-sm" value={txSplit} onChange={e => setTxSplit(e.target.value)}>
                    <option value="auto">auto</option>
                    <option value="monthly">monthly</option>
                    <option value="none">none</option>
                  </select>
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleConvert}
                disabled={txLoading}
              >
                {txLoading ? '⏳ Converting…' : '⚡ Convert'}
              </button>

              {txError && <p className="cmp-error">{txError}</p>}

              {txResult && (
                <div className="cmp-field" style={{ marginTop: 12 }}>
                  <label className="cmp-label">Hasil (sudah otomatis masuk tab Import JSON)</label>
                  <textarea className="cmp-textarea" value={txResult} readOnly />
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: 6 }}
                    onClick={() => setTab('import')}
                  >
                    Lanjut ke Import JSON →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Import JSON ── */}
          {tab === 'import' && (
            <div className="cmp-section">
              <p className="cmp-desc">
                Import memory dalam format JSON array. Max <strong>120 item</strong> per import.
                Duplikat akan otomatis di-skip.
              </p>

              <div className="cmp-field">
                <label className="cmp-label">JSON Array</label>
                <textarea
                  className="cmp-textarea tall"
                  placeholder='[{"category":"personal","topicKey":"...","content":"..."}]'
                  value={importJson}
                  onChange={e => setImportJson(e.target.value)}
                />
                <button
                  className="cmp-link-btn"
                  onClick={() => setImportJson(SEED_TEMPLATE)}
                >
                  Contoh format
                </button>
              </div>

              <div className="cmp-field" style={{ maxWidth: 220 }}>
                <label className="cmp-label">Context date (opsional)</label>
                <input
                  className="input input-sm"
                  type="date"
                  value={importDate}
                  onChange={e => setImportDate(e.target.value)}
                />
              </div>

              <div className="cmp-format-hint">
                <strong>Format tiap item:</strong>
                <code>category</code>, <code>content</code> (wajib),
                <code>topicKey</code>, <code>memoryType</code> (fact/event/preference),
                <code>eventDate</code>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={importLoading}
              >
                {importLoading ? '⏳ Importing…' : '📥 Import JSON'}
              </button>

              {importError && <p className="cmp-error">{importError}</p>}
              {importMsg && <p className="cmp-success">{importMsg}</p>}
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && <div className="cmp-toast">{toast}</div>}
      </aside>
    </>
  );
}

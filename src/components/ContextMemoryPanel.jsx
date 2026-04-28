import { useState } from 'react';
import { convertTranscript, importMemoryItems, saveMemory } from '../services/api';
import './ContextMemoryPanel.css';

/* ── Example templates ── */
const SEED_TEMPLATE = JSON.stringify([
  {
    category: 'identity',
    topicKey: 'name_user',
    content: 'Nama saya adalah User, seorang developer dan entrepreneur yang fokus pada teknologi AI dan personal productivity',
    memoryType: 'fact',
  },
  {
    category: 'skill',
    topicKey: 'skill_fullstack',
    content: 'Mahir dalam full-stack development dengan React, Node.js, dan Python. Sering menggunakan Vite untuk build tools',
    memoryType: 'fact',
  },
  {
    category: 'skill',
    topicKey: 'skill_ai',
    content: 'Berpengalaman dengan AI integration, termasuk Gemini API dan machine learning untuk personal assistants',
    memoryType: 'fact',
  },
  {
    category: 'goal',
    topicKey: 'goal_felicia',
    content: 'Sedang mengembangkan Felicia sebagai personal AI assistant yang comprehensive dengan memory, calendar, dan mode management',
    memoryType: 'fact',
  },
  {
    category: 'preference',
    topicKey: 'work_style',
    content: 'Lebih suka bekerja secara efisien dengan tools otomatisasi, menghindari repetitive tasks, dan fokus pada high-impact activities',
    memoryType: 'preference',
  },
  {
    category: 'personal',
    topicKey: 'hobby_tech',
    content: 'Hobby utama adalah explore teknologi baru, coding projects, dan membaca tentang AI dan productivity',
    memoryType: 'fact',
  },
  {
    category: 'event',
    topicKey: 'milestone_project',
    content: 'Baru saja menyelesaikan integrasi memory panel dan calendar actions di Felicia project',
    eventDate: '2024-12-01',
    memoryType: 'event',
  },
  {
    category: 'goal',
    topicKey: 'productivity_focus',
    content: 'Target untuk meningkatkan productivity dengan mode management (drop, chaos, overwork) dan time blocking',
    memoryType: 'goal',
  },
  {
    category: 'preference',
    topicKey: 'communication_style',
    content: 'Komunikasi langsung dan actionable, suka feedback real-time dan error handling yang jelas',
    memoryType: 'preference',
  },
  {
    category: 'skill',
    topicKey: 'skill_deployment',
    content: 'Berpengalaman dengan deployment ke Vercel, git workflows, dan CI/CD untuk web applications',
    memoryType: 'fact',
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

  /* ── Manual memory state ── */
  const [manualCategory, setManualCategory] = useState('personal');
  const [manualTitle, setManualTitle] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const [manualMsg, setManualMsg] = useState('');
  const [manualError, setManualError] = useState('');

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

  /* ── Manual save handler ── */
  async function handleManualSave() {
    const content = manualContent.trim();
    if (!content) {
      showToast('Isi memory tidak boleh kosong', true);
      return;
    }

    setManualLoading(true);
    setManualError('');
    setManualMsg('');

    try {
      const result = await saveMemory({
        content,
        category: manualCategory,
        title: manualTitle.trim() || null,
      });

      const note = result?.note || 'Memory berhasil disimpan.';
      setManualMsg(note);
      setManualTitle('');
      setManualContent('');
      showToast('Memory berhasil disimpan');
    } catch (e) {
      const msg = e?.message || 'Gagal menyimpan memory.';
      setManualError(msg);
      showToast(msg, true);
    } finally {
      setManualLoading(false);
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
          <button className={`cmp-tab ${tab === 'manual' ? 'active' : ''}`} onClick={() => setTab('manual')}>
            ✍️ Add Manual
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
                  id="cmp-transcript"
                  name="transcript"
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
                  <input id="cmp-tx-date" name="txDate" className="input input-sm" type="date" value={txDate} onChange={e => setTxDate(e.target.value)} />
                </div>
                <div className="cmp-field">
                  <label className="cmp-label">Mulai</label>
                  <input id="cmp-tx-start" name="txStart" className="input input-sm" type="date" value={txStart} onChange={e => setTxStart(e.target.value)} />
                </div>
                <div className="cmp-field">
                  <label className="cmp-label">Akhir</label>
                  <input id="cmp-tx-end" name="txEnd" className="input input-sm" type="date" value={txEnd} onChange={e => setTxEnd(e.target.value)} />
                </div>
                <div className="cmp-field">
                  <label className="cmp-label">Split mode</label>
                  <select id="cmp-tx-split" name="txSplit" className="input input-sm" value={txSplit} onChange={e => setTxSplit(e.target.value)}>
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
                  id="cmp-import-json"
                  name="importJson"
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
                  id="cmp-import-date"
                  name="importDate"
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

          {/* ── Tab: Manual Add ── */}
          {tab === 'manual' && (
            <div className="cmp-section">
              <p className="cmp-desc">
                Simpan memory tunggal secara langsung ke database. Cocok untuk fakta penting yang ingin dikunci cepat.
              </p>

              <div className="cmp-field" style={{ maxWidth: 260 }}>
                <label className="cmp-label">Kategori</label>
                <select
                  id="cmp-manual-category"
                  name="manualCategory"
                  className="input input-sm"
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value)}
                >
                  <option value="personal">personal</option>
                  <option value="identity">identity</option>
                  <option value="goal">goal</option>
                  <option value="event">event</option>
                  <option value="strategy">strategy</option>
                  <option value="preference">preference</option>
                  <option value="general">general</option>
                </select>
              </div>

              <div className="cmp-field">
                <label className="cmp-label">Judul Konteks (opsional)</label>
                <input
                  id="cmp-manual-title"
                  name="manualTitle"
                  className="input input-sm"
                  type="text"
                  placeholder="Contoh: Strategi Naikin Berat Badan"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                />
              </div>

              <div className="cmp-field">
                <label className="cmp-label">Isi Memory</label>
                <textarea
                  id="cmp-manual-content"
                  name="manualContent"
                  className="cmp-textarea"
                  placeholder="Contoh: Target income April final 11 juta"
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleManualSave}
                disabled={manualLoading}
              >
                {manualLoading ? '⏳ Menyimpan…' : '💾 Simpan Memory'}
              </button>

              {manualError && <p className="cmp-error">{manualError}</p>}
              {manualMsg && <p className="cmp-success">{manualMsg}</p>}
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && <div className="cmp-toast">{toast}</div>}
      </aside>
    </>
  );
}

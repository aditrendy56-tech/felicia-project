import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { openMobileSidebar } from '../components/Layout/Sidebar';
import {
  listThreads,
  createThread,
  deleteThread,
  getMessages,
  sendChat,
  renameThread,
  getQuotaEta,
  getCaseSuggestions,
  createCaseAutoAction,
  updateCaseAction,
  isAuthError,
} from '../services/api';
import './ChatPage.css';

const CHAT_TYPES = [
  { key: 'utama',     label: '⚡ Utama',     color: 'var(--utama)' },
  { key: 'refleksi',  label: '💜 Refleksi',  color: 'var(--refleksi)' },
  { key: 'strategi',  label: '🧠 Strategi',  color: 'var(--strategi)' },
];

const RUN_MODES = [
  { key: 'system', label: 'System' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'ai', label: 'AI' },
];

export default function ChatPage() {
  const { openContextPanel } = useOutletContext() || {};
  const [chatType, setChatType] = useState('utama');
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [quota, setQuota] = useState(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [caseSuggestions, setCaseSuggestions] = useState([]);
  const [showCaseSuggestions, setShowCaseSuggestions] = useState(false);
  const [authHint, setAuthHint] = useState('');
  const [runMode, setRunMode] = useState('system');
  const [assistantState, setAssistantState] = useState('idle');
  const [micSupported, setMicSupported] = useState(false);
  const [micListening, setMicListening] = useState(false);
  // ✨ Phase 3: Case action confirmation
  const [caseActionModal, setCaseActionModal] = useState(null);
  const msgEnd = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  // Load threads when chatType changes
  useEffect(() => {
    setLoadingThreads(true);
    setActiveThread(null);
    setMessages([]);
    listThreads(chatType)
      .then(d => {
        setThreads(d.threads || []);
        setAuthHint('');
      })
      .catch((err) => {
        setThreads([]);
        if (isAuthError(err)) {
          setAuthHint('🔐 API token belum diset / tidak valid. Thread tidak bisa dimuat.');
        }
      })
      .finally(() => setLoadingThreads(false));
  }, [chatType]);

  // Load quota
  useEffect(() => {
    getQuotaEta().then(setQuota).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicSupported(false);
      return;
    }

    setMicSupported(true);
    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => {
      setMicListening(true);
      setAssistantState('listening');
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };

    recognition.onend = () => {
      setMicListening(false);
      setAssistantState('idle');
    };

    recognition.onerror = () => {
      setMicListening(false);
      setAssistantState('idle');
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
      recognitionRef.current = null;
    };
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load messages when thread selected
  const selectThread = useCallback(async (thread) => {
    setActiveThread(thread);
    setMessages([]);
    try {
      const d = await getMessages(thread.id, 50);
      setMessages(d.messages || []);
    } catch (err) {
      setMessages([]);
      if (isAuthError(err)) {
        setAuthHint('🔐 API token belum valid. Riwayat chat tidak bisa dimuat.');
      }
    }
    // On mobile, close thread sidebar
    if (window.innerWidth <= 768) setSideOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ✨ Phase 2: Analyze case suggestions when typing
  useEffect(() => {
    if (input.length > 10) {
      if (authHint) {
        setShowCaseSuggestions(false);
        return;
      }
      const timer = setTimeout(async () => {
        try {
          const result = await getCaseSuggestions(input);
          if (result?.suggestions && result.suggestions.length > 0) {
            setCaseSuggestions(result.suggestions);
            setShowCaseSuggestions(true);
          } else {
            setShowCaseSuggestions(false);
          }
        } catch (err) {
          if (!isAuthError(err)) {
            console.error('Error getting case suggestions:', err);
          }
          setShowCaseSuggestions(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setShowCaseSuggestions(false);
    }
  }, [input, authHint]);

  // ✨ Phase 3: Handle case action confirmation
  const handleCaseActionConfirm = async () => {
    if (!caseActionModal) return;

    try {
      if (caseActionModal.type === 'create_case') {
        const params = caseActionModal.params;
        await createCaseAutoAction({
          title: params.title,
          category: params.category || 'general',
          summary: params.summary || '',
          entities: params.entities || [],
        });
        const confirmMsg = `✅ Case "${params.title}" berhasil dibuat!`;
        setMessages(prev => [...prev, { role: 'system', content: confirmMsg, created_at: new Date().toISOString() }]);
      } else if (caseActionModal.type === 'update_case') {
        const params = caseActionModal.params;
        await updateCaseAction(params.caseId, params.detail);
        const confirmMsg = `✅ Case berhasil diupdate!`;
        setMessages(prev => [...prev, { role: 'system', content: confirmMsg, created_at: new Date().toISOString() }]);
      }
    } catch (err) {
      console.error('Error handling case action:', err);
      const errorMsg = `⚠️ Ada kesalahan saat membuat/update case: ${err.message}`;
      setMessages(prev => [...prev, { role: 'system', content: errorMsg, created_at: new Date().toISOString() }]);
    } finally {
      setCaseActionModal(null);
    }
  };

  const handleCaseActionCancel = () => {
    setCaseActionModal(null);
  };

  async function handleNewThread() {
    try {
      const d = await createThread(chatType);
      if (d.thread) {
        setThreads(prev => [d.thread, ...prev]);
        selectThread(d.thread);
      }
    } catch (err) {
      if (isAuthError(err)) {
        setAuthHint('🔐 API token belum valid. Tidak bisa membuat thread baru.');
      }
    }
  }

  async function handleDeleteThread(threadId, e) {
    e.stopPropagation();
    if (!confirm('Hapus thread ini?')) return;
    try {
      await deleteThread(threadId);
      setThreads(prev => prev.filter(t => t.id !== threadId));
      if (activeThread?.id === threadId) {
        setActiveThread(null);
        setMessages([]);
      }
    } catch {}
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');

    // If no active thread, create one first
    let threadId = activeThread?.id;
    if (!threadId) {
      try {
        const d = await createThread(chatType);
        if (d.thread) {
          setThreads(prev => [d.thread, ...prev]);
          setActiveThread(d.thread);
          threadId = d.thread.id;
        }
      } catch (err) {
        if (isAuthError(err)) {
          setAuthHint('🔐 API token belum valid. Kirim pesan belum bisa dilakukan.');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: '🔐 API token belum valid. Pasang token dulu, lalu coba lagi.',
            created_at: new Date().toISOString(),
          }]);
        }
        return;
      }
    }

    // Optimistic user message
    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setAssistantState('thinking');

    try {
      const d = await sendChat({ message: text, chatType, threadId, runMode });
      const reply = d?.reply || d?.error || 'Hmm, aku nggak bisa jawab sekarang.';
      const botMsg = { role: 'assistant', content: reply, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, botMsg]);
      setAssistantState('speaking');
      setTimeout(() => setAssistantState('idle'), 1000);

      // ✨ Phase 3: Handle case actions
      if (d?.action === 'create_case_auto' && d?.type === 'action') {
        setCaseActionModal({
          type: 'create_case',
          action: d?.action,
          params: d?.params || {},
          message: reply,
          threadId,
        });
      } else if (d?.action === 'update_case' && d?.type === 'action') {
        setCaseActionModal({
          type: 'update_case',
          action: d?.action,
          params: d?.params || {},
          message: reply,
          threadId,
        });
      }

      // Auto-rename thread if it's the first message
      if (messages.length === 0 && threadId) {
        const shortTitle = text.length > 40 ? text.substring(0, 40) + '...' : text;
        renameThread(threadId, shortTitle).catch(() => {});
        setThreads(prev =>
          prev.map(t => t.id === threadId ? { ...t, title: shortTitle } : t)
        );
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: isAuthError(err) ? '🔐 API token belum valid. Pasang token dulu, lalu coba lagi.' : '⚠️ Gagal menghubungi server.',
        created_at: new Date().toISOString(),
      }]);
      setAssistantState('idle');
      if (isAuthError(err)) {
        setAuthHint('🔐 API token belum valid. Semua endpoint chat memerlukan autentikasi.');
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function toggleMic() {
    if (!micSupported || !recognitionRef.current) return;
    if (micListening) {
      recognitionRef.current.stop();
      return;
    }
    try {
      recognitionRef.current.start();
    } catch {}
  }

  const assistantLabel =
    assistantState === 'listening' ? 'Listening' :
    assistantState === 'thinking' ? 'Thinking' :
    assistantState === 'speaking' ? 'Responding' :
    'Ready';

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const currentColor = CHAT_TYPES.find(t => t.key === chatType)?.color || 'var(--primary)';

  return (
    <div className="chat-page">
      {/* ── Chat Sidebar (thread list) ── */}
      <div className={`chat-sidebar ${sideOpen ? 'open' : ''}`}>
        {/* Type tabs */}
        <div className="chat-type-tabs">
          {CHAT_TYPES.map(ct => (
            <button
              key={ct.key}
              className={`chat-type-tab ${chatType === ct.key ? 'active' : ''}`}
              style={chatType === ct.key ? { borderBottomColor: ct.color } : {}}
              onClick={() => setChatType(ct.key)}
            >
              {ct.label}
            </button>
          ))}
        </div>

        {/* New thread btn */}
        <button className="btn btn-primary new-thread-btn" onClick={handleNewThread}>
          ＋ Thread Baru
        </button>

        {/* Thread list */}
        <div className="thread-list">
          {loadingThreads ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton thread-skeleton" />
            ))
          ) : threads.length === 0 ? (
            <p className="text-muted thread-empty">Belum ada thread.</p>
          ) : (
            threads.map(t => (
              <div
                key={t.id}
                className={`thread-item ${activeThread?.id === t.id ? 'active' : ''}`}
                onClick={() => selectThread(t)}
              >
                <div className="thread-item-title">{t.title || 'Untitled'}</div>
                <div className="thread-item-meta">
                  {new Date(t.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </div>
                <button
                  className="thread-delete-btn"
                  onClick={(e) => handleDeleteThread(t.id, e)}
                  title="Hapus"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* Quota badge */}
        {quota && (
          <div className="chat-sidebar-footer">
            <span className={`badge ${quota.state === 'ok' ? 'badge-success' : quota.state === 'rate_limited' ? 'badge-warning' : 'badge-error'}`}>
              {quota.state === 'ok' ? '✅ Quota OK' : '⏳ ' + (quota.warning || quota.state)}
            </span>
          </div>
        )}
      </div>

      {/* ── Main chat area ── */}
      <div className="chat-main">
        {/* Header */}
        <div className="chat-main-header">
          <div className="chat-main-header-left">
            <button className="btn-icon" onClick={() => setSideOpen(!sideOpen)}>
              {sideOpen ? '◀' : '▶'}
            </button>
            <button className="btn-icon mobile-menu-btn-chat" onClick={openMobileSidebar}>☰</button>
            <div className="chat-type-dot" style={{ background: currentColor }} />
            <span className="chat-thread-name">
              {activeThread?.title || 'New Chat'}
            </span>
          </div>
          <div className="chat-main-header-right">
            <div className="jarvis-header-control">
              <div className={`jarvis-orb ${assistantState}`} />
              <span className="jarvis-label">{assistantLabel}</span>
            </div>
            <div className="run-mode-toggle" role="tablist" aria-label="Run mode">
              {RUN_MODES.map((mode) => (
                <button
                  key={mode.key}
                  className={`run-mode-btn ${runMode === mode.key ? 'active' : ''}`}
                  onClick={() => setRunMode(mode.key)}
                  type="button"
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => openContextPanel?.()} title="Konteks & Memory">
              📦 Konteks
            </button>
          </div>
        </div>
        {authHint && <div className="text-muted" style={{ margin: '6px 12px', fontSize: '0.82rem' }}>{authHint}</div>}

        {/* Messages */}
        <div className="chat-messages">
          {!activeThread ? (
            <div className="chat-welcome">
              <div className="chat-welcome-icon">💬</div>
              <h3>Mulai percakapan baru</h3>
              <p className="text-muted">Pilih thread di sebelah kiri, atau langsung ketik pesan.</p>
              <div className="chat-quick-btns">
                <button className="btn btn-ghost btn-sm" onClick={() => setInput('Jadwal hari ini apa?')}>📅 Jadwal</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setInput('Status mode')}>📊 Status</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setInput('Kasih saran buat hari ini')}>💡 Saran</button>
              </div>
            </div>
          ) : messages.length === 0 && !loading ? (
            <div className="chat-welcome">
              <p className="text-muted">Thread kosong. Mulai chat! 🚀</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role === 'user' ? 'user' : 'bot'}`}>
                <div className="chat-bubble-content">{m.content}</div>
                <div className="chat-bubble-time">
                  {new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="chat-bubble bot">
              <div className="chat-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={msgEnd} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <div className="chat-input-toolbar">
            <button
              type="button"
              className={`chat-mic-btn ${micListening ? 'live' : ''}`}
              onClick={toggleMic}
              disabled={!micSupported}
              title={micSupported ? 'Push-to-talk' : 'Microphone not supported in this browser'}
            >
              {micListening ? '🔴 Mic On' : '🎤 Mic'}
            </button>
            <span className="chat-mode-hint">
              Mode aktif: <strong>{RUN_MODES.find((m) => m.key === runMode)?.label}</strong>
            </span>
          </div>
          <div className="chat-input-wrapper">
            <textarea
              id="chat-message-input"
              name="chatMessage"
              ref={inputRef}
              className="chat-input"
              rows={1}
              placeholder="Ketik pesan..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={loading || !input.trim()}
            >
              ➤
            </button>
          </div>

          {/* ✨ Phase 2: Case Suggestions Panel */}
          {showCaseSuggestions && caseSuggestions.length > 0 && (
            <div className="case-suggestions-panel">
              <div className="suggestions-header">
                <span>🎯 Possible Cases ({caseSuggestions.length}):</span>
                <button className="btn-close" onClick={() => setShowCaseSuggestions(false)}>✕</button>
              </div>
              <div className="suggestions-list">
                {caseSuggestions.map(cs => (
                  <div key={cs.id} className="suggestion-item">
                    <div className="suggestion-content">
                      <div className="suggestion-title">{cs.title}</div>
                      <div className="suggestion-meta">
                        <span className="suggestion-category">{cs.category}</span>
                        {cs.entities && cs.entities.length > 0 && (
                          <span className="suggestion-entities">{cs.entities.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => {
                        setInput(prev => prev + ` [case: ${cs.title}]`);
                        setShowCaseSuggestions(false);
                      }}
                      title="Add to message"
                    >
                      Link
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="chat-input-hint">Enter kirim · Shift+Enter baris baru · 🎤 push-to-talk</div>
        </div>

        {/* ✨ Phase 3: Case Action Confirmation Modal */}
        {caseActionModal && (
          <div className="modal-overlay" onClick={handleCaseActionCancel}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                {caseActionModal.type === 'create_case' ? '📋 Buat Case Baru?' : '📝 Update Case?'}
              </div>
              <div className="modal-body">
                <p>{caseActionModal.message}</p>
                {caseActionModal.type === 'create_case' && caseActionModal.params && (
                  <div className="case-details">
                    <div><strong>Judul:</strong> {caseActionModal.params.title}</div>
                    <div><strong>Kategori:</strong> {caseActionModal.params.category || 'general'}</div>
                    {caseActionModal.params.entities && caseActionModal.params.entities.length > 0 && (
                      <div><strong>Terlibat:</strong> {caseActionModal.params.entities.join(', ')}</div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={handleCaseActionCancel}>
                  Batal
                </button>
                <button className="btn btn-primary" onClick={handleCaseActionConfirm}>
                  {caseActionModal.type === 'create_case' ? 'Buat Case' : 'Update Case'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

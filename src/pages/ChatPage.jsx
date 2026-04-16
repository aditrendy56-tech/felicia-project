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
} from '../services/api';
import './ChatPage.css';

const CHAT_TYPES = [
  { key: 'utama',     label: '⚡ Utama',     color: 'var(--utama)' },
  { key: 'refleksi',  label: '💜 Refleksi',  color: 'var(--refleksi)' },
  { key: 'strategi',  label: '🧠 Strategi',  color: 'var(--strategi)' },
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
  const msgEnd = useRef(null);
  const inputRef = useRef(null);

  // Load threads when chatType changes
  useEffect(() => {
    setLoadingThreads(true);
    setActiveThread(null);
    setMessages([]);
    listThreads(chatType)
      .then(d => setThreads(d.threads || []))
      .catch(() => setThreads([]))
      .finally(() => setLoadingThreads(false));
  }, [chatType]);

  // Load quota
  useEffect(() => {
    getQuotaEta().then(setQuota).catch(() => {});
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
    } catch {
      setMessages([]);
    }
    // On mobile, close thread sidebar
    if (window.innerWidth <= 768) setSideOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ✨ Phase 2: Analyze case suggestions when typing
  useEffect(() => {
    if (input.length > 10) {
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
          console.error('Error getting case suggestions:', err);
          setShowCaseSuggestions(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setShowCaseSuggestions(false);
    }
  }, [input]);

  async function handleNewThread() {
    try {
      const d = await createThread(chatType);
      if (d.thread) {
        setThreads(prev => [d.thread, ...prev]);
        selectThread(d.thread);
      }
    } catch {}
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
      } catch {
        return;
      }
    }

    // Optimistic user message
    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const d = await sendChat({ message: text, chatType, threadId });
      const reply = d?.reply || d?.error || 'Hmm, aku nggak bisa jawab sekarang.';
      const botMsg = { role: 'assistant', content: reply, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, botMsg]);

      // Auto-rename thread if it's the first message
      if (messages.length === 0 && threadId) {
        const shortTitle = text.length > 40 ? text.substring(0, 40) + '...' : text;
        renameThread(threadId, shortTitle).catch(() => {});
        setThreads(prev =>
          prev.map(t => t.id === threadId ? { ...t, title: shortTitle } : t)
        );
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Gagal menghubungi server.',
        created_at: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

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
            <button className="btn btn-ghost btn-sm" onClick={() => openContextPanel?.()} title="Konteks & Memory">
              📦 Konteks
            </button>
          </div>
        </div>

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
          <div className="chat-input-wrapper">
            <textarea
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

          <div className="chat-input-hint">Enter kirim · Shift+Enter baris baru</div>
        </div>
      </div>
    </div>
  );
}

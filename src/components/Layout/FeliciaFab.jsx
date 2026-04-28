import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendChat, isAuthError } from '../../services/api';

export default function FeliciaFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hai! Ada yang bisa aku bantu? 😊' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgEnd = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    msgEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text }]);
    setLoading(true);

    try {
      const data = await sendChat({ action: 'chat', message: text, chatType: 'utama' });
      const reply = data?.reply || data?.error || 'Hmm, aku nggak bisa jawab sekarang.';
      setMessages(m => [...m, { role: 'bot', text: reply }]);
    } catch (err) {
      setMessages(m => [...m, {
        role: 'bot',
        text: isAuthError(err) ? '🔐 API token belum valid. Pasang token dulu ya.' : '⚠️ Gagal menghubungi server.',
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Don't show FAB on /chat page (redundant)
  if (location.pathname === '/chat') return null;

  return (
    <div className="felicia-fab">
      {open && (
        <div className="felicia-fab-popup">
          <div className="felicia-fab-header">
            <h4>🤖 Felicia Quick Chat</h4>
            <button className="btn-icon" onClick={() => navigate('/chat')} title="Full chat">↗</button>
          </div>
          <div className="felicia-fab-messages">
            {messages.map((m, i) => (
              <div key={i} className={`fab-msg ${m.role === 'user' ? 'user' : 'bot'}`}>
                {m.text}
              </div>
            ))}
            {loading && (
              <div className="fab-msg bot" style={{ opacity: 0.6 }}>Mengetik...</div>
            )}
            <div ref={msgEnd} />
          </div>
          <div className="felicia-fab-input-area">
            <input
              id="fab-quick-chat-input"
              name="fabQuickChat"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tanya Felicia..."
              disabled={loading}
            />
            <button onClick={handleSend} disabled={loading}>Kirim</button>
          </div>
        </div>
      )}
      <button className="felicia-fab-btn" onClick={() => setOpen(!open)} title="Chat Felicia">
        {open ? '✕' : '🤖'}
      </button>
    </div>
  );
}

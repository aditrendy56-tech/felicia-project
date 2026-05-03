import React, { useState, useCallback, useEffect, useRef } from 'react';
import JarvisOrb from '../components/JarvisOrb';
import './VoicePage.css';
import { sendChat, listThreads, createThread } from '../services/api';

export default function VoicePage() {
  const [state, setState] = useState('idle');
  const [transcript, setTranscript] = useState('Tekan mic atau kirim pesan untuk mulai.');
  const [inputText, setInputText] = useState('');
  const [chatType] = useState('utama');
  const [threadId, setThreadId] = useState(null);
  const [loadingSend, setLoadingSend] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [micListening, setMicListening] = useState(false);
  const recognitionRef = useRef(null);
  const autoSendOnEndRef = useRef(false);
  const latestInputRef = useRef('');

  useEffect(() => {
    latestInputRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    // Try to pick an existing thread for the default chatType so VoicePage shares context
    let mounted = true;
    (async () => {
      try {
        const d = await listThreads(chatType, 10);
        const threads = d?.threads || [];
        if (mounted && threads.length > 0) {
          setThreadId(threads[0].id);
        }
      } catch (err) {
        // ignore — we'll create thread on demand
      }
    })();
    return () => { mounted = false; };
  }, [chatType]);

  const sendMessage = useCallback(async (rawMessage) => {
    const message = String(rawMessage || '').trim();
    if (!message) {
      setState('idle');
      setTranscript('⚠️ Pesan kosong. Isi dulu lalu kirim.');
      return;
    }

    setState('thinking');
    setLoadingSend(true);
    setTranscript('Thinking...');

    try {
      let activeThreadId = threadId;
      if (!activeThreadId) {
        // create thread like ChatPage would
        const created = await createThread(chatType);
        activeThreadId = created?.thread?.id || null;
        if (activeThreadId) setThreadId(activeThreadId);
      }

      const d = await sendChat({ message, chatType, threadId: activeThreadId, runMode: 'system' });
      const reply = d?.reply || d?.error || 'Hmm, aku nggak bisa jawab sekarang.';
      setTranscript(reply);
      setInputText('');
      setState('speaking');
      setTimeout(() => setState('idle'), 1800);
    } catch (err) {
      console.error('Voice sendChat error:', err);
      setTranscript(`⚠️ Gagal kirim ke server: ${err?.message || 'Unknown error'}`);
      setState('idle');
    } finally {
      setLoadingSend(false);
    }
  }, [threadId, chatType]);

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
      setState('listening');
      setTranscript('🎙️ Mendengarkan... klik tombol mic lagi untuk selesai dan kirim.');
    };

    recognition.onresult = (event) => {
      const spokenText = Array.from(event.results)
        .map((result) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();

      if (spokenText) {
        setInputText(spokenText);
      }
    };

    recognition.onerror = (event) => {
      setMicListening(false);
      autoSendOnEndRef.current = false;
      setState('idle');
      const reason = event?.error ? ` (${event.error})` : '';
      setTranscript(`⚠️ Gagal membaca suara${reason}. Coba lagi.`);
    };

    recognition.onend = async () => {
      setMicListening(false);

      if (!autoSendOnEndRef.current) {
        setState('idle');
        return;
      }

      autoSendOnEndRef.current = false;
      const captured = String(latestInputRef.current || '').trim();

      if (!captured) {
        setState('idle');
        setTranscript('⚠️ Suara tidak terdeteksi. Coba bicara lebih jelas.');
        return;
      }

      await sendMessage(captured);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
      recognitionRef.current = null;
      autoSendOnEndRef.current = false;
    };
  }, [sendMessage]);

  const handleMicDown = useCallback(() => {
    if (loadingSend) return;

    if (!micSupported || !recognitionRef.current) {
      setState('idle');
      setTranscript('⚠️ Browser tidak mendukung voice input. Gunakan kolom teks.');
      return;
    }

    // Toggle mode: first press starts listening, next press stops and sends
    if (micListening) {
      try {
        recognitionRef.current.stop();
      } catch {
        autoSendOnEndRef.current = false;
        setState('idle');
      }
      return;
    }

    setInputText('');
    latestInputRef.current = '';
    autoSendOnEndRef.current = true;

    try {
      recognitionRef.current.start();
    } catch {
      setState('idle');
      setTranscript('⚠️ Mic belum siap. Coba klik lagi.');
    }
  }, [loadingSend, micSupported, micListening]);

  const handleMicUp = useCallback(() => {
    // No-op intentionally: stop is handled by second press to avoid premature stop/network error.
  }, []);

  const handleSendClick = useCallback(async () => {
    await sendMessage(inputText);
  }, [sendMessage, inputText]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!loadingSend) {
        handleSendClick();
      }
    }
  }, [handleSendClick, loadingSend]);

  return (
    <div className="voice-page-root">
      <div className="voice-stage">
        <JarvisOrb state={state} onMicDown={handleMicDown} onMicUp={handleMicUp} size={140} />
        <div className="voice-info">
          <div className="voice-state">State: <strong>{state}</strong></div>
          <div className="voice-meta">Mic: <strong>{micSupported ? (micListening ? 'ON' : 'READY') : 'UNSUPPORTED'}</strong></div>
          <div className="voice-transcript">{transcript}</div>
          <div className="voice-input-row">
            <textarea
              className="voice-input"
              placeholder="Tulis pesan untuk dikirim ke /api/chat..."
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              disabled={loadingSend}
            />
            <button
              className="voice-send-btn"
              type="button"
              onClick={handleSendClick}
              disabled={loadingSend || !inputText.trim()}
            >
              {loadingSend ? 'Mengirim...' : 'Kirim'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

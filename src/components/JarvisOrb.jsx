import React, { useEffect, useRef } from 'react';
import './JarvisOrb.css';

const STATE_CLASS = {
  idle: 'jo-idle',
  listening: 'jo-listening',
  thinking: 'jo-thinking',
  speaking: 'jo-speaking',
};

export default function JarvisOrb({ state = 'idle', onMicDown, onMicUp, size = 72 }) {
  const orbRef = useRef(null);

  useEffect(() => {
    // kept minimal for performance; hook present for future enhancements
    const el = orbRef.current;
    if (!el) return;
  }, [state]);

  return (
    <div className={`jarvis-orb ${STATE_CLASS[state] || STATE_CLASS.idle}`} style={{ width: size, height: size }}>
      <div className="jo-glow" />
      <div className="jo-core" ref={orbRef} />
      <div className="jo-wave" />

      <button
        className="jo-mic"
        aria-label="Push to talk"
        onMouseDown={(e) => { e.preventDefault(); onMicDown && onMicDown(); }}
        onMouseUp={(e) => { e.preventDefault(); onMicUp && onMicUp(); }}
        onTouchStart={(e) => { e.preventDefault(); onMicDown && onMicDown(); }}
        onTouchEnd={(e) => { e.preventDefault(); onMicUp && onMicUp(); }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" />
          <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-5 5v3h2a1 1 0 1 0 0 2H9a1 1 0 1 0 0-2h2v-3a5 5 0 0 1-5-5 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V22a1 1 0 1 0 2 0v-4.08A7 7 0 0 0 19 11z" />
        </svg>
      </button>
    </div>
  );
}

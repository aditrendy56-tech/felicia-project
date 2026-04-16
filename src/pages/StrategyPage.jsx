import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { getCasesAction } from '../services/api';
import './GenericPage.css';

export default function StrategyPage() {
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [error, setError] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    let isActive = true;
    setLoadingCases(true);
    setError('');

    getCasesAction('active')
      .then((data) => {
        if (!isActive) return;
        setCases(Array.isArray(data?.cases) ? data.cases : []);
      })
      .catch((err) => {
        if (!isActive) return;
        setCases([]);
        setError(err?.message || 'Gagal memuat daftar case.');
      })
      .finally(() => {
        if (isActive) setLoadingCases(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  const filteredCases = filterCategory === 'all' 
    ? cases 
    : cases.filter(c => c.category === filterCategory);

  const categories = ['all', ...new Set(cases.map(c => c.category))];

  return (
    <div className="generic-page page-active">
      <PageHeader
        title="📋 Strategi & Case"
        subtitle="Kelola semua case dan strategi personal kamu"
      />

      <div className="generic-grid">
        {/* Case List */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-title">📌 Daftar Case Aktif</div>
          
          {/* Filter */}
          <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`btn btn-sm ${filterCategory === cat ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setFilterCategory(cat)}
              >
                {cat === 'all' ? '📋 Semua' : cat}
              </button>
            ))}
          </div>

          {loadingCases ? (
            <>
              <div className="skeleton" style={{ height: 20, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 20, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 20 }} />
            </>
          ) : error ? (
            <p className="text-error" style={{ fontSize: '0.85rem' }}>⚠️ {error}</p>
          ) : filteredCases.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              Belum ada case. Buat case baru dari chat dengan mengatakan "tolong simpan ini jadi case ...".
            </p>
          ) : (
            <div className="settings-list">
              {filteredCases.map((caseItem) => (
                <div
                  key={caseItem.id}
                  className="settings-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedCase(caseItem)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 4 }}>
                      {caseItem.title || '(Tanpa judul)'}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>
                      <strong>Kategori:</strong> {caseItem.category || 'general'}
                    </div>
                    {caseItem.entities && caseItem.entities.length > 0 && (
                      <div className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: 4 }}>
                        <strong>Entities:</strong> {caseItem.entities.join(', ')}
                      </div>
                    )}
                    {caseItem.summary && (
                      <div className="text-secondary" style={{ fontSize: '0.8rem', lineHeight: '1.3' }}>
                        {caseItem.summary.substring(0, 100)}
                        {caseItem.summary.length > 100 ? '...' : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '0.75rem' }}>
                    <div className="text-muted">
                      {new Date(caseItem.created_at).toLocaleDateString('id-ID', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Case Detail */}
        <div className="card">
          <div className="card-title">🔍 Detail Case</div>
          {selectedCase ? (
            <div>
              <div style={{ marginBottom: 12 }}>
                <strong style={{ fontSize: '0.95rem' }}>{selectedCase.title}</strong>
                <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                  Kategori: <code>{selectedCase.category}</code>
                </div>
              </div>

              {selectedCase.entities && selectedCase.entities.length > 0 && (
                <div style={{ marginBottom: 12, padding: 8, background: 'var(--bg-hover)', borderRadius: 6 }}>
                  <div className="text-secondary" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                    👥 Entities
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selectedCase.entities.map((ent, i) => (
                      <span key={i} className="badge badge-md">
                        {ent}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedCase.summary && (
                <div style={{ marginBottom: 12 }}>
                  <div className="text-secondary" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                    📝 Ringkasan
                  </div>
                  <p style={{ fontSize: '0.85rem', lineHeight: '1.5', margin: 0 }}>
                    {selectedCase.summary}
                  </p>
                </div>
              )}

              {selectedCase.details && selectedCase.details.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div className="text-secondary" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6 }}>
                    📋 Detail & Catatan ({selectedCase.details.length})
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {selectedCase.details.map((detail, i) => (
                      <div
                        key={i}
                        style={{
                          padding: 8,
                          marginBottom: 6,
                          background: 'var(--bg-hover)',
                          borderRadius: 4,
                          fontSize: '0.8rem',
                        }}
                      >
                        <div className="text-muted" style={{ fontSize: '0.75rem', marginBottom: 2 }}>
                          {new Date(detail.timestamp).toLocaleString('id-ID')}
                        </div>
                        <p style={{ margin: 0, lineHeight: '1.3' }}>{detail.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color)' }}>
                Dibuat: {new Date(selectedCase.created_at).toLocaleString('id-ID')}
              </div>
            </div>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              Pilih case untuk lihat detail lengkapnya.
            </p>
          )}
        </div>

        {/* Info */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">💡 Cara Pakai</div>
          <div style={{ fontSize: '0.85rem', lineHeight: '1.6' }}>
            <p>
              <strong>1. Buat Case Baru</strong> — Di chat, katakan "tolong simpan ini jadi case [nama case]" dengan detail lengkap.
            </p>
            <p>
              <strong>2. Category</strong> — Case bisa di-kategorikan (financial, relationship, health, work, personal, dll).
            </p>
            <p>
              <strong>3. Entities</strong> — Nama orang atau hal terkait otomatis di-extract. Misal: "case utang dengan Aji" → entities: ["Aji"].
            </p>
            <p>
              <strong>4. Auto-Link</strong> — Saat kamu bahas utang lagi, AI akan tanya "apakah ini update case utang dengan Aji?".
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

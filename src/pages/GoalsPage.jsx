import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import './GoalsPage.css';

export default function GoalsPage() {
  const [goals, setGoals] = useState([]);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', category: '', progress: 0, deadline: '' });

  return (
    <div className="goals-page page-active">
      <PageHeader
        title="🎯 Goals"
        subtitle="Target & milestone tracking"
        actions={<button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>＋ Goal Baru</button>}
      />

      {showForm && (
        <div className="card goal-add-form">
          <div className="card-title">➕ Tambah Goal Baru</div>
          <div className="goal-form-grid">
            <input className="input" placeholder="Judul goal" value={form.title} onChange={e => setForm(v => ({ ...v, title: e.target.value }))} />
            <input className="input" placeholder="Kategori (Belajar, Kesehatan, …)" value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))} />
            <input className="input" type="number" min="0" max="100" placeholder="Progress %" value={form.progress} onChange={e => setForm(v => ({ ...v, progress: Number(e.target.value) }))} />
            <input className="input" type="date" value={form.deadline} onChange={e => setForm(v => ({ ...v, deadline: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => {
              if (!form.title.trim()) return;
              setGoals(prev => [...prev, { ...form, id: Date.now(), milestones: [] }]);
              setForm({ title: '', category: '', progress: 0, deadline: '' });
              setShowForm(false);
            }}>Simpan</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Batal</button>
          </div>
        </div>
      )}

      <div className="goals-content">
        <div className="goals-list">
          {goals.length === 0 ? (
            <div className="goal-empty">
              <p className="text-muted">Belum ada goal. Klik ＋ Goal Baru untuk tambah.</p>
            </div>
          ) : goals.map(g => (
            <div
              key={g.id}
              className={`card goal-card ${selectedGoal?.id === g.id ? 'active' : ''}`}
              onClick={() => setSelectedGoal(g)}
            >
              <div className="goal-card-header">
                <span className="goal-category">{g.category}</span>
                <span className="goal-deadline">{new Date(g.deadline).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>
              </div>
              <h4 className="goal-title">{g.title}</h4>
              <div className="goal-progress-bar">
                <div className="goal-progress-fill" style={{ width: `${g.progress}%` }} />
              </div>
              <span className="goal-progress-text">{g.progress}%</span>
            </div>
          ))}
        </div>

        <div className="goal-detail-panel">
          {selectedGoal ? (
            <div className="card goal-detail">
              <h3>{selectedGoal.title}</h3>
              <div className="goal-detail-meta">
                <span className="badge badge-info">{selectedGoal.category}</span>
                <span className="text-muted">Deadline: {selectedGoal.deadline}</span>
              </div>
              <div className="goal-progress-bar large">
                <div className="goal-progress-fill" style={{ width: `${selectedGoal.progress}%` }} />
              </div>
              <p className="goal-detail-progress">{selectedGoal.progress}% selesai</p>

              <h4 style={{ marginTop: 20 }}>Milestones</h4>
              <ul className="milestone-list">
                {selectedGoal.milestones.map((m, i) => (
                  <li key={i} className={`milestone-item ${m.includes('✅') ? 'done' : ''}`}>
                    <span className="milestone-check">{m.includes('✅') ? '✅' : '○'}</span>
                    {m.replace(' ✅', '')}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="goal-detail-empty">
              <p className="text-muted">← Pilih goal untuk lihat detail</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

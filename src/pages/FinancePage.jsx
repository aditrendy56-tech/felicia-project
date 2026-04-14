import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import './GenericPage.css';

export default function FinancePage() {
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ desc: '', amount: '', category: '', type: 'keluar' });

  const total = transactions.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="finance-page page-active">
      <PageHeader
        title="💰 Keuangan"
        subtitle="Tracking pemasukan & pengeluaran"
        actions={<button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>＋ Transaksi</button>}
      />

      {showForm && (
        <div className="card" style={{ margin: '16px 28px 0', padding: '16px' }}>
          <div className="card-title">➕ Transaksi Baru</div>
          <div className="profile-form-grid">
            <input className="input" placeholder="Deskripsi" value={form.desc} onChange={e => setForm(v => ({ ...v, desc: e.target.value }))} />
            <input className="input" type="number" placeholder="Nominal (Rp)" value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} />
            <input className="input" placeholder="Kategori" value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))} />
            <select className="input" value={form.type} onChange={e => setForm(v => ({ ...v, type: e.target.value }))}>
              <option value="keluar">Pengeluaran</option>
              <option value="masuk">Pemasukan</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={() => {
              if (!form.desc.trim() || !form.amount) return;
              const amt = form.type === 'masuk' ? Math.abs(Number(form.amount)) : -Math.abs(Number(form.amount));
              setTransactions(prev => [{ id: Date.now(), desc: form.desc, amount: amt, date: new Date().toISOString().slice(0,10), category: form.category || 'Lainnya' }, ...prev]);
              setForm({ desc: '', amount: '', category: '', type: 'keluar' });
              setShowForm(false);
            }}>Simpan</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Batal</button>
          </div>
        </div>
      )}

      <div className="generic-grid">
        {/* Summary */}
        <div className="card">
          <div className="card-title">💎 Saldo</div>
          <div className={`finance-balance ${total >= 0 ? 'positive' : 'negative'}`}>
            Rp {Math.abs(total).toLocaleString('id-ID')}
          </div>
        </div>

        <div className="card">
          <div className="card-title">📈 Pemasukan Bulan Ini</div>
          <div className="finance-balance positive">
            Rp {transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0).toLocaleString('id-ID')}
          </div>
        </div>

        <div className="card">
          <div className="card-title">📉 Pengeluaran Bulan Ini</div>
          <div className="finance-balance negative">
            Rp {Math.abs(transactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)).toLocaleString('id-ID')}
          </div>
        </div>

        {/* Transaction list */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">📝 Transaksi Terakhir</div>
          {transactions.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.85rem', padding: '8px 0' }}>Belum ada transaksi. Klik ＋ Transaksi untuk tambah.</p>
          ) : (
            <div className="transaction-list">
              {transactions.map(t => (
                <div key={t.id} className="transaction-item">
                  <div className="transaction-info">
                    <span className="transaction-desc">{t.desc}</span>
                    <span className="transaction-cat">{t.category}</span>
                  </div>
                  <div className={`transaction-amount ${t.amount >= 0 ? 'positive' : 'negative'}`}>
                    {t.amount >= 0 ? '+' : ''}Rp {Math.abs(t.amount).toLocaleString('id-ID')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Budget */}
        <div className="card">
          <div className="card-title">🎯 Budget Status</div>
          <div className="placeholder-content">
            <p className="text-muted">Set budget bulanan — coming soon.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

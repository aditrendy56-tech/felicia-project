import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { getQuotaStatus, getQuotaEta, getProfile, updateProfile } from '../services/api';
import './GenericPage.css';

export default function SettingsPage() {
  const [quotaStatus, setQuotaStatus] = useState(null);
  const [quotaEta, setQuotaEta] = useState(null);
  const [loadingQuota, setLoadingQuota] = useState(true);
  const [profileForm, setProfileForm] = useState({
    name: '',
    aliases: '',
    gender: '',
    domicile: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const quotaWindow = quotaStatus?.window || {};
  const lastHourStats = quotaWindow.last_hour || {};
  const last24hStats = quotaWindow.last_24h || {};

  useEffect(() => {
    Promise.all([
      getQuotaStatus().catch(() => null),
      getQuotaEta().catch(() => null),
      getProfile().catch(() => null),
    ]).then(([status, eta, profileData]) => {
      setQuotaStatus(status);
      setQuotaEta(eta);

      if (profileData?.profile) {
        setProfileForm({
          name: profileData.profile.name || '',
          aliases: (profileData.profile.knownAliases || []).join(', '),
          gender: profileData.profile.gender || '',
          domicile: profileData.profile.domicile || '',
        });
      }
    }).finally(() => setLoadingQuota(false));
  }, []);

  async function handleSaveProfile() {
    if (profileSaving) return;

    const payload = {
      name: profileForm.name.trim(),
      aliases: profileForm.aliases.split(',').map(part => part.trim()).filter(Boolean),
      gender: profileForm.gender.trim(),
      domicile: profileForm.domicile.trim(),
    };

    if (!payload.name || payload.aliases.length === 0 || !payload.gender || !payload.domicile) {
      setProfileMsg('⚠️ Semua field profil wajib diisi.');
      return;
    }

    setProfileSaving(true);
    setProfileMsg('');
    try {
      await updateProfile(payload);
      setProfileMsg('✅ Profil permanen berhasil disimpan. Guard identitas langsung pakai data ini.');
    } catch {
      setProfileMsg('❌ Gagal menyimpan profil permanen. Coba lagi.');
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="settings-page page-active">
      <PageHeader
        title="⚙️ Settings"
        subtitle="Konfigurasi & monitoring"
      />

      <div className="generic-grid">
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">🪪 Profil Permanen User</div>
          <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: 12 }}>
            Data di sini jadi identitas resmi. Chat biasa tidak boleh mengubahnya.
          </p>
          <div className="profile-form-grid">
            <input
              className="input"
              placeholder="Nama lengkap"
              value={profileForm.name}
              onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Alias (pisahkan koma)"
              value={profileForm.aliases}
              onChange={(e) => setProfileForm(prev => ({ ...prev, aliases: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Gender"
              value={profileForm.gender}
              onChange={(e) => setProfileForm(prev => ({ ...prev, gender: e.target.value }))}
            />
            <input
              className="input"
              placeholder="Domisili"
              value={profileForm.domicile}
              onChange={(e) => setProfileForm(prev => ({ ...prev, domicile: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={handleSaveProfile} disabled={profileSaving}>
              {profileSaving ? 'Menyimpan...' : 'Simpan Profil Permanen'}
            </button>
            {profileMsg && <span className="text-muted" style={{ fontSize: '0.82rem' }}>{profileMsg}</span>}
          </div>
        </div>

        {/* Quota Panel */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">📦 AI Quota Monitor</div>
          {loadingQuota ? (
            <div className="skeleton" style={{ height: 60, width: '100%' }} />
          ) : (
            <div className="quota-panel">
              {quotaEta && (
                <div className="quota-row">
                  <strong>Status:</strong>
                  <span className={`badge ${quotaEta.state === 'ok' ? 'badge-success' : quotaEta.state === 'rate_limited' ? 'badge-warning' : 'badge-error'}`}>
                    {quotaEta.state}
                  </span>
                  {quotaEta.warning && <span className="text-muted" style={{ fontSize: '0.82rem' }}>{quotaEta.warning}</span>}
                </div>
              )}
              {quotaStatus && (
                <>
                  <div className="quota-row">
                    <strong>Last hour:</strong>
                    <span className="text-success">{lastHourStats.success || 0} success</span> ·
                    <span className="text-warning">{lastHourStats.quota_limited || 0} quota</span> ·
                    <span className="text-error">{lastHourStats.error || 0} error</span>
                  </div>
                  <div className="quota-row">
                    <strong>Last 24h:</strong>
                    <span className="text-success">{last24hStats.success || 0} success</span> ·
                    <span className="text-warning">{last24hStats.quota_limited || 0} quota</span> ·
                    <span className="text-error">{last24hStats.error || 0} error</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Integrations */}
        <div className="card">
          <div className="card-title">🔗 Integrasi</div>
          <div className="settings-list">
            <div className="settings-item">
              <span>Google Calendar</span>
              <span className="badge badge-success">Connected</span>
            </div>
            <div className="settings-item">
              <span>Supabase DB</span>
              <span className="badge badge-success">Connected</span>
            </div>
            <div className="settings-item">
              <span>Discord Bot</span>
              <span className="badge badge-success">Active</span>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="card">
          <div className="card-title">🔒 Security</div>
          <div className="settings-list">
            <div className="settings-item">
              <span>API Token</span>
              <span className="badge badge-info">Active</span>
            </div>
            <div className="settings-item">
              <span>CORS</span>
              <span className="text-muted" style={{ fontSize: '0.82rem' }}>Allow all origins</span>
            </div>
          </div>
        </div>

        {/* Retention */}
        <div className="card">
          <div className="card-title">🗑️ Data Retention</div>
          <div className="settings-list">
            <div className="settings-item">
              <span>Successful commands</span>
              <span className="text-muted">14 hari</span>
            </div>
            <div className="settings-item">
              <span>All commands</span>
              <span className="text-muted">30 hari</span>
            </div>
            <div className="settings-item">
              <span>Mode logs</span>
              <span className="text-muted">30 hari</span>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="card">
          <div className="card-title">ℹ️ About</div>
          <div className="settings-list">
            <div className="settings-item">
              <span>Version</span>
              <span className="text-muted">1.0.0</span>
            </div>
            <div className="settings-item">
              <span>Runtime</span>
              <span className="text-muted">Node.js ≥18, Vercel Serverless</span>
            </div>
            <div className="settings-item">
              <span>AI Models</span>
              <span className="text-muted">Gemini 2.5/2.0/1.5 Flash</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

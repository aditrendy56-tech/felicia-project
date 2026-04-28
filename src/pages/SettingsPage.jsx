import { useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import { getQuotaStatus, getQuotaEta, getProfile, getSystemStatus, updateProfile, isAuthError } from '../services/api';
import './GenericPage.css';

export default function SettingsPage() {
  const [systemStatus, setSystemStatus] = useState(null);
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
    let isMounted = true;

    const loadStatus = async () => {
      const [system, status, eta] = await Promise.all([
        getSystemStatus().catch(() => null),
        getQuotaStatus().catch(() => null),
        getQuotaEta().catch(() => null),
      ]);

      if (!isMounted) return;
      setSystemStatus(system);
      setQuotaStatus(status);
      setQuotaEta(eta);
      setLoadingQuota(false);
    };

    loadStatus();
    const timer = setInterval(loadStatus, 60_000);

    getProfile().then((profileData) => {
      if (!isMounted || !profileData?.profile) return;
      setProfileForm({
        name: profileData.profile.name || '',
        aliases: (profileData.profile.knownAliases || []).join(', '),
        gender: profileData.profile.gender || '',
        domicile: profileData.profile.domicile || '',
      });
    }).catch(() => {});

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  const integrationStatus = systemStatus?.integrations || {};
  const systemOverall = systemStatus?.overall || {};
  const architectureSummary = systemStatus?.architecture || {};
  const checkedAtText = systemStatus?.updatedAt
    ? new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(new Date(systemStatus.updatedAt))
    : 'Belum ada data';
  const getBadgeClass = (state) => {
    if (state === 'connected' || state === 'configured' || state === 'healthy' || state === 'active') return 'badge-success';
    if (state === 'warning' || state === 'partial' || state === 'unknown') return 'badge-warning';
    return 'badge-error';
  };

  const auditRows = [
    { label: 'Google Calendar', key: 'googleCalendar' },
    { label: 'Supabase DB', key: 'supabase' },
    { label: 'Profil & Memory', key: 'profileMemory' },
    { label: 'Gemini Brain', key: 'gemini' },
    { label: 'Discord Bot', key: 'discord' },
    { label: 'API Token', key: 'apiToken' },
  ];

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
    } catch (err) {
      setProfileMsg(isAuthError(err)
        ? '🔐 API token belum valid. Profil belum bisa disimpan.'
        : '❌ Gagal menyimpan profil permanen. Coba lagi.');
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
              id="settings-profile-name"
              name="profileName"
              className="input"
              placeholder="Nama lengkap"
              value={profileForm.name}
              onChange={(e) => setProfileForm(prev => ({ ...prev, name: e.target.value }))}
            />
            <input
              id="settings-profile-aliases"
              name="profileAliases"
              className="input"
              placeholder="Alias (pisahkan koma)"
              value={profileForm.aliases}
              onChange={(e) => setProfileForm(prev => ({ ...prev, aliases: e.target.value }))}
            />
            <input
              id="settings-profile-gender"
              name="profileGender"
              className="input"
              placeholder="Gender"
              value={profileForm.gender}
              onChange={(e) => setProfileForm(prev => ({ ...prev, gender: e.target.value }))}
            />
            <input
              id="settings-profile-domicile"
              name="profileDomicile"
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

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">🧩 System Cohesion</div>
          <div className="settings-list">
            <div className="settings-item">
              <span>Overall</span>
              <span className={`badge ${getBadgeClass(systemOverall.state)}`}>{systemOverall.state || 'unknown'}</span>
            </div>
            <div className="settings-item">
              <span>Summary</span>
              <span className="text-muted" style={{ fontSize: '0.82rem', textAlign: 'right' }}>{systemOverall.summary || 'Memeriksa integrasi...'}</span>
            </div>
            <div className="settings-item">
              <span>Checked at</span>
              <span className="text-muted" style={{ fontSize: '0.82rem', textAlign: 'right' }}>{checkedAtText}</span>
            </div>
            <div className="settings-item">
              <span>Source of truth</span>
              <span className="text-muted" style={{ fontSize: '0.82rem' }}>{(architectureSummary.source_of_truth || []).join(' · ') || 'Supabase · Google Calendar · Gemini'}</span>
            </div>
            <div className="settings-item">
              <span>Personal data</span>
              <span className="text-muted" style={{ fontSize: '0.82rem', textAlign: 'right' }}>{architectureSummary.personal_data || 'Profil & memory tersimpan terpusat di Supabase.'}</span>
            </div>
            <div className="settings-item">
              <span>Security note</span>
              <span className="text-muted" style={{ fontSize: '0.82rem', textAlign: 'right' }}>{architectureSummary.security || 'Server auth aktif.'}</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">🔍 Live Audit Detail</div>
          <div className="settings-list">
            {auditRows.map((row) => {
              const item = integrationStatus[row.key] || {};
              return (
                <div className="settings-item" key={row.key} style={{ alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>{row.label}</span>
                    <span className="text-muted" style={{ fontSize: '0.76rem', lineHeight: 1.4 }}>
                      {item.detail || 'Belum ada detail status.'}
                    </span>
                  </div>
                  <span className={`badge ${getBadgeClass(item.state)}`} style={{ flexShrink: 0 }}>
                    {item.state || 'unknown'}
                  </span>
                </div>
              );
            })}
          </div>

          {Array.isArray(architectureSummary.notes) && architectureSummary.notes.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>Catatan Arsitektur</div>
              <ul style={{ marginLeft: 18, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.6 }}>
                {architectureSummary.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Quota Panel */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">📦 AI Quota Monitor (internal log)</div>
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
              <div className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.45 }}>
                Status quota ini diambil dari log internal `felicia_commands`, jadi kalau Gemini lagi error tapi belum tercatat di log, label bisa masih terlihat normal.
              </div>
            </div>
          )}
        </div>

        {/* Integrations */}
        <div className="card">
          <div className="card-title">🔗 Integrasi</div>
          <div className="settings-list">
            <div className="settings-item">
              <span>Google Calendar</span>
              <span className={`badge ${getBadgeClass(integrationStatus.googleCalendar?.state)}`}>{integrationStatus.googleCalendar?.state || 'unknown'}</span>
            </div>
            <div className="settings-item">
              <span>Supabase DB</span>
              <span className={`badge ${getBadgeClass(integrationStatus.supabase?.state)}`}>{integrationStatus.supabase?.state || 'unknown'}</span>
            </div>
            <div className="settings-item">
              <span>Profil & Memory</span>
              <span className={`badge ${getBadgeClass(integrationStatus.profileMemory?.state)}`}>{integrationStatus.profileMemory?.state || 'unknown'}</span>
            </div>
            <div className="settings-item">
              <span>Gemini Brain</span>
              <span className={`badge ${getBadgeClass(integrationStatus.gemini?.state)}`}>{integrationStatus.gemini?.state || 'unknown'}</span>
            </div>
            <div className="settings-item">
              <span>Discord Bot</span>
              <span className={`badge ${getBadgeClass(integrationStatus.discord?.state)}`}>{integrationStatus.discord?.state || 'unknown'}</span>
            </div>
          </div>
        </div>

        {/* Security */}
        <div className="card">
          <div className="card-title">🔒 Security</div>
          <div className="settings-list">
            <div className="settings-item">
              <span>API Token</span>
              <span className={`badge ${getBadgeClass(integrationStatus.apiToken?.state)}`}>{integrationStatus.apiToken?.state || 'unknown'}</span>
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

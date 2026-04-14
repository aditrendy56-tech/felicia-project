import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import './GenericPage.css';

import { getProfile } from '../services/api';

export default function MemoryPage() {
  const [profile, setProfile] = useState({
    name: '',
    knownAliases: [],
    domicile: '',
    gender: '',
  });

  useEffect(() => {
    getProfile()
      .then((data) => {
        if (data?.profile) {
          setProfile(data.profile);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="memory-page page-active">
      <PageHeader
        title="🧠 Memory"
        subtitle="Apa yang Felicia ingat tentangmu"
      />

      <div className="generic-grid">
        {/* Profile Summary */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">👤 Profil</div>
          <div className="profile-summary">
            <div className="profile-item"><strong>Nama:</strong> {profile.name}</div>
            <div className="profile-item"><strong>Alias:</strong> {(profile.knownAliases || []).join(', ')}</div>
            <div className="profile-item"><strong>Gender:</strong> {profile.gender}</div>
            <div className="profile-item"><strong>Domisili:</strong> {profile.domicile}</div>
          </div>
        </div>

        {/* Memory hint */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-title">📌 Memories</div>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 10 }}>
            Memory Felicia tersimpan di database. Tambah lewat chat (<code>ingat ya ...</code>) atau panel <strong>Konteks & Memory</strong> di halaman Chat.
          </p>
          <p className="text-secondary" style={{ fontSize: '0.82rem' }}>
            Untuk lihat semua memory tersimpan, gunakan fitur Import/Export di panel Konteks.
          </p>
        </div>
      </div>
    </div>
  );
}

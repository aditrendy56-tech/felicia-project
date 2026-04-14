import { getCanonicalProfile, normalizeProfileInput, saveCanonicalProfile } from './_lib/profile.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token || token !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const profile = await getCanonicalProfile();
      return res.status(200).json({ profile });
    } catch (err) {
      console.error('[Profile] GET error:', err);
      return res.status(500).json({ error: 'Gagal mengambil profil.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const profileInput = normalizeProfileInput(body.profile || body);
      const saved = await saveCanonicalProfile(profileInput);
      return res.status(200).json({ ok: true, profile: saved });
    } catch (err) {
      console.error('[Profile] POST error:', err);
      return res.status(500).json({ error: 'Gagal menyimpan profil.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

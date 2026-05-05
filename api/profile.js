import { getCanonicalProfile, normalizeProfileInput, saveCanonicalProfile } from '../lib/profile.js';
import { setCorsHeaders, setSecurityHeaders, handleOptions } from '../lib/cors.js';
import { requireApiAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptions(res, req);
  }

  if (!requireApiAuth(req, res)) {
    return;
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

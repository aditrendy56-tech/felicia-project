import { convertTranscriptToMemories } from './_lib/transcript.js';
import { setCorsHeaders, setSecurityHeaders, handleOptions } from './_lib/cors.js';
import { requireApiAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') {
    return handleOptions(res, req);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireApiAuth(req, res)) {
    return;
  }

  const transcript = String(req.body?.transcript || '').trim();
  const source = String(req.body?.source || 'transcript_import').trim();
  const eventDate = String(req.body?.eventDate || '').trim() || null;
  const startDate = String(req.body?.startDate || '').trim() || null;
  const endDate = String(req.body?.endDate || '').trim() || null;
  const splitMode = String(req.body?.splitMode || 'none').trim() || 'none';

  if (!transcript) {
    return res.status(400).json({ error: 'Field "transcript" wajib diisi.' });
  }

  if (transcript.length < 40) {
    return res.status(400).json({ error: 'Transcript terlalu pendek untuk diextract.' });
  }

  try {
    const result = await convertTranscriptToMemorySeed(transcript, source, eventDate, startDate, endDate, splitMode);
    return res.status(200).json(result);
  } catch (err) {
    console.error('[Convert Transcript] Error:', err);
    return res.status(500).json({ error: 'Gagal convert transcript.' });
  }
}

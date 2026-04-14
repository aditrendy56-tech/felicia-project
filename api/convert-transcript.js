import { convertTranscriptToMemorySeed } from './_lib/transcript.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || token !== process.env.API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
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

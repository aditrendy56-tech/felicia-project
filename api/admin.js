import { setCorsHeaders, setSecurityHeaders, handleOptions } from '../lib/cors.js';
import { requireApiAuth } from '../lib/auth.js';

function getOp(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('op') || url.pathname.split('/').pop();
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);
  setSecurityHeaders(res);

  if (req.method === 'OPTIONS') return handleOptions(res, req);

  const op = String(getOp(req) || '').toLowerCase();

  if (!requireApiAuth(req, res)) return;

  try {
    if (op === 'system-status' || op === 'system_status') {
      // Forward to existing system-status handler to preserve behavior
      const mod = await import('./system-status.js');
      if (typeof mod.default === 'function') return mod.default(req, res);
    }

    if (op === 'import-memory' || op === 'import_memory') {
      const mod = await import('./import-memory.js');
      if (typeof mod.default === 'function') return mod.default(req, res);
    }

    if (op === 'convert-transcript' || op === 'convert_transcript') {
      const mod = await import('./convert-transcript.js');
      if (typeof mod.default === 'function') return mod.default(req, res);
    }

    if (op === 'check-db' || op === 'check_db') {
      // Adapted from check-db.js to return JSON
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

      try {
        const [{ count: commandsCount }, { count: memoriesCount }] = await Promise.all([
          supabase.from('felicia_commands').select('id', { head: true, count: 'exact' }).limit(1).then(r => ({ count: r.count, error: r.error })),
          supabase.from('felicia_memories').select('id', { head: true, count: 'exact' }).limit(1).then(r => ({ count: r.count, error: r.error })),
        ]);

        const sampleRes = await supabase.from('felicia_memories').select('id, content, embedding').limit(1);

        return res.status(200).json({
          ok: true,
          env: {
            SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
            SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          },
          summary: {
            commands_count: commandsCount?.count || commandsCount || 0,
            memories_count: memoriesCount?.count || memoriesCount || 0,
            sample: (sampleRes.data || [])[0] || null,
          }
        });
      } catch (err) {
        return res.status(500).json({ error: err?.message || 'Check DB failed' });
      }
    }

    return res.status(400).json({ error: 'Unknown admin op. Use ?op=system-status|import-memory|convert-transcript|check-db' });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Unexpected error' });
  }
}

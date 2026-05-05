import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(currentDir, '../../../.env.local');
const result = dotenv.config({ path: envPath, override: true });
if (result.error) {
  console.warn('[Backfill] .env.local load error:', result.error.message);
} else {
  console.log('[Backfill] .env.local loaded from:', envPath);
}

// Backfill embeddings for existing memories in batches
export async function backfillEmbeddings({ batchSize = 50, delayMs = 200 } = {}) {
  try {
    const [{ getSupabase }, { generateEmbedding }] = await Promise.all([
      import('../supabase.js'),
      import('./embeddings.js'),
    ]);

    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[Backfill] Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
      return;
    }

    let processed = 0;
    while (true) {
      const { data: rows, error } = await supabase
        .from('felicia_memories')
        .select('id, content')
        .is('embedding', null)
        .order('created_at', { ascending: true })
        .limit(batchSize);

      if (error) {
        console.error('[Backfill] query error:', error.message);
        break;
      }

      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        try {
          const text = String(row.content || '').slice(0, 15000);
          const emb = await generateEmbedding(text);
          if (emb && Array.isArray(emb) && emb.length > 0) {
            const { error: upErr } = await supabase
              .from('felicia_memories')
              .update({ embedding: emb })
              .eq('id', row.id);
            if (upErr) {
              console.error('[Backfill] update error for', row.id, upErr.message);
            } else {
              processed += 1;
              console.log(`[Backfill] updated ${row.id} (${processed})`);
            }
          } else {
            console.warn('[Backfill] embedding generation failed for', row.id);
          }
        } catch (e) {
          console.error('[Backfill] item exception for', row.id, e?.message || e);
        }
        // respect rate limits
        await new Promise(r => setTimeout(r, delayMs));
      }

      // If less than batchSize returned, we're done
      if (rows.length < batchSize) break;

      // Re-query the next batch after the current items have been updated.
      // Because updated rows no longer match `.is('embedding', null)`, there is no need for offset pagination.
    }

    console.log('[Backfill] Completed. Total processed:', processed);
  } catch (err) {
    console.error('[Backfill] error:', err?.message || err);
  }
}

// If run directly via `node backfill-embeddings.js` (ESM-safe)
const isDirectRun = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  backfillEmbeddings({ batchSize: 50, delayMs: 200 }).catch(e => console.error(e));
}

export default backfillEmbeddings;

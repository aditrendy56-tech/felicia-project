import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(currentDir, '../.env.local');
dotenv.config({ path: envPath, override: true });

async function checkEmbeddingStatus() {
  try {
    const { getSupabase } = await import('./_lib/supabase.js');
    const supabase = getSupabase();
    
    if (!supabase) {
      console.error('[Debug] Supabase not configured');
      return;
    }

    // Check total memories
    const { data: allMemories, error: err1 } = await supabase
      .from('felicia_memories')
      .select('id, content, embedding', { count: 'exact' })
      .limit(1);
    
    if (err1) {
      console.error('[Debug] Count error:', err1.message);
      return;
    }

    // Check memories WITHOUT embedding
    const { data: noEmb, error: err2 } = await supabase
      .from('felicia_memories')
      .select('id, content', { count: 'exact' })
      .is('embedding', null)
      .limit(1);

    if (err2) {
      console.error('[Debug] No-embedding count error:', err2.message);
      return;
    }

    // Check memories WITH embedding (sample)
    const { data: withEmb, error: err3 } = await supabase
      .from('felicia_memories')
      .select('id, content, embedding')
      .not('embedding', 'is', null)
      .limit(3);

    if (err3) {
      console.error('[Debug] With-embedding error:', err3.message);
      return;
    }

    console.log('\n📊 EMBEDDING STATUS:\n');
    console.log(`Total memories: ${allMemories?.count || 'unknown'}`);
    console.log(`Memories WITHOUT embedding: ${noEmb?.count || 0}`);
    console.log(`Memories WITH embedding: ${(allMemories?.count || 0) - (noEmb?.count || 0)}`);
    
    if (withEmb && withEmb.length > 0) {
      console.log('\n✓ Sample with embeddings (first 3):');
      withEmb.forEach((m, i) => {
        const embStr = m.embedding ? `[${m.embedding.slice(0, 3).join(', ')}...] (${m.embedding.length}d)` : 'null';
        console.log(`  ${i+1}. ID ${m.id}: ${m.content?.slice(0, 50)}... → ${embStr}`);
      });
    }

    if (noEmb && noEmb.count > 0) {
      console.log(`\n⚠️  Need to backfill: ${noEmb.count} memories`);
    } else {
      console.log('\n✅ All memories have embeddings!');
    }
    
  } catch (err) {
    console.error('[Debug] exception:', err?.message || err);
  }
}

checkEmbeddingStatus();

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(currentDir, '../../.env.local');
dotenv.config({ path: envPath, override: true });

console.log('📋 ENV CHECK:');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✓' : '✗');
console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');

async function checkStatus() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('\n🔍 CHECKING DATABASE STATUS:\n');
    
    // Check if embedding column exists
    const { data: cols, error: colErr } = await supabase
      .rpc('get_columns', { table_name: 'felicia_memories' })
      .catch(() => ({ data: null, error: 'RPC not available' }));

    // Check total memories count
    const { count, error: countErr } = await supabase
      .from('felicia_memories')
      .select('*', { count: 'exact', head: true });

    console.log(`Total memories in database: ${count || 0}`);
    
    if (countErr) {
      console.log(`❌ Error counting memories:`, countErr.message);
      return;
    }

    // Check how many have embeddings
    const { count: withEmb, error: embErr } = await supabase
      .from('felicia_memories')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    if (embErr) {
      console.log(`❌ Error checking embeddings:`, embErr.message);
      return;
    }

    const withoutEmb = (count || 0) - (withEmb || 0);

    console.log(`Memories WITH embedding: ${withEmb || 0}`);
    console.log(`Memories WITHOUT embedding: ${withoutEmb}`);

    // Sample a memory to see structure
    const { data: sample, error: sampleErr } = await supabase
      .from('felicia_memories')
      .select('id, content, embedding')
      .limit(1);

    if (!sampleErr && sample && sample.length > 0) {
      console.log(`\n✓ Sample memory:`);
      console.log(`  - ID: ${sample[0].id}`);
      console.log(`  - Content: ${sample[0].content?.slice(0, 80)}...`);
      if (sample[0].embedding) {
        if (Array.isArray(sample[0].embedding)) {
          console.log(`  - Embedding: array[${sample[0].embedding.length}] ✓`);
        } else if (typeof sample[0].embedding === 'object') {
          console.log(`  - Embedding: ${JSON.stringify(sample[0].embedding).slice(0, 80)}...`);
        } else {
          console.log(`  - Embedding: ${sample[0].embedding}`);
        }
      } else {
        console.log(`  - Embedding: null`);
      }
    }

  } catch (err) {
    console.error('❌ Exception:', err?.message || err);
  }
}

checkStatus();

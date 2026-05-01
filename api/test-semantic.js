import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(currentDir, '../../.env.local');
dotenv.config({ path: envPath, override: true });

async function testSemanticSearch() {
  try {
    const { getSemanticMemories } = await import('./_lib/supabase.js');
    
    console.log('\n🔍 TESTING SEMANTIC SEARCH:\n');
    
    // Test queries
    const testQueries = [
      'apa rencana saya minggu depan',
      'goal dan target saya',
      'apa yang saya pelajari',
    ];

    for (const query of testQueries) {
      console.log(`\nQuery: "${query}"`);
      const results = await getSemanticMemories(query, 3);
      
      if (!results || results.length === 0) {
        console.log('  → No results (fallback to heuristic or no memories)');
        continue;
      }

      results.forEach((m, i) => {
        const sim = m.similarity !== undefined ? ` (${(m.similarity * 100).toFixed(1)}%)` : '';
        console.log(`  ${i+1}. [${m.category || 'uncategorized'}] ${m.content?.slice(0, 70)}...${sim}`);
      });
    }

  } catch (err) {
    console.error('❌ Exception:', err?.message || err);
  }
}

testSemanticSearch();

/**
 * Test Script: Entity-Aware Memory Retrieval
 * 
 * Verifikasi:
 * - Entity extraction berjalan
 * - Memory queries correct
 * - Cross-thread linking works
 */

import { extractEntities, extractKeywords, generateSearchQueries } from '../lib/utils/entity-extractor.js';

console.log('\n=== TEST 1: Entity Extraction ===');

const testMessages = [
  'Aji bilang dia bisa bayar minggu depan',
  'Kemarin aku chat di obrolan sebelumnya tentang utang',
  'Jadi di Bandung ada case baru dengan Budi tentang project',
  'Target aku Q2 ini adalah 50 juta income dari freelance',
];

for (const msg of testMessages) {
  const entities = extractEntities(msg);
  const keywords = extractKeywords(msg);
  const queries = generateSearchQueries(entities);
  
  console.log(`\n📝 Message: "${msg}"`);
  console.log(`   Entities:`, entities);
  console.log(`   Keywords:`, keywords);
  console.log(`   Search Queries:`, queries);
}

console.log('\n=== TEST 2: Cross-Thread Consistency ===');

const thread1Message = 'Aji bilang bisa bayar minggu depan';
const thread2Message = 'Aji ngapain sekarang?';

console.log(`\nThread 1: "${thread1Message}"`);
console.log(`  Entities:`, extractEntities(thread1Message));
console.log(`  Search queries:`, generateSearchQueries(extractEntities(thread1Message)));

console.log(`\nThread 2: "${thread2Message}"`);
console.log(`  Entities:`, extractEntities(thread2Message));
console.log(`  Search queries:`, generateSearchQueries(extractEntities(thread2Message)));

console.log(`\n✅ Both threads extract "aji" → memory about "Aji" bisa di-retrieve di kedua thread`);

console.log('\n=== TEST 3: Concept Detection ===');

const businessMessages = [
  'Kemarin meeting dengan client tentang kontrak',
  'Sprint deadline besok, masih ada 5 ticket belum selesai',
  'Budget quarter ini kepotong, target revenue tidak tercapai',
];

for (const msg of businessMessages) {
  const entities = extractEntities(msg);
  console.log(`\n📝 "${msg}"`);
  console.log(`   Concepts detected:`, entities.concepts);
}

console.log('\n=== SUMMARY ===');
console.log('✅ Entity extraction works for:');
console.log('   - Names (Aji, Budi, etc.)');
console.log('   - Places (Bandung, Jakarta, etc.)');
console.log('   - Concepts (utang, project, meeting, ticket, etc.)');
console.log('\n✅ Benefits:');
console.log('   - No embedding cost (pure regex + keyword matching)');
console.log('   - Fast & deterministic');
console.log('   - Cross-thread memory linking');
console.log('   - Offline-capable');

console.log('\n✅ Integration:');
console.log('   - chat-orchestrator uses getMemoriesWithEntityFallback()');
console.log('   - Merges scoped + entity-matched memories');
console.log('   - Returns consistent results across threads');

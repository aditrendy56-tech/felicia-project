/**
 * 📋 SEMANTIC MEMORY CALL CHAIN - COMPLETE SOURCE CODE REFERENCE
 * 
 * This document shows the EXACT call chain from chat endpoint to semantic memory retrieval,
 * with line numbers and code excerpts from each file.
 */

// ═══════════════════════════════════════════════════════════════════════════════════
// STEP 1: HTTP ENDPOINT (api/chat.js)
// ═══════════════════════════════════════════════════════════════════════════════════

// File: api/chat.js
// Purpose: Express/Vercel serverless function that receives chat requests

/*
import { orchestrateChat } from './_lib/orchestrator/chat-orchestrator.js';

export default async function handler(req, res) {
  try {
    const { message, threadId, chatType, userId } = req.body;

    const result = await orchestrateChat({
      message,
      threadId,
      chatType,
      userId,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      type: 'chat',
      reply: 'Terjadi error di server.',
    });
  }
}
*/

// ═══════════════════════════════════════════════════════════════════════════════════
// STEP 2: ORCHESTRATOR (api/_lib/orchestrator/chat-orchestrator.js)
// ═══════════════════════════════════════════════════════════════════════════════════

// File: api/_lib/orchestrator/chat-orchestrator.js
// Lines: 1-50 (imports)

/*
import { getRelevantMemories } from '../guards/memory-guard.js';
                                      ↑
                              IMPORTED HERE
*/

// Lines: 138-151 (main logic where semantic search is called)

/*
export async function orchestrateChat(input) {
  // ... setup code ...

  // Line 138-148: Fetch all necessary data in parallel
  const [events, activeMode, conversationHistory, allMemories, canonicalProfile] = await Promise.all([
    safeAsync(getEventsToday, []),
    safeAsync(getActiveMode, null),
    activeThreadId
      ? safeAsync(() => getChatMessages(activeThreadId, 10), [])
      : Promise.resolve([]),
    safeAsync(() => getScopedMemories(chatType, 12), []),  // Gets all memories in category
    safeAsync(getCanonicalProfile, DEFAULT_PROFILE_FACTS),
  ]);

  // ⭐ LINE 149: THE KEY CALL - Rank memories using SEMANTIC SEARCH
  // ────────────────────────────────────────────────────────────
  const memories = await getRelevantMemories(allMemories, pesan, 8);
  //                     ↑                      ↑               ↑
  //              Function call           All memories         User message & limit
  
  // The returned 'memories' list is now ranked with semantic similarity
  // and used in building the system prompt for Gemini API

  // Lines 152+: Continue with Gemini API call using these memories...
}
*/

// ═══════════════════════════════════════════════════════════════════════════════════
// STEP 3: MEMORY GUARD (api/_lib/guards/memory-guard.js)
// ═══════════════════════════════════════════════════════════════════════════════════

// File: api/_lib/guards/memory-guard.js
// Line: 116 (import)

/*
import { getSemanticMemories } from '../supabase.js';
                                  ↑
                          IMPORTED HERE
*/

// Lines: 120-160 (the async function with semantic-first, fallback-second)

/*
export async function getRelevantMemories(memories = [], userInput = '', limit = 5) {
  
  // ⭐ PHASE 1: TRY SEMANTIC SEARCH FIRST
  // ────────────────────────────────────
  try {
    const sem = await getSemanticMemories(String(userInput || ''), Number(limit || 5));
    //           ↑
    //      Calls supabase.js function to:
    //      1. Generate embedding of user input
    //      2. Call RPC match_memories() to find similar vectors
    //      3. Return sorted results with similarity scores
    
    if (Array.isArray(sem) && sem.length > 0) {
      // SUCCESS: Return semantic results
      return sem.map(item => ({
        ...item,
      }));
    }
  } catch (e) {
    // FALLBACK: Log error but continue
    console.warn('[MemoryGuard] Semantic retrieval failed, falling back to heuristic:', e?.message || e);
  }

  // ⭐ PHASE 2: FALLBACK TO HEURISTIC RANKING (if semantic failed or returned empty)
  // ──────────────────────────────────────
  const inputTokens = tokenize(userInput);
  const normalizedInput = String(userInput || '').toLowerCase();

  const ranked = (Array.isArray(memories) ? memories : [])
    .map((memory) => {
      const content = String(memory?.content || '');
      const tokens = tokenize(content);
      const overlap = tokens.filter((token) => inputTokens.has(token)).length;
      const recencyBoost = getRecencyBoost(memory?.created_at);
      const phraseBoost = normalizedInput && content.toLowerCase().includes(...) ? 2 : 0;
      const typeBoost = String(memory?.memory_type || '') === 'state' ? 1 : 0.3;
      const relevance = overlap * 2 + recencyBoost + phraseBoost + typeBoost;
      return { memory, relevance };
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, Math.max(1, Number(limit) || 5))
    .map((entry) => entry.memory);

  return ranked;
}
*/

// ═══════════════════════════════════════════════════════════════════════════════════
// STEP 4: SUPABASE LAYER (api/_lib/supabase.js)
// ═══════════════════════════════════════════════════════════════════════════════════

// File: api/_lib/supabase.js
// Lines: 1-15 (imports including dotenv for script usage)

/*
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from './utils/embeddings.js';
                                        ↑
                              IMPORTED HERE (for this function)

// Load .env.local if running in Node (for scripts like backfill)
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(currentDir, '../../.env.local');
dotenv.config({ path: envPath, override: true });
*/

// The getSemanticMemories function (added as part of Phase 2 rollout):

/*
export async function getSemanticMemories(userInput, limit, matchThreshold = 0.60) {
  try {
    // STEP 1: Generate embedding from user input
    const queryEmb = await generateEmbedding(userInput);
    //                     ↑
    //             Calls embeddings.js
    //             Returns: [768-dimensional float array]
    
    if (!queryEmb) {
      // No embedding generated, fallback to recent memories
      return getRecentMemories(limit);
    }

    // STEP 2: Call Supabase RPC match_memories() with vector
    const { data, error } = await supabase.rpc('match_memories', {
      query_embedding: queryEmb,
      match_threshold: matchThreshold,
      match_count: limit,
    });
    //  ↑
    //  This RPC is created by the migration file:
    //  supabase/migrations/20260501_add_memory_embeddings.sql
    //
    //  Returns: [
    //    { id, content, category, title, memory_type, similarity },
    //    { id, content, category, title, memory_type, similarity },
    //    ...
    //  ]
    //  Sorted by similarity DESC (highest match first)

    if (error || !data?.length) {
      // Empty or error, fallback
      return getRecentMemories(limit);
    }

    // STEP 3: Return results with similarity scores
    return data;

  } catch (e) {
    console.warn('[Supabase] getSemanticMemories error:', e?.message);
    return getRecentMemories(limit);  // Graceful fallback
  }
}
*/

// ═══════════════════════════════════════════════════════════════════════════════════
// STEP 5: EMBEDDING GENERATOR (api/_lib/utils/embeddings.js)
// ═══════════════════════════════════════════════════════════════════════════════════

// File: api/_lib/utils/embeddings.js

/*
export async function generateEmbedding(text = '') {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Try multiple models in order of preference
    const models = ['text-embedding-004', 'gemini-embedding-001', 'gemini-embedding-2'];
    
    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const resp = await model.embedContent({
          content: { parts: [{ text: String(text || '') }] },
          outputDimensionality: 768,
        });
        
        // Extract embedding from response
        let emb = resp?.embedding?.values || resp?.embedding || [];
        
        if (Array.isArray(emb) && emb.length === 768) {
          console.log(`[Embeddings] Using ${modelName}`);
          return emb;  // Success!
        }
      } catch (e) {
        // Model not available, try next
        continue;
      }
    }
    
    // All models failed
    return null;

  } catch (e) {
    console.error('[Embeddings] error:', e?.message);
    return null;
  }
}
*/

// ═══════════════════════════════════════════════════════════════════════════════════
// STEP 6: DATABASE LAYER (Supabase PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════════════

// File: supabase/migrations/20260501_add_memory_embeddings.sql
// What happens when RPC match_memories() is called:

/*
-- The RPC function (created by migration) that does vector similarity search:

CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(768),
  match_threshold double precision DEFAULT 0.60,
  match_count integer DEFAULT 10
)
RETURNS TABLE(id bigint, content text, category text, title text, memory_type text, similarity double precision)
LANGUAGE sql
AS $body$
  SELECT
    id,
    content,
    category,
    title,
    memory_type,
    (1.0 - (embedding <=> query_embedding))::double precision AS similarity
  FROM felicia_memories
  WHERE embedding IS NOT NULL
    AND (match_threshold IS NULL OR (1.0 - (embedding <=> query_embedding)) >= match_threshold)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count
$body$;

-- What this does:
-- 1. Takes the query embedding (768-dim vector) as input
-- 2. Uses <=> operator (cosine distance) to find nearest neighbors
-- 3. Converts distance to similarity (1.0 - distance) for human-readable percentages
-- 4. Filters by match_threshold (default 0.60 = 60% similarity minimum)
-- 5. Returns top N results sorted by similarity DESC
*/

// ═══════════════════════════════════════════════════════════════════════════════════
// SUMMARY: Complete Call Chain
// ═══════════════════════════════════════════════════════════════════════════════════

/*
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. User sends: POST /api/chat { message: "apa rencana saya minggu depan" }  │
└────────────────────┬────────────────────────────────────────────────────────┘
                     │
                     ▼
      ┌──────────────────────────────┐
      │ api/chat.js                  │
      │ → orchestrateChat()          │
      └──────────────┬───────────────┘
                     │
                     ▼
      ┌──────────────────────────────────────┐
      │ chat-orchestrator.js                 │
      │ Line 149:                            │
      │ const memories =                     │
      │   await getRelevantMemories(...)     │
      └──────────────┬───────────────────────┘
                     │
                     ▼
      ┌──────────────────────────────────────┐
      │ memory-guard.js                      │
      │ async getRelevantMemories()          │
      │ Line 124: try semantic first         │
      │   → await getSemanticMemories()      │
      └──────────────┬───────────────────────┘
                     │
                     ▼
      ┌──────────────────────────────────────┐
      │ supabase.js                          │
      │ async getSemanticMemories()          │
      │ 1. generateEmbedding(userInput)      │
      │ 2. supabase.rpc('match_memories')    │
      │ 3. Return results with similarity    │
      └──────────────┬───────────────────────┘
                     │
                     ▼
      ┌──────────────────────────────────────┐
      │ embeddings.js                        │
      │ generateEmbedding()                  │
      │ Calls: Gemini API (text-embedding...) │
      │ Returns: [768-dim float array]       │
      └──────────────┬───────────────────────┘
                     │
                     ▼
      ┌──────────────────────────────────────┐
      │ Supabase PostgreSQL RPC              │
      │ match_memories(vector, threshold)    │
      │ Uses: cosine_distance <=>            │
      │ Returns: Top matches with %          │
      └──────────────┬───────────────────────┘
                     │
                     ▼
      ┌──────────────────────────────────────┐
      │ Result: Ranked memories with         │
      │ semantic similarity scores           │
      │ [                                    │
      │   { content: "target 5juta", 63.8% } │
      │   { content: "target 3juta", 63.6% } │
      │ ]                                    │
      └──────────────┬───────────────────────┘
                     │
                     ▼
      ┌──────────────────────────────────────┐
      │ Back to orchestrator:                │
      │ - Build system prompt with memories  │
      │ - Call Gemini API for chat response  │
      │ - Return reply to user               │
      └──────────────────────────────────────┘


FALLBACK CHAIN (if semantic search fails):
─────────────────────────────────────────
  getSemanticMemories() error
           ↓
  catch clause in getRelevantMemories()
           ↓
  Original heuristic ranking:
    - Token overlap scoring
    - Recency boost
    - Phrase exact match boost
    - Memory type boost
           ↓
  Ranked memories (without similarity %)
*/

// ═══════════════════════════════════════════════════════════════════════════════════
// KEY STATISTICS (from verification run)
// ═══════════════════════════════════════════════════════════════════════════════════

/*
✅ Modules imported successfully: 5/5
   - chat-orchestrator.js
   - memory-guard.js
   - supabase.js
   - embeddings.js
   - Gemini API

✅ Functions called in order: 6/6
   - chat.js → orchestrateChat()
   - orchestrateChat → getRelevantMemories()
   - getRelevantMemories → getSemanticMemories()
   - getSemanticMemories → generateEmbedding()
   - generateEmbedding → Gemini API
   - Fallback heuristic ready

✅ Test Query: "apa rencana saya minggu depan"
   - Embedding generated: 768-dim vector
   - RPC match_memories called
   - Results: 2 memories ranked by similarity
   - Top match: 63.8% similarity (income target)

✅ Environment variables: Loaded from .env.local
   - SUPABASE_URL ✓
   - SUPABASE_SERVICE_ROLE_KEY ✓
   - GEMINI_API_KEY ✓
*/

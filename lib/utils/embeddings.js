import { GoogleGenerativeAI } from '@google/generative-ai';

// Utility to generate embeddings using Gemini text-embedding-004
export async function generateEmbedding(text) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[Embeddings] GEMINI_API_KEY not set');
      return null;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const modelCandidates = ['text-embedding-004', 'gemini-embedding-001', 'gemini-embedding-2'];
    let resp = null;
    let usedModel = null;

    for (const modelName of modelCandidates) {
      // The Gemini embeddings API shape can differ across client versions.
      // Try the most common forms first, then normalize to Array<number>.
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        if (model && typeof model.embedContent === 'function') {
          resp = await model.embedContent({
            content: {
              parts: [{ text: String(text || '') }],
            },
            outputDimensionality: 768,
          });
          usedModel = modelName;
        }
      } catch (err) {
        resp = null;
      }

      if (!resp && typeof genAI.embedContent === 'function') {
        try {
          resp = await genAI.embedContent({
            model: modelName,
            content: {
              parts: [{ text: String(text || '') }],
            },
            outputDimensionality: 768,
          });
          usedModel = modelName;
        } catch {
          resp = null;
        }
      }

      if (!resp && typeof genAI.getEmbeddings === 'function') {
        try {
          resp = await genAI.getEmbeddings({ model: modelName, input: String(text || '') });
          usedModel = modelName;
        } catch {
          resp = null;
        }
      }

      if (!resp && typeof genAI.embedText === 'function') {
        try {
          resp = await genAI.embedText({ model: modelName, input: String(text || '') });
          usedModel = modelName;
        } catch {
          resp = null;
        }
      }

      if (resp) break;
    }

    if (!resp) return null;

    // Common shapes:
    // - { data: [{ embedding: [..] }, ...] }
    // - { embeddings: [{ embedding: [...] }] }
    // - { embedding: [...] }
    let emb = null;
    if (Array.isArray(resp?.data) && resp.data[0] && Array.isArray(resp.data[0].embedding)) {
      emb = resp.data[0].embedding;
    } else if (Array.isArray(resp?.embeddings) && resp.embeddings[0] && Array.isArray(resp.embeddings[0].embedding)) {
      emb = resp.embeddings[0].embedding;
    } else if (Array.isArray(resp?.embedding?.values)) {
      emb = resp.embedding.values;
    } else if (Array.isArray(resp?.embedding)) {
      emb = resp.embedding;
    } else if (Array.isArray(resp?.values)) {
      emb = resp.values;
    }

    if (!emb || !Array.isArray(emb) || emb.length === 0) return null;

    // Ensure numbers only
    emb = emb.map((v) => Number(v));
    if (usedModel && usedModel !== 'text-embedding-004') {
      console.warn(`[Embeddings] Using fallback embedding model: ${usedModel}`);
    }
    return emb;
  } catch (err) {
    console.error('[Embeddings] generateEmbedding error:', err?.message || err);
    return null;
  }
}

export default generateEmbedding;

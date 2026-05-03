# External Runtime Integration

Felicia can act as the single source of truth (core brain) while external runtimes handle input/output such as voice UI, local agents, or device automation.

- **Felicia (Core Brain):** Node.js serverless API (Vercel) + Supabase memory store. Responsible for:
  - Memory (semantic search)
  - Chat history and threads
  - Planning, action orchestration, and deterministic logic

- **External Runtime(s):** Lightweight processes (examples: LiveKit + browser UI, Python local agent, or Node voice runtime) responsible only for:
  - Mic capture / audio streaming
  - TTS playback
  - Local device integration (optional, local-only)
  - Sending user utterances to Felicia and receiving textual replies

- **Communication:** REST API (simple contract) between external runtime and Felicia. External runtime is NOT granted direct DB access — all stateful operations go through the API.

Diagram (simple flow):

User Voice → LiveKit / Browser UI → Voice Agent (local/Python) → POST /api/external/chat → Felicia Orchestrator → Memory (Supabase) → Reply → Voice Agent → TTS → User

Security and operational notes:
- Use an API key scoped for external runtimes (`FELICIA_EXTERNAL_API_KEY`) — rotate as needed.
- Limit CORS and allowed origins for the external endpoint to dev domains (localhost) and authorized voice provider domains only.
- Keep orchestrator logic inside `api/_lib/orchestrator/chat-orchestrator.js` — external runtimes forward utterances and receive lightweight replies.

Deployment notes:
- The external endpoint is a minimal forwarder that validates an API key, performs a quick semantic memory check (to help the runtime know whether memory context influenced a reply), forwards the message to the orchestrator, and returns a concise payload: `{ reply, threadId, memoryUsed }`.
- This keeps Felicia as the single source of truth while enabling multiple voice runtimes to plug in safely.

# Offline-First Deterministic Features — Governance & Local Setup

**Date:** May 1, 2026  
**Purpose:** Define how Felicia should handle business logic (offline-deterministic) vs AI-driven features (online-optional)  
**Vision:** Zero token waste on business logic; AI only for context, reasoning, and intent parsing.

---

## Core Principle

**AI is a helper, not the engine.**

| What AI Does ✅ | What AI DOESN'T Do ❌ |
|---|---|
| Answer questions | Calculate ledger entries |
| Parse intent from chat | Decide budget allocation |
| Retrieve relevant memories | Generate schedule |
| Explain results | Track task state |
| Suggest improvements | Execute deterministic workflow |

**Result:** Lower token cost, faster execution, works offline, more reliable.

---

## Feature Design Rules

### Rule 1: Classify Features

Every feature must be classified as one of:

**Type A: Pure Deterministic (Offline-only)**
- No AI involved
- Zero token cost
- Examples: ledger calculator, task sorter, event merger, budget tracker
- Runs offline; optional cloud sync for backup

**Type B: Deterministic Core + Optional AI Enhancement**
- Core logic deterministic (offline, free)
- AI enhancement optional (online, token cost)
- Examples: finance ledger + AI expense categorization, scheduler + AI time-slot suggestion
- Offline = core works; online = AI suggestions available

**Type C: AI-Driven (Online, requires tokens)**
- Primarily reasoning-based
- Examples: conversation, memory retrieval, intent classification
- Optional offline fallback (cached data, simple heuristics)

### Rule 2: Implement Offline-First

For Type A & B features:

1. **Core logic in deterministic module**
   - Location: `api/_lib/[feature]/` (backend) or `local-agent/[feature]/` (laptop)
   - Code style: pure functions, no external API calls, testable
   - Example: `api/_lib/finance/ledger.js` (no Gemini calls)

2. **AI enhancement optional and separated**
   - Location: `api/_lib/[feature]/ai-helper.js` or `api/[feature]/enhance.js`
   - Optional import (feature works without it)
   - Marked as "experimental" or "requires online"
   - Example: `api/_lib/finance/ai-helper.js` → calls Gemini only for categorization hints

3. **Frontend handles offline gracefully**
   - Works offline with core logic
   - Shows "AI suggestion available (online only)" for enhancement features
   - No blocking on AI calls

### Rule 3: Token Cost Accounting

Every feature should document:

```
Feature: [name]
Core logic: [location]
AI enhancement: [location or none]

Offline cost: [tokens] (usually 0)
Online cost per action: [tokens]
Annual savings (100 daily actions): [token count]
```

**Example:**

```
Feature: Finance Ledger
Core logic: api/_lib/finance/ledger.js
AI enhancement: api/_lib/finance/ai-helper.js (expense categorization)

Offline cost: 0 tokens per entry
Online cost per entry: 1-2 tokens (categorization hint)
Annual savings (100 entries/year): 100-200 tokens
```

---

## Local Setup: Offline/Online Architecture

### Prerequisite: Local Agent Service

For laptop control + offline features:

**What it is:**
- Separate service on your laptop (Node.js, Python, or Go)
- Communicates with main Felicia backend via REST or WebSocket
- Performs OS operations (file, folder, app, system)
- Can work offline (queues actions for sync when online)

**Where it runs:**
- On your laptop (Windows, Mac, Linux)
- Localhost (127.0.0.1:3000 or similar)
- Or authenticated outbound connection to backend

**Why separate:**
- Backend can deploy to Vercel (cloud)
- Local agent stays on laptop (no secrets leak, instant response)
- Communication is encrypted + authenticated

---

## Checklist: Local Offline/Online Setup (For You)

### Phase 1: Architecture & Planning (Do Now)

- [ ] **Decide local agent transport**
  - Option A: Localhost (127.0.0.1:3000) — simplest, dev-only
  - Option B: Authenticated WebSocket — production, secure, always-on
  - Option C: Hybrid — localhost when available, fallback to authenticated outbound
  - **Recommendation:** Start with localhost; upgrade to WebSocket later

- [ ] **Decide feature priority**
  - What offline-deterministic features do you need first?
  - Example: Finance ledger, Task scheduler, Goal tracker, Time/calendar, File manager
  - Rank by: value × complexity

- [ ] **Define offline/online boundaries**
  - Which features work offline? (list them)
  - Which require online? (list them)
  - What's the sync strategy? (queue + retry when online)

### Phase 2: Local Agent Skeleton (1-2 weeks)

- [ ] **Create `local-agent/` directory** in repo
  ```
  local-agent/
  ├─ package.json
  ├─ index.js          (entry point, server)
  ├─ auth.js           (auth + token validation)
  ├─ transport.js      (communication: HTTP, WebSocket, etc)
  ├─ capabilities/
  │  ├─ file-ops.js    (open folder, read file, list files)
  │  ├─ app-launcher.js (launch app, open camera)
  │  ├─ system.js      (battery, WiFi, uptime info)
  │  └─ [feature].js   (finance, scheduler, tasks, etc)
  └─ queue.js          (offline action queue + sync)
  ```

- [ ] **Implement basic communication**
  - Local agent listens on localhost:3000 (or authenticated outbound)
  - Accepts JSON payloads: `{ action, target, params, requiresConfirm }`
  - Returns: `{ success, result, error, executedAt }`
  - Log every action with timestamp + user

- [ ] **Implement offline queue**
  - When offline, queue actions locally
  - When online, sync queue to backend
  - Simple SQLite or JSON file for queue storage
  - Retry failed actions with backoff

### Phase 3: First Offline-Deterministic Feature (1-2 weeks)

**Pick ONE feature to start:**

Option A: **Finance Ledger (Recommended — easiest)**
- Core: `api/_lib/finance/ledger.js` (backend) + `local-agent/finance/index.js` (local)
- Logic: add entry, calculate balance, export report — all deterministic
- Optional AI: categorization suggestions (separate module)
- Offline: ✅ full (core works)
- Online: ✅ sync to Supabase, AI suggestions

Option B: **Task Scheduler**
- Core: `api/_lib/scheduler/index.js` + `local-agent/scheduler/index.js`
- Logic: add task, sort by priority, reschedule — all deterministic
- Optional AI: priority hints (separate)
- Offline: ✅ full (core works)

Option C: **Goal Tracker**
- Similar structure to above

**Implementation checklist:**

- [ ] **Backend deterministic module**
  - File: `api/_lib/[feature]/core.js`
  - Functions: add, update, delete, query, calculate, export
  - No AI calls in core
  - Tests: unit tests for all functions

- [ ] **Local agent module**
  - File: `local-agent/[feature]/index.js`
  - Mirrors backend logic (or calls backend if online)
  - Can work offline (local state)
  - Syncs to backend when online

- [ ] **API endpoint**
  - `POST /api/[feature]/add` (create entry)
  - `GET /api/[feature]/list` (fetch entries)
  - `PUT /api/[feature]/:id` (update)
  - Returns deterministic result + offline status

- [ ] **Frontend integration**
  - Use feature offline (works with cached data)
  - Optional AI helper marked as "online only"
  - Show sync status

- [ ] **Database schema**
  - New table: `felicia_[feature]_entries` or similar
  - Columns: id, user_id, data, created_at, synced_at, offline_id
  - Indexes: user_id, created_at

### Phase 4: Local Device Control (2-3 weeks)

- [ ] **Device intent parsing** (`api/_lib/device/intent-to-action.js`)
  - Translate: "open camera" → `{ action: 'open-app', target: 'camera', risk: 4 }`
  - Translate: "open videos folder" → `{ action: 'open-folder', target: '/Users/.../Videos', risk: 3 }`

- [ ] **Risk & policy engine** (`api/_lib/device/policy.js`)
  - Assign risk level 1-10 based on action type
  - Decide: execute directly, ask for confirm, or block

- [ ] **Local agent capabilities** (`local-agent/capabilities/`)
  - File ops: open folder, list files, read file (read-only for now)
  - App launcher: launch trusted apps, open camera preview
  - System info: battery, WiFi, uptime

- [ ] **Confirmation flow**
  - High-risk actions (7+) require explicit user approval
  - Low-risk actions (1-3) execute with light feedback
  - All logged in DB for audit

### Phase 5: Offline Sync & Queue (Optional, Later)

- [ ] **Queue system for offline actions**
  - When offline, queue action locally
  - When online, sync to backend + database
  - Retry with exponential backoff
  - Mark synced actions in local DB

- [ ] **Conflict resolution**
  - If local action conflicts with remote, resolve by timestamp
  - Keep both copies + log conflict
  - User can manually merge if needed

---

## Implementation Priorities

### Must Do Before Production Deploy (Blocking)
1. ✅ Verify backend deterministic features (core logic)
2. ✅ Verify no AI calls in core feature logic
3. ✅ Add offline-first flag to features in DB schema

### Should Do Before Phase 2 Features (1-2 weeks)
1. Local agent skeleton (listen on localhost, basic auth)
2. One offline-deterministic feature (e.g., finance ledger)
3. Offline queue system

### Can Do Later (3-4 weeks)
1. Multi-feature local support
2. WebSocket vs HTTP decision + implementation
3. Advanced conflict resolution
4. Advanced AI enhancement modules

---

## Example: Finance Ledger (Complete Walkthrough)

### Backend Core (`api/_lib/finance/ledger.js`)

```javascript
// Pure deterministic functions — no AI, no external calls
export function addEntry(userId, entry) {
  // entry = { amount, category, description, date }
  const id = generateId();
  const record = { id, userId, ...entry, createdAt: new Date() };
  // Store in DB
  return record;
}

export function calculateBalance(userId, entries) {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

export function exportReport(userId, entries) {
  // CSV or JSON export
  return generateReport(entries);
}
```

### Optional AI Helper (`api/_lib/finance/ai-helper.js`)

```javascript
// Only for suggestions — optional, token-cost
export async function suggestCategory(description) {
  const prompt = `Categorize expense: "${description}"`;
  const result = await askGemini(prompt);
  return result.category; // "Groceries", "Transport", etc
}
```

### API Endpoint (`api/finance.js`)

```javascript
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const entry = await addEntry(req.user.id, req.body);
    // Optionally: const suggestion = await suggestCategory(req.body.description);
    res.json({ entry, suggestion: null }); // suggestion is optional
  }
}
```

### Local Agent (`local-agent/finance/index.js`)

```javascript
// Works offline with local cache
export function addEntry(entry) {
  const localDb = loadLocal();
  const record = { id: uuid(), ...entry };
  localDb.entries.push(record);
  saveLocal(localDb);
  // Queue for sync when online
  queueAction({ type: 'finance-add', data: record });
  return record;
}
```

### Result

- **Offline:** User can add finance entries, calculate balance — all instant, zero token
- **Online:** Fetch from Supabase, optionally get AI categorization suggestions
- **Sync:** Queue syncs when online; conflicts resolved by timestamp

**Token cost:** 0 (core) + 1 token per categorization (optional) = **95% savings vs full AI**

---

## Summary

**Your vision is 100% aligned with best practices:**

✅ AI as helper (memory, questions, context) — not engine  
✅ Deterministic business logic offline — zero token cost  
✅ Optional AI enhancement online — only when needed  
✅ Local agent for laptop control — offline-capable, online-enhanced  
✅ Offline-first architecture — works always, sync when online  

**Next step:** Pick one offline-deterministic feature (finance ledger recommended) and start Phase 3.

---

## Files to Create (Order)

1. ✅ This file: `OFFLINE_FIRST_GOVERNANCE.md`
2. `local-agent/package.json` (skeleton)
3. `local-agent/index.js` (server)
4. `api/_lib/finance/ledger.js` (first feature)
5. `api/_lib/finance/ai-helper.js` (optional enhancement)
6. `api/finance.js` (endpoint)
7. `local-agent/finance/index.js` (local mirror)

---

## Questions to Answer

Before you start building, decide:

1. **Local agent transport?** (localhost vs WebSocket vs hybrid)
2. **First feature?** (finance, scheduler, goals, tasks)
3. **Offline queue?** (SQLite, JSON file, Supabase local copy)
4. **Sync strategy?** (real-time, batch, manual)
5. **Auth between laptop + backend?** (token, certificate, shared secret)

---


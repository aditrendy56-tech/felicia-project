# Local Offline/Online Setup — Quick Checklist

**For:** Building Felicia's laptop agent with offline-deterministic features  
**Date:** May 1, 2026  
**Read full guide:** `OFFLINE_FIRST_GOVERNANCE.md`

---

## Your Vision (✅ Confirmed)

| What | Why | How |
|------|-----|-----|
| AI as helper | Saves tokens, faster, offline-capable | Conversation, intent, memory, suggestions |
| Business logic offline | 95-99% token savings | Finance, scheduler, goals, tasks = pure math |
| Local agent on laptop | Instant, no cloud latency, privacy | Separate service, localhost or WebSocket |
| Optional online enhancement | Better suggestions when you want them | AI categorization, time-slot hints (separate modules) |

---

## Setup Phases (Your Roadmap)

### Phase 1: Planning (Today)
- [ ] Choose local agent transport: **Localhost** (simplest, dev) OR **WebSocket** (production) OR **Hybrid**
- [ ] Pick first offline feature: **Finance ledger** (easiest) OR Scheduler OR Goals
- [ ] Define offline/online boundary: What works offline? What needs online?
- [ ] Decide sync strategy: real-time / batch / manual

### Phase 2: Local Agent Skeleton (1–2 weeks)
- [ ] Create `local-agent/` directory structure
- [ ] Build basic server (listen on localhost:3000 or WebSocket)
- [ ] Implement auth (token validation)
- [ ] Implement offline queue (SQLite or JSON)
- [ ] Test communication between backend ↔ local agent

### Phase 3: First Offline Feature (1–2 weeks)
**Pick ONE:**

**Option A: Finance Ledger (Recommended)**
```
Backend: api/_lib/finance/ledger.js (pure functions, no AI)
Local:   local-agent/finance/index.js (offline mirror)
API:     POST /api/finance/add, GET /api/finance/list
DB:      felicia_finance_entries table
Optional: api/_lib/finance/ai-helper.js (categorization suggestions)
```

**Option B: Task Scheduler**
```
Backend: api/_lib/scheduler/index.js
Local:   local-agent/scheduler/index.js
API:     POST /api/scheduler/add, GET /api/scheduler/list
DB:      felicia_scheduler_entries table
Optional: api/_lib/scheduler/ai-helper.js (priority hints)
```

**Option C: Goal Tracker**
```
Same pattern as above
```

### Phase 4: Device Control (2–3 weeks)
- [ ] Intent parsing: "open camera" → `{ action, target, risk }`
- [ ] Policy engine: Assign risk 1–10, decide if confirm needed
- [ ] Local capabilities: file ops, app launcher, system info
- [ ] Confirmation flow: high-risk (7+) ask, low-risk (1–3) execute

### Phase 5: Advanced Offline (Optional, later)
- [ ] Offline queue + sync for all features
- [ ] Conflict resolution (timestamp-based)
- [ ] Local caching strategy

---

## Tech Stack (Minimal Viable)

### Backend (Vercel serverless)
```javascript
// api/_lib/finance/ledger.js
export function addEntry(userId, entry) { /* pure logic */ }
export function calculateBalance(userId, entries) { /* pure math */ }
export function exportReport(userId, entries) { /* deterministic */ }
```

### Local Agent (Node.js on laptop)
```javascript
// local-agent/index.js
const express = require('express');
const app = express();

app.post('/action', (req, res) => {
  // { action, target, params }
  const result = executeAction(req.body);
  res.json({ success: true, result });
});

app.listen(3000);
```

### Database (Supabase)
```sql
CREATE TABLE felicia_finance_entries (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  amount NUMERIC,
  category TEXT,
  description TEXT,
  created_at TIMESTAMP,
  synced_at TIMESTAMP,
  offline_id TEXT -- for local merging
);
```

---

## Decision Tree: Offline vs Online

```
User: "Add expense of 50k for groceries"
  ↓
AI parses intent → "add expense"
  ↓
Backend: api/finance.js
  ↓
If offline:
  → Local agent adds to SQLite
  → Queue for sync when online
  → Return: { success: true, offline: true }
  ↓
If online:
  → Add to Supabase
  → Optionally call ai-helper for categorization suggestion
  → Return: { success: true, suggestion: "Groceries" }
```

---

## File Structure After Phase 3

```
felicia-project/
├─ api/
│  ├─ finance.js               (endpoint: POST/GET /api/finance/*)
│  ├─ _lib/
│  │  ├─ finance/
│  │  │  ├─ ledger.js          (pure: add, balance, export)
│  │  │  └─ ai-helper.js       (optional: categorization)
│  │
├─ local-agent/
│  ├─ package.json
│  ├─ index.js                 (server: listen on localhost:3000)
│  ├─ auth.js                  (token validation)
│  ├─ transport.js             (HTTP/WebSocket)
│  ├─ queue.js                 (offline queue + sync)
│  ├─ finance/
│  │  └─ index.js              (offline mirror, uses SQLite)
│  ├─ capabilities/
│  │  ├─ file-ops.js
│  │  ├─ app-launcher.js
│  │  └─ system.js
│
├─ supabase/
│  ├─ migrations/
│  │  └─ 20260501_finance_entries.sql
│
└─ OFFLINE_FIRST_GOVERNANCE.md  (full guide)
```

---

## Key Metrics

### Token Cost Comparison

**Feature: Finance Ledger**

| Approach | Tokens/entry | 100 entries/year | Notes |
|----------|---|---|---|
| Pure deterministic (ledger.js) | 0 | 0 | Add, calculate, export |
| + Optional AI enhancement (ai-helper.js) | 1 | 100 | Categorization hints only |
| Full AI-driven approach | 10+ | 1000+ | Every operation calls AI |

**Savings: 95–99%**

---

## First Actions

### Right Now (Decision)
1. Read `OFFLINE_FIRST_GOVERNANCE.md` sections "Core Principle" + "Feature Design Rules"
2. Answer 5 questions at bottom:
   - Local agent transport?
   - First feature?
   - Offline queue strategy?
   - Sync method?
   - Auth between laptop + backend?

### This Week (Planning)
1. Create `local-agent/` directory
2. Write `package.json` for local agent
3. Decide first feature (finance ledger recommended)
4. Draw offline/online boundary

### Next Week (Phase 2)
1. Code local agent skeleton
2. Test localhost communication
3. Plan Phase 3 feature implementation

---

## Important Principles (Copy These)

✅ **AI helps, doesn't decide**
- AI parses what you said, suggests improvements, answers questions
- AI does NOT calculate, schedule, track, or execute business logic

✅ **Offline first, online optional**
- Core feature works offline (fast, reliable, zero tokens)
- Online part is for enhancement only (suggestions, sync, backup)

✅ **Local agent is separate service**
- Frontend: chat, UI, confirmation
- Backend: intent, policy, routing
- Local agent: OS execution (files, apps, system)
- No direct frontend → OS calls; always through local agent

✅ **Every action is auditable**
- Log who asked, what ran, what result
- Store pending actions in DB before execution
- Return clear success/failure to user

---

## Questions? Reference These

| Q | Answer |
|---|--------|
| "Why separate local agent?" | OS calls can't go through serverless; need persistent service on laptop |
| "Why offline queue?" | Network drops happen; queue ensures no action is lost |
| "Why not just AI the whole thing?" | 95-99% token waste; slower; doesn't work offline; unreliable |
| "When do I deploy this?" | Phase 2 after Phase 3 feature is stable (2–3 weeks) |
| "Can AI suggest actions?" | Yes! AI can say "I think you meant to add this expense"; you confirm or ignore |

---

## Next: You Decide

Pick one and move forward:

**Option A:** Start Phase 2 (local agent skeleton) — 1 week effort  
**Option B:** Start Phase 3 (finance ledger feature) — 2 weeks effort  
**Option C:** Read full guide first + answer the 5 questions  

**Recommendation:** Option C (1 hour) → then Option A (1 week) → then Option B (2 weeks)

---

**Status:** Architecture locked ✅ | Code ready ✅ | Documentation complete ✅ | **Next: Your decision on transport + first feature**

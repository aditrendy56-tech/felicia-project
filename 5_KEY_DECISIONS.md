# 5 Key Decisions — Answer These to Start Phase 2

**Purpose:** These 5 decisions unblock Phase 2 implementation (local agent skeleton)

**Deadline:** By end of this week (May 5)

**Effort to decide:** 30 minutes

**Effort to implement after decision:** 1–2 weeks

---

## Decision 1: Local Agent Transport

**Question:** How should the laptop agent communicate with the Vercel backend?

### Option A: Localhost (Simplest)
```
Your laptop:
  Frontend: localhost:5173 (React)
  Backend: Vercel (serverless)
  Local agent: localhost:3000 (Node.js)
  
Communication:
  Frontend → Vercel (HTTPS)
  Vercel → localhost:3000 (HTTP, same machine)
  
When to use: Development only, not for production
```
**Pros:** Instant, no auth needed, simplest code  
**Cons:** Only works when local agent is running on same machine; not production-ready

### Option B: Authenticated WebSocket (Production)
```
Your laptop:
  Frontend: any IP (React)
  Backend: Vercel (serverless)
  Local agent: connects to Vercel via WebSocket
  
Communication:
  Local agent → Vercel (authenticated WebSocket)
  Vercel queues action → sends back to local agent
  Frontend doesn't touch local agent directly
  
When to use: Production, can work remotely
```
**Pros:** Secure, production-ready, works remotely, always-on  
**Cons:** More complex to implement, requires auth tokens

### Option C: Hybrid (Start Simple, Upgrade Later)
```
Phase 1 (Now): Localhost for dev
Phase 2 (Later): Add WebSocket for production
Both run simultaneously, config determines which is active
```
**Pros:** Start fast, upgrade when ready  
**Cons:** Maintain two code paths

### **Recommendation: Option C (Hybrid)**
- Start with localhost (1 week to code)
- Later add WebSocket before production deploy (1 additional week)
- Keep both, toggle via config

### **Your decision:**
- [ ] Option A (localhost only, dev)
- [ ] Option B (WebSocket only, production)
- [ ] Option C (hybrid, start localhost, add WebSocket later)

---

## Decision 2: First Offline-Deterministic Feature

**Question:** Which feature do you want to implement first in Phase 3?

### Option A: Finance Ledger (Recommended)
```
What it does:
  - Add income/expense entry
  - Calculate running balance
  - View transaction history
  - Export CSV report

Why recommended:
  - Pure math (no AI needed)
  - Easiest to test offline
  - Clear before/after: balance goes up/down
  - 95% token savings vs AI-driven approach

Time estimate: 2 weeks (backend + local + API + UI)

Core logic (0 tokens):
  api/_lib/finance/ledger.js
  ├─ addEntry(amount, category, description)
  ├─ calculateBalance(entries)
  ├─ exportReport(entries)

Optional AI (1 token/entry, separate):
  api/_lib/finance/ai-helper.js
  └─ suggestCategory(description)

DB: felicia_finance_entries
```

### Option B: Task Scheduler
```
What it does:
  - Add task with deadline
  - Sort by urgency/priority
  - Mark complete/incomplete
  - View calendar view

Why good:
  - Similar structure to finance
  - Good for offline scenario (backlog)
  - Clear completion status

Time estimate: 2 weeks

Pure logic: addTask, calculatePriority, reschedule
Optional AI: prioritySuggestion(task description)
DB: felicia_scheduler_entries
```

### Option C: Goal Tracker
```
What it does:
  - Add goal (short/medium/long term)
  - Track progress (0-100%)
  - Update milestones
  - View all goals

Why good:
  - Personal relevance
  - Good for offline planning
  
Time estimate: 2 weeks

Pure logic: addGoal, updateProgress, checkMilestones
Optional AI: progressSuggestion(goal, current_data)
DB: felicia_goals_entries
```

### Option D: Time Management (Calendar Sync)
```
What it does:
  - Sync Google Calendar events
  - Show daily schedule
  - Merge overlapping events
  - Calculate free time

Why good:
  - Already have calendar integration
  - Builds on existing code

Time estimate: 2-3 weeks

Pure logic: mergeEvents, calculateFreeTime, exportDailyView
Optional AI: timeBlockingSuggestion(events, tasks)
DB: felicia_calendar_merged (local cache)
```

### **Recommendation: Option A (Finance Ledger)**
- Simplest pure-math feature
- Clearest offline benefit (no network needed to add expense)
- Best token savings example (95%)
- Fastest to demonstrate working

### **Your decision:**
- [ ] Option A (finance ledger, recommended)
- [ ] Option B (task scheduler)
- [ ] Option C (goal tracker)
- [ ] Option D (time/calendar management)
- [ ] Other (describe):

---

## Decision 3: Offline Queue Storage

**Question:** How should the local agent store queued actions when offline?

### Option A: SQLite Database
```
Implementation:
  local-agent/queue.db (SQLite file)
  
Schema:
  CREATE TABLE pending_actions (
    id TEXT PRIMARY KEY,
    type TEXT,
    data JSON,
    created_at TIMESTAMP,
    synced_at TIMESTAMP,
    synced BOOLEAN
  )

Pros:
  - Reliable, ACID transactions
  - Queries (find pending, find synced)
  - Works across local agent restarts

Cons:
  - Need SQLite library (small)
  - Slightly more complex

Time to implement: 3 days
```

### Option B: JSON File
```
Implementation:
  local-agent/queue.json
  
Format:
  {
    "actions": [
      { "id": "...", "type": "...", "synced": false },
      { "id": "...", "type": "...", "synced": true }
    ]
  }

Pros:
  - Simple, no dependencies
  - Easy to inspect/debug
  - Read/write with fs module

Cons:
  - Not ACID (crashes lose data)
  - Read whole file every time
  - Doesn't scale beyond 1000 items

Time to implement: 1 day
```

### Option C: IndexedDB (Browser-side)
```
Implementation:
  Frontend IndexedDB + sync to backend
  
Flow:
  User offline → add action to IndexedDB
  User goes online → frontend syncs to backend
  Backend syncs to local agent

Pros:
  - Already in browser
  - Works across browser refreshes

Cons:
  - Only works if frontend is open
  - Local agent can't access it directly
  - Requires frontend-backend sync logic

Time to implement: 5 days
```

### Option D: Memory + File Fallback (Simplest)
```
Implementation:
  Keep in memory, dump to file on shutdown

Pros:
  - No dependencies
  - Very simple

Cons:
  - Crashes lose data
  - Not great for reliability

Time to implement: 1 day
```

### **Recommendation: Option A (SQLite)**
- Best balance of reliability + simplicity
- ACID guarantees (no data loss)
- Can query for pending actions
- Easy to debug and inspect

### **Your decision:**
- [ ] Option A (SQLite, recommended)
- [ ] Option B (JSON file, simpler but less safe)
- [ ] Option C (IndexedDB + frontend sync)
- [ ] Option D (memory + file, simplest)

---

## Decision 4: Online Sync Strategy

**Question:** When offline actions sync back online, how should it work?

### Option A: Real-Time Sync (On Demand)
```
Flow:
  User goes online → immediately sync all pending actions
  Latency: seconds
  
Implementation:
  Sync daemon checks online status every 5 seconds
  When online detected, upload pending actions immediately

Pros:
  - User sees results immediately
  - Fresh data right away

Cons:
  - Requires always-running daemon
  - More complex error handling

Time to implement: 3 days
```

### Option B: Batch Sync (Scheduled)
```
Flow:
  User goes online → waits for next sync window (e.g., every 5 minutes)
  Sync daemon batches 10+ actions together
  Latency: up to 5 minutes

Implementation:
  Cron job runs every 5 minutes
  Collects pending actions, sends batch to backend
  Backend processes all at once

Pros:
  - More efficient (fewer API calls)
  - Less complex

Cons:
  - Slight delay
  - Need to handle partial failures (5 of 10 succeed)

Time to implement: 2 days
```

### Option C: Manual Sync (User Initiated)
```
Flow:
  User clicks "Sync Now" button when online
  All pending actions upload

Implementation:
  Frontend button → POST /api/sync-pending
  Backend processes, returns results

Pros:
  - User control
  - Very simple

Cons:
  - User forgets to click
  - Delayed sync

Time to implement: 1 day
```

### Option D: Hybrid (Start Manual, Upgrade to Auto)
```
Phase 1 (Now): Manual sync (user clicks button)
Phase 2 (Later): Auto-detect online, sync immediately
Both implemented, toggle via config
```

### **Recommendation: Option D (Hybrid)**
- Start simple (Option C: manual)
- Later upgrade to auto-detect (Option A: real-time)
- Gives you time to test sync logic before automating

### **Your decision:**
- [ ] Option A (real-time sync on online detect)
- [ ] Option B (batch sync every N minutes)
- [ ] Option C (manual user-initiated sync)
- [ ] Option D (hybrid: manual now, auto later)

---

## Decision 5: Authentication Between Laptop + Backend

**Question:** How should the local agent prove it's your laptop (not a hacker)?

### Option A: Shared Secret Token
```
Setup:
  1. Generate random 32-char token on laptop
  2. User copies token to Vercel env vars
  3. Local agent includes token in every request

Implementation:
  local-agent sends: Authorization: Bearer TOKEN
  Vercel checks: env.LOCAL_AGENT_TOKEN === request.token
  
Pros:
  - Simplest
  - Works immediately

Cons:
  - Not great for security if token leaks
  - Can't revoke per-device
  - No expiry

Time to implement: 1 day
```

### Option B: Self-Signed Certificate
```
Setup:
  1. Generate cert on laptop: openssl req ...
  2. Upload cert public key to Vercel
  3. Local agent uses cert for HTTPS

Implementation:
  local-agent: https.createServer(cert)
  Vercel: verify client cert before accepting

Pros:
  - More secure
  - Can revoke individual certs

Cons:
  - More complex setup
  - Certificate management overhead

Time to implement: 3 days
```

### Option C: OAuth (Accounts-Based)
```
Setup:
  1. Local agent redirects user to Google/GitHub auth
  2. User grants permission on web browser
  3. Local agent gets OAuth token
  4. Uses token for all requests

Implementation:
  Complex OAuth flow

Pros:
  - Enterprise-grade security
  - User-revocable

Cons:
  - Overkill for personal project
  - Complex to implement

Time to implement: 1 week
```

### Option D: No Auth (Localhost Only, Dev)
```
Setup:
  None (for development only)

Implementation:
  Only allow connections from 127.0.0.1
  No token validation

Pros:
  - Simplest possible

Cons:
  - NOT for production
  - Anyone with local access can control

Time to implement: 0 days (already works)
```

### **Recommendation: Option A (Shared Secret) with Future Upgrade**
- Start with Option A (1 day to implement)
- Upgrade to Option B (self-signed cert) before production deploy (3 days)
- Option D is fine for dev-only (localhost)

### **Your decision:**
- [ ] Option A (shared secret token, simple)
- [ ] Option B (self-signed certificate, more secure)
- [ ] Option C (OAuth, overkill for personal)
- [ ] Option D (no auth, localhost only, dev only)
- [ ] Option A now, upgrade to B before production

---

## Summary Table

| Decision | Option | Effort | Status |
|----------|--------|--------|--------|
| 1. Transport | Option C (hybrid: localhost + WebSocket later) | 1 week | ☐ You decide |
| 2. Feature | Option A (finance ledger, recommended) | 2 weeks | ☐ You decide |
| 3. Queue | Option A (SQLite) | 3 days | ☐ You decide |
| 4. Sync | Option D (manual now, auto later) | 2 days start | ☐ You decide |
| 5. Auth | Option A (token) + upgrade B (cert) | 1 day start | ☐ You decide |

---

## Next Steps After You Decide

1. **This Week (May 2–5):**
   - Answer these 5 decisions (email or reply)
   - I'll create tech-specific implementation guide based on your choices

2. **Next Week (May 6–12):**
   - Phase 2: Build local agent skeleton
   - Create `local-agent/` directory
   - Implement communication + queue based on your decisions

3. **Week After (May 13–19):**
   - Phase 3: Implement first feature (finance ledger or your choice)
   - Full offline + online flow working
   - Test end-to-end

4. **Before Production:**
   - Upgrade auth (shared secret → certificate)
   - Upgrade transport (localhost → WebSocket, if needed)
   - Deploy to production

---

## How to Respond

Format your answer like this:

```
Decision 1 (Transport): Option C (hybrid)
Decision 2 (Feature): Option A (finance ledger)
Decision 3 (Queue): Option A (SQLite)
Decision 4 (Sync): Option D (hybrid)
Decision 5 (Auth): Option A now, Option B before production
```

Or if you want different:
```
Decision 1: Option B (WebSocket from start)
Decision 2: Option B (task scheduler)
...
```

---

## Questions?

- **What if I want Option A for transport but with extra security?** → Use Option A + add HTTPS, shared secret token
- **Can I change my mind later?** → Yes, decisions can change; just tell me and we'll adjust
- **What if I want something not listed?** → Propose it; I'll evaluate effort + pros/cons
- **How much will it cost in cloud?** → Local agent = free (your laptop); Vercel + Supabase = current plan unchanged

---

**Waiting for your decisions. This unblocks Phase 2 (local agent). 🟡**


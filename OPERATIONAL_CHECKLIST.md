# 🧪 OPERATIONAL SMOKE TEST CHECKLIST
**Date:** April 18, 2026  
**Status:** CONDITIONAL PASS (5 blockers to fix first)  
**Purpose:** Validate critical flows before UI/UX revamp approval

---

## ⚠️ GATE DECISION: CONDITIONAL PASS

### Current Status
- ✅ Quota monitor reliability hardened (timestamp-based calculation)
- ✅ Memory dedup logic improved (topic context + recent-window DB)
- ✅ Security baseline implemented (token removed, CORS hardened)
- 🔴 **CRITICAL:** Memory race condition identified → requires DB UNIQUE constraint
- 🟠 **MEDIUM x4:** Thread race, profile atomicity, CORS NODE_ENV, retry-after robustness

### Blockers to Fix Before Smoke Test Execution

| # | Blocker | Severity | File | Fix Strategy | Est. Effort |
|----|---------|----------|------|--------------|-------------|
| 1 | Memory dedup race (concurrent duplicate writes) | 🔴 Critical | `api/chat.js`, `api/_lib/supabase.js` | Add DB UNIQUE constraint on (normalized_content, category, topicKey) + idempotency token | 1-2h |
| 2 | Thread auto-creation race | 🟠 Medium | `api/chat.js` | Add idempotency token + upsert logic | 1-2h |
| 3 | Profile update not atomic | 🟠 Medium | `api/profile.js`, `api/_lib/supabase.js` | Transaction wrapper or multi-step validation | 2-3h |
| 4 | CORS NODE_ENV verification missing | 🟠 Medium | `api/_lib/cors.js` | Verify Vercel env var set; add fallback warning logs | 30min |
| 5 | Quota retry-after extraction robustness | 🟠 Medium | `api/quota-eta.js` | Add more error message patterns; document 180s fallback | 1h |

### Recommended Fix Order
1. **CRITICAL FIRST:** Fix memory race condition (blocker #1)
2. **THEN MEDIUM:** Thread race (#2), profile atomicity (#3)
3. **PARALLEL:** CORS NODE_ENV (#4) + retry-after (#5)
4. **THEN:** Re-run smoke test checklist (24 tests below)
5. **GATE PASS:** Declare ready for UI revamp

---

## 📋 Flow 1: Chat Interaction (Core)

### 1.1 Basic Chat Message
- [ ] **Step:** User sends message via web chat
- [ ] **Expected:** Message appears in thread history + reply generated
- [ ] **DB Check:** Entry logged in `felicia_commands` with status=`success`
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 1.2 Chat with Action (Calendar Event)
- [ ] **Step:** User asks to create event: "buat jadwal rapat besok jam 10"
- [ ] **Expected:** AI triggers `create_event` action, event added to Google Calendar
- [ ] **DB Check:** `felicia_commands.action = 'create_event'`, status=`success`
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 1.3 Chat with Mode Switch
- [ ] **Step:** User says "masuk mode refleksi"
- [ ] **Expected:** Mode changes to 'refleksi', logged in `felicia_modes`
- [ ] **DB Check:** Latest mode entry shows `mode_name='refleksi'`
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 1.4 Multi-turn Chat Thread
- [ ] **Step:** User creates thread, sends 3+ messages in sequence
- [ ] **Expected:** Conversation history preserved, AI context carries over
- [ ] **DB Check:** `felicia_messages` contains all messages ordered by created_at
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

---

## 📋 Flow 2: Memory Management (Critical)

### 2.1 Direct Memory Save (User Triggered)
- [ ] **Step:** User sends `/save_memory content="Aji is my best friend"` or UI button
- [ ] **Expected:** Memory saved, no duplicate error
- [ ] **DB Check:** Entry in `felicia_memories` with `category=general`
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 2.2 Auto-Memory from Chat (Inferred)
- [ ] **Step:** User mentions "aku pindah ke Jakarta tahun lalu", AI infers `location` memory
- [ ] **Expected:** Memory auto-saved without user trigger, appears in memory panel
- [ ] **DB Check:** `felicia_memories` has entry with `source=inferred`
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 2.3 Memory Dedup (Duplicate Prevention) ⚠️ **CRITICAL TEST**
- [ ] **Step:** Save same memory twice rapidly (test concurrent write safety)
- [ ] **Expected:** Only one entry created, no error
- [ ] **DB Check:** `COUNT(*) FROM felicia_memories WHERE normalized_content = X` = 1
- [ ] **Blocker?** [ ] Yes [ ] No — **Notes:** This test validates fix for blocker #1 (memory race)

### 2.4 Memory Retrieval in Chat Context
- [ ] **Step:** User sends new message; system retrieves relevant memories
- [ ] **Expected:** Correct memories used in AI prompt for context awareness
- [ ] **DB Check:** Log shows `checkDuplicateMemoryInDB()` query returned relevant results
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 2.5 Memory Category Filtering
- [ ] **Step:** User queries memories by category (e.g., "show me preferences")
- [ ] **Expected:** Only `category='preferences'` memories displayed
- [ ] **DB Check:** MemoryPage filters correctly by category in UI + DB query
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

---

## 📋 Flow 3: Quota Monitoring

### 3.1 Quota Status Display (Settings Panel)
- [ ] **Step:** Open Settings page, check quota status
- [ ] **Expected:** Status shows current state (ok/rate_limited/near_limit), ETA visible if applicable
- [ ] **DB Check:** `/api/quota-status` returns current state + next_reset_time
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 3.2 Quota Auto-Refresh (60s Poll)
- [ ] **Step:** Keep Settings open for 2+ minutes without manual refresh
- [ ] **Expected:** Quota status updates automatically every 60s
- [ ] **DB Check:** Multiple `/api/quota-status` calls logged in access logs
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 3.3 Rate-Limited Fallback
- [ ] **Step:** Trigger rate limit condition (exhaust quota or simulate via debug)
- [ ] **Expected:** Status shows `rate_limited`, ETA calculated, chat switches to fallback model
- [ ] **DB Check:** `felicia_commands` shows fallback model used (e.g., gemini-1.5-flash)
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 3.4 Quota Recovery Detection ✅ **NEW** (Fixed April 18)
- [ ] **Step:** Send chat message after quota recovered (manually reset or wait)
- [ ] **Expected:** Quota status automatically changes from `rate_limited` to `ok`
- [ ] **DB Check:** `/api/quota-eta` detects latest `success` event after `quota_limited` event
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 3.5 Quota Debug Endpoint
- [ ] **Step:** Call `/api/quota-debug` (admin/dev only)
- [ ] **Expected:** Detailed breakdown of current state + latest events + reason analysis
- [ ] **DB Check:** Response includes `current_state`, `reason`, `latest_quota_event`, `latest_success_event`
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

---

## 📋 Flow 4: Profile Management

### 4.1 Profile Load on Login
- [ ] **Step:** User logs in / page refreshes
- [ ] **Expected:** Profile data (name, preferences, integrations) loaded and displayed
- [ ] **DB Check:** `/api/profile` returns user profile with all fields
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 4.2 Profile Update (Single Field)
- [ ] **Step:** User updates profile field (e.g., change name to "Aji Updated")
- [ ] **Expected:** Update applied immediately, persisted to DB
- [ ] **DB Check:** `felicia_profiles.name` = "Aji Updated"
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 4.3 Profile Update (Multiple Fields) ⚠️ **MEDIUM TEST** (Atomicity)
- [ ] **Step:** User updates multiple fields at once (name + timezone + language)
- [ ] **Expected:** All fields updated, or all rolled back (no partial saves)
- [ ] **DB Check:** All fields consistent; no corruption if connection drops mid-request
- [ ] **Blocker?** [ ] Yes [ ] No — **Notes:** This test validates fix for blocker #3 (profile atomicity)

---

## 📋 Flow 5: Case Management

### 5.1 Case Auto-Creation
- [ ] **Step:** User sends first message or starts new thread
- [ ] **Expected:** Case auto-created if not exists, linked to user
- [ ] **DB Check:** `felicia_cases` has entry for user + thread
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 5.2 Case Auto-Update (Async)
- [ ] **Step:** Send chat message; case metadata should auto-update
- [ ] **Expected:** Case `last_activity` timestamp updated, case status refreshed
- [ ] **DB Check:** `felicia_cases.last_activity` shows recent timestamp
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 5.3 Case Concurrent Creation Race ⚠️ **MEDIUM TEST** (Race Condition)
- [ ] **Step:** Send multiple messages to new thread rapidly (concurrent requests)
- [ ] **Expected:** Single case created, no orphaned threads
- [ ] **DB Check:** `COUNT(*) FROM felicia_cases WHERE thread_id = X` = 1
- [ ] **Blocker?** [ ] Yes [ ] No — **Notes:** This test validates fix for blocker #2 (thread race)

---

## 📋 Flow 6: Error Handling & Recovery

### 6.1 Network Error (Connection Failure)
- [ ] **Step:** Send chat message while simulating offline (DevTools network throttle)
- [ ] **Expected:** Error message displayed, message queued for retry or discarded gracefully
- [ ] **DB Check:** No partial entry in `felicia_commands` (all-or-nothing)
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 6.2 API Timeout (30s Vercel limit)
- [ ] **Step:** Trigger slow API response (or add artificial delay in dev)
- [ ] **Expected:** Timeout error shown, UI remains responsive
- [ ] **DB Check:** No zombie command entries left in DB
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 6.3 CORS Rejection (Origin Mismatch)
- [ ] **Step:** Call API from unexpected origin (e.g., browser console on different domain)
- [ ] **Expected:** CORS error in browser console, request rejected
- [ ] **DB Check:** No partial writes; request logged but not processed
- [ ] **Blocker?** [ ] Yes [ ] No — **Notes:** Validates CORS hardening (blocker #4)

### 6.4 Invalid Token / Auth Failure
- [ ] **Step:** Send request with invalid/expired token
- [ ] **Expected:** 401 error, user prompted to re-auth or UI shows error
- [ ] **DB Check:** No data processed; access denied logged
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

### 6.5 Gemini API Failure (Quota Exhausted)
- [ ] **Step:** Trigger quota exhaustion or simulate Gemini error
- [ ] **Expected:** Fallback model used, chat continues with degraded quality
- [ ] **DB Check:** `felicia_commands.model` shows fallback (1.5-flash, 1.5-pro)
- [ ] **Blocker?** [ ] Yes [ ] No — **Notes:** Tests retry-after extraction (blocker #5)

### 6.6 Graceful Degradation (Missing Data)
- [ ] **Step:** Delete/corrupt a memory or profile field in DB (simulated)
- [ ] **Expected:** Chat still works, falls back to defaults gracefully
- [ ] **DB Check:** No crashes; error logged but handled
- [ ] **Blocker?** [ ] Yes [ ] No — Notes: ___________

---

## 🔍 Data Consistency Audit (Post-Test)

Run these SQL queries to validate overall system health post-smoke-tests:

### Query 1: Memory Dedup Audit
```sql
SELECT COUNT(*) as total_memories, 
       COUNT(DISTINCT normalized_content, category) as unique_combinations,
       COUNT(*) - COUNT(DISTINCT normalized_content, category) as duplicates_found
FROM felicia_memories
WHERE created_at > NOW() - INTERVAL '1 hour';
```
**Expected:** `duplicates_found = 0` (no duplicates after dedup fix)

### Query 2: Orphaned Threads/Cases
```sql
SELECT COUNT(*) as orphaned_threads
FROM felicia_threads t
LEFT JOIN felicia_cases c ON t.id = c.thread_id
WHERE c.id IS NULL AND t.created_at > NOW() - INTERVAL '1 hour';
```
**Expected:** `orphaned_threads = 0` (no orphans after thread race fix)

### Query 3: Profile Atomicity Check
```sql
SELECT COUNT(*) as corrupted_profiles
FROM felicia_profiles
WHERE (name IS NULL OR name = '') 
  AND updated_at > NOW() - INTERVAL '1 hour';
```
**Expected:** `corrupted_profiles = 0` (no partial saves after atomicity fix)

---

## 📊 Test Summary & Gate Decision

### After All Tests Complete:

| Category | Passed | Failed | Blockers |
|----------|--------|--------|----------|
| Chat Interaction | 4 | _ | __ |
| Memory Management | 5 | _ | __ |
| Quota Monitoring | 5 | _ | __ |
| Profile Management | 3 | _ | __ |
| Case Management | 3 | _ | __ |
| Error Handling | 6 | _ | __ |
| **TOTAL** | **26** | **_** | **__** |

### Gate Decision Framework

- ✅ **PASS:** All 26 tests passed + data audit clean (0 duplicates, 0 orphans, 0 corruptions)
  - **Action:** Proceed to UI/UX revamp phase ✅
  
- ⚠️ **CONDITIONAL PASS:** 24-25/26 tests passed, minor blockers identified
  - **Action:** Document blockers, create tickets for v2, proceed with caution
  
- 🔴 **FAIL:** <24/26 tests passed, critical blocker(s) blocking production
  - **Action:** Fix blocker, re-run smoke test, do NOT proceed to UI revamp

### Tester Notes
```
Tester Name: _______________
Test Date: _______________
Environment: dev / staging / production
Browser: _______________

Critical Issues Found:
_________________________________________________________________
_________________________________________________________________

General Observations:
_________________________________________________________________

Recommendation:
[ ] PASS - Ready for UI revamp
[ ] CONDITIONAL - Fix noted, proceed with caution
[ ] FAIL - Do not proceed, fix required
```

---

**Document Version:** 1.0  
**Created:** April 18, 2026  
**Status:** Ready for execution after blocker fixes  
**Next Review:** After all 5 blockers fixed + smoke test executed

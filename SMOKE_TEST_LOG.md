# 🧪 SMOKE TEST EXECUTION - APRIL 18, 2026

**Status:** READY TO EXECUTE  
**Tester:** [Manual UI Tester + Backend Verification]  
**Environment:** Development (localhost:5173)  
**Start Time:** [When test begins]  

---

## 🚀 HOW TO RUN THIS SMOKE TEST

### Step 1: Verify Backend State (Automated)
```bash
node smoke-test-verify.js
```
This runs 3 critical database audit queries automatically to verify blocker fixes.

### Step 2: Manual UI Testing (Interactive)
Use the checklist below to run each test in your browser at http://localhost:5173

### Step 3: Execute Data Audits (Manual)
Open Supabase SQL Editor and run queries from "Data Consistency Audit" section

### Step 4: Record Results
Fill out the TEST SUMMARY TEMPLATE at the end with your findings

---

## ✅ PRE-TEST VERIFICATION (Automated)

---

## ✅ VERIFIED BACKEND STATE (Pre-Test)

### Build Validation
- ✅ Vite build: 44 modules, 290KB JS, no errors
- ✅ All 5 blocker fixes implemented
- ✅ No linting errors on modified files
- ✅ Backward compatibility maintained

### Environment Check
- ✅ Dev server running: http://localhost:5173
- ✅ API_SECRET configured: test_secret_key
- ✅ Code changes compiled successfully

---

## 📋 TEST EXECUTION CHECKLIST

### FLOW 1: Chat Interaction (4 Tests)

#### Test 1.1: Basic Chat Message
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Type in chat: "Halo Felicia, apa kabar?"
  2. Press Send
  3. Wait for AI response (< 5 seconds)
  
Verify:
  ☐ Message appears in thread history
  ☐ AI response appears
  ☐ No error shown
  
Backend Check:
  SELECT * FROM felicia_commands 
  WHERE command='chat' 
  ORDER BY created_at DESC LIMIT 1;
```

#### Test 1.2: Chat with Action (Calendar Event)
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Type: "buat jadwal rapat besok jam 10"
  2. Press Send
  3. Check Google Calendar (if connected)
  
Verify:
  ☐ AI detects create_event action
  ☐ Response confirms event created
  
Backend Check:
  SELECT * FROM felicia_commands 
  WHERE action='create_event' 
  ORDER BY created_at DESC LIMIT 1;
```

#### Test 1.3: Chat with Mode Switch
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Type: "masuk mode refleksi"
  2. Press Send
  3. Check UI for mode indicator change
  
Backend Check:
  SELECT * FROM felicia_modes 
  ORDER BY activated_at DESC LIMIT 1;
```

#### Test 1.4: Multi-turn Chat Thread
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Create new thread ("New Chat")
  2. Send: "Aku capek hari ini"
  3. Send: "Apa saran kamu?"
  4. Send: "Terima kasih"
  5. Verify context carries over
  
Backend Check:
  SELECT COUNT(*) as msg_count FROM felicia_chat_messages 
  WHERE thread_id = (SELECT id FROM felicia_chat_threads ORDER BY created_at DESC LIMIT 1);
```

---

### FLOW 2: Memory Management (5 Tests - CRITICAL)

#### Test 2.1: Direct Memory Save
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Click memory save button
  2. Type: "Aku suka makan soto ayam"
  3. Click Save
  
Verify:
  ☐ No duplicate error
  ☐ Memory appears in panel
  
Backend Check:
  SELECT * FROM felicia_memories 
  WHERE content LIKE '%soto ayam%' 
  ORDER BY created_at DESC LIMIT 1;
```

#### Test 2.2: Auto-Memory from Chat
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Type: "Tahun lalu aku pindah ke Jakarta"
  2. Send message
  3. Wait 3 seconds
  4. Check Memory panel
  
Backend Check:
  SELECT * FROM felicia_memories 
  WHERE category='location' AND content LIKE '%Jakarta%' 
  ORDER BY created_at DESC LIMIT 1;
```

#### Test 2.3: Memory Dedup (CRITICAL) 🔴
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps (CONCURRENT WRITE TEST):
  1. Click memory save
  2. Type: "Aji adalah teman baik saya"
  3. Click SAVE
  4. IMMEDIATELY (< 1s) save SAME content again
  5. Type: "Aji adalah teman baik saya"
  6. Click SAVE
  
Expected:
  ☐ First save: SUCCESS
  ☐ Second save: NO DUPLICATE ERROR or IDEMPOTENT RETURN
  ☐ Memory count = 1
  
Backend Verification:
  SELECT normalized_content, COUNT(*) as total
  FROM felicia_memories 
  WHERE content LIKE '%Aji adalah teman baik%'
  GROUP BY normalized_content;
  
  Result should be:
  | normalized_content | total |
  |------------------|-------|
  | ajiadalahtemanbaiksa | 1     |
```

**🎯 THIS IS THE CRITICAL TEST FOR BLOCKER #1**
If duplicate still appears → Memory race condition NOT fixed ❌
If only 1 record → Fix working ✅

#### Test 2.4: Memory Retrieval in Chat Context
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Save memory: "Aku suka coding JavaScript"
  2. Send message: "Apa hobby ku?"
  3. Check if AI response mentions JavaScript
  
Expected: Response personalized using memory ✅
```

#### Test 2.5: Memory Category Filtering
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Go to Memory page
  2. Filter by "preferences"
  3. Verify only preferences shown
```

---

### FLOW 3: Quota Monitoring (5 Tests)

#### Test 3.1: Quota Status Display
**Status:** ⏳ REQUIRES MANUAL UI TEST + BACKEND CHECK
```
Manual Steps:
  1. Click Settings
  2. Check Quota section
  
Verify:
  ☐ Status visible (ok/rate_limited/near_limit)
  ☐ ETA shown
  ☐ Timestamp recent
```

#### Test 3.2: Quota Auto-Refresh (60s Poll)
**Status:** ⏳ REQUIRES MANUAL UI TEST + TIME OBSERVATION
```
Manual Steps:
  1. Open Settings → Quota panel
  2. Note timestamp at T0 (e.g., 10:00:00)
  3. Wait 65 seconds
  4. Check timestamp updated (e.g., 10:01:05)
  
Expected: Timestamp changes ✅
This tests the polling added in SettingsPage.jsx
```

#### Test 3.3: Rate-Limited Fallback
**Status:** ⏳ REQUIRES QUOTA EXHAUSTION SIMULATION
```
Pre-requisite: Quota must be exhausted or close to limit

Manual Steps:
  1. Check /api/quota-debug status
  2. If not rate_limited, skip or simulate
  3. Send chat message
  
Expected:
  ☐ Status shows rate_limited
  ☐ Chat uses fallback model
  ☐ Response still works (degraded quality)
```

#### Test 3.4: Quota Recovery Detection ✅ (FIXED)
**Status:** ⏳ REQUIRES QUOTA RECOVERY
```
Manual Steps:
  1. Monitor quota while rate_limited
  2. Wait for reset time (or manually reset quota)
  3. Send chat message
  4. Check status updated to "ok"
  
Expected:
  ☐ Status auto-updates from rate_limited → ok
  ☐ No manual refresh needed
  
This validates the timestamp-based calculation fix from April 18
```

#### Test 3.5: Quota Debug Endpoint
**Status:** ✅ BACKEND TEST (Can verify now)
```
API Call:
  GET /api/quota-debug
  Header: Authorization: Bearer test_secret_key
  
Expected Response:
  {
    "current_state": "ok|rate_limited|near_limit",
    "reason": "explanation string",
    "latest_quota_event": {...},
    "latest_success_event": {...},
    "analysis": {...}
  }
```

---

### FLOW 4: Profile Management (3 Tests)

#### Test 4.1: Profile Load on Login
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Refresh page (F5)
  2. Wait for data load
  3. Check profile section
  
Verify:
  ☐ Name displays
  ☐ Aliases shown
  ☐ Gender/Domicile visible
```

#### Test 4.2: Profile Update (Single Field)
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Go to Settings
  2. Change name to "Adit Update Test"
  3. Click Save
  4. Refresh page
  
Backend Check:
  SELECT name FROM felicia_profiles 
  ORDER BY updated_at DESC LIMIT 1;
  
Expected: name = "Adit Update Test"
```

#### Test 4.3: Profile Update (Multiple Fields) 🟠 ATOMICITY
**Status:** ⏳ REQUIRES MANUAL UI TEST + NETWORK SIMULATION
```
Manual Steps:
  1. Go to Settings
  2. Change:
     - Name: "Test Name"
     - Alias: "TestAlias1, TestAlias2"
     - Gender: "laki-laki"
     - Domicile: "Lampung"
  3. Click SAVE
  4. Simulate network loss during save (DevTools: Offline)
  5. Refresh page
  
Backend Check:
  SELECT * FROM felicia_profiles 
  ORDER BY updated_at DESC LIMIT 1;
  
Expected:
  ☐ All fields consistent (atomic)
  ☐ NOT partial save
  ☐ No corruption
  
This validates blocker #3 fix (Promise.all() + error tracking)
```

---

### FLOW 5: Case Management (3 Tests)

#### Test 5.1: Case Auto-Creation
**Status:** ⏳ REQUIRES MANUAL UI TEST
```
Manual Steps:
  1. Start new conversation
  2. Send message
  
Backend Check:
  SELECT * FROM felicia_cases 
  ORDER BY created_at DESC LIMIT 1;
  
Expected: Case exists for thread
```

#### Test 5.2: Case Auto-Update (Async)
**Status:** ⏳ REQUIRES MANUAL UI TEST + TIMESTAMP CHECK
```
Manual Steps:
  1. Send chat message in thread
  2. Wait 2 seconds
  3. Check case.last_activity updated
  
Backend Check:
  SELECT last_activity FROM felicia_cases 
  WHERE thread_id = (SELECT id FROM felicia_chat_threads ORDER BY created_at DESC LIMIT 1)
  ORDER BY updated_at DESC LIMIT 1;
  
Expected: last_activity = recent timestamp
```

#### Test 5.3: Case Concurrent Creation Race 🟠 CRITICAL
**Status:** ⏳ REQUIRES MANUAL UI TEST + RAPID MESSAGES
```
Manual Steps (RAPID CONCURRENT REQUEST TEST):
  1. Create new thread
  2. Send message 1: "Test 1"
  3. IMMEDIATELY send message 2: "Test 2" (< 0.5s)
  4. IMMEDIATELY send message 3: "Test 3" (< 0.5s)
  
Backend Verification:
  SELECT thread_id, COUNT(*) as case_count
  FROM felicia_cases
  WHERE thread_id IN (
    SELECT id FROM felicia_chat_threads 
    WHERE created_at > NOW() - INTERVAL '5 minutes'
  )
  GROUP BY thread_id;
  
Expected: Each thread has exactly 1 case ✅

This validates blocker #2 fix (thread creation idempotency)
```

---

### FLOW 6: Error Handling (6 Tests)

#### Test 6.1: Network Error
**Status:** ⏳ REQUIRES MANUAL UI + DEVTOOLS
```
Manual Steps:
  1. DevTools → Network tab
  2. Throttle: Offline
  3. Send message
  4. Check error shown
  5. Re-enable network
  
Backend Check:
  Message should NOT be in felicia_commands table (all-or-nothing)
```

#### Test 6.2: API Timeout (30s Vercel limit)
**Status:** ⏳ REQUIRES ARTIFICIAL DELAY
```
Manual Steps (DEVELOPMENT ONLY):
  1. Modify api/chat.js to add 35s delay temporarily
  2. Send message
  3. Wait 35 seconds
  4. Check error after ~30s
  5. REVERT the temporary modification
  
Expected:
  ☐ Error shown after 30s
  ☐ UI responsive
  ☐ No zombie DB entry
```

#### Test 6.3: CORS Rejection
**Status:** ⏳ REQUIRES DEVTOOLS CONSOLE
```
Manual Steps:
  1. DevTools Console
  2. Run fetch with bad origin:
     fetch('http://localhost:3000/api/chat', {
       headers: { 'Origin': 'http://malicious.com' }
     })
  
Expected:
  ☐ CORS error in console
  ☐ Request rejected
  ☐ No partial write
  
Validates blocker #4 fix (CORS NODE_ENV verification)
```

#### Test 6.4: Invalid Token / Auth Failure
**Status:** ⏳ REQUIRES DEVTOOLS CONSOLE
```
Manual Steps:
  1. DevTools Console
  2. Run fetch with INVALID token:
     fetch('http://localhost:3000/api/chat', {
       method: 'POST',
       headers: { 'Authorization': 'Bearer INVALID_TOKEN' },
       body: JSON.stringify({ action: 'chat', content: 'test' })
     }).then(r => r.json()).then(console.log)
  
Expected: 401 Unauthorized response
```

#### Test 6.5: Gemini API Failure (Quota Exhausted)
**Status:** ⏳ REQUIRES QUOTA LOW OR SIMULATION
```
Manual Steps:
  1. Check /api/quota-debug status
  2. If quota high, skip or mock failure
  3. If quota low, send chat message
  
Expected:
  ☐ Fallback model used
  ☐ Chat continues (degraded quality)
  ☐ No crash
  
Validates blocker #5 fix (6 pattern matchers for retry-after)
```

#### Test 6.6: Graceful Degradation (Missing Data)
**Status:** ⏳ REQUIRES MANUAL DB DELETION
```
Manual Steps:
  1. Manually delete a memory from DB (dev only)
  2. Send chat message
  3. Check response
  
Expected:
  ☐ Chat still works
  ☐ No crash
  ☐ Falls back to defaults
```

---

## 🔍 DATA CONSISTENCY AUDIT (Backend Queries)

### Query 1: Memory Dedup Audit
```sql
SELECT 
  COUNT(*) as total_memories,
  COUNT(DISTINCT normalized_content, category, topic_key) as unique_combinations,
  COUNT(*) - COUNT(DISTINCT normalized_content, category, topic_key) as duplicates_found
FROM felicia_memories
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Expected Result:**
```
| total_memories | unique_combinations | duplicates_found |
|----------------|-------------------|-----------------|
| 5              | 5                 | 0               |
```

### Query 2: Orphaned Threads/Cases
```sql
SELECT COUNT(*) as orphaned_threads
FROM felicia_chat_threads t
LEFT JOIN felicia_cases c ON t.id = c.thread_id
WHERE c.id IS NULL 
  AND t.created_at > NOW() - INTERVAL '1 hour';
```

**Expected Result:**
```
| orphaned_threads |
|-----------------|
| 0               |
```

### Query 3: Profile Consistency
```sql
SELECT COUNT(*) as corrupted_profiles
FROM felicia_profiles
WHERE (name IS NULL OR name = '')
  AND updated_at > NOW() - INTERVAL '1 hour';
```

**Expected Result:**
```
| corrupted_profiles |
|------------------|
| 0                |
```

---

## 📊 TEST SUMMARY TEMPLATE

**Date:** April 18, 2026  
**Tester:** [Manual Tester Name]  
**Environment:** Development (localhost:5173)  
**Browser:** [Chrome/Firefox/Safari]  
**Start Time:** [HH:MM UTC+7]  
**End Time:** [HH:MM UTC+7]  

### Results by Flow

| Flow | Test | Result | Notes |
|------|------|--------|-------|
| 1    | 1.1 Basic Chat     | ☐ PASS / ☐ FAIL | ________ |
| 1    | 1.2 Chat Action    | ☐ PASS / ☐ FAIL | ________ |
| 1    | 1.3 Mode Switch    | ☐ PASS / ☐ FAIL | ________ |
| 1    | 1.4 Multi-turn     | ☐ PASS / ☐ FAIL | ________ |
| 2    | 2.1 Memory Save    | ☐ PASS / ☐ FAIL | ________ |
| 2    | 2.2 Auto-Memory    | ☐ PASS / ☐ FAIL | ________ |
| 2    | 2.3 Dedup 🔴      | ☐ PASS / ☐ FAIL | ⚠️ CRITICAL |
| 2    | 2.4 Retrieval      | ☐ PASS / ☐ FAIL | ________ |
| 2    | 2.5 Filter         | ☐ PASS / ☐ FAIL | ________ |
| 3    | 3.1 Status         | ☐ PASS / ☐ FAIL | ________ |
| 3    | 3.2 Auto-Refresh   | ☐ PASS / ☐ FAIL | ________ |
| 3    | 3.3 Fallback       | ☐ PASS / ☐ FAIL | ________ |
| 3    | 3.4 Recovery       | ☐ PASS / ☐ FAIL | ________ |
| 3    | 3.5 Debug EP       | ☐ PASS / ☐ FAIL | ________ |
| 4    | 4.1 Profile Load   | ☐ PASS / ☐ FAIL | ________ |
| 4    | 4.2 Update Single  | ☐ PASS / ☐ FAIL | ________ |
| 4    | 4.3 Atomicity 🟠   | ☐ PASS / ☐ FAIL | ⚠️ MEDIUM |
| 5    | 5.1 Auto-Create    | ☐ PASS / ☐ FAIL | ________ |
| 5    | 5.2 Auto-Update    | ☐ PASS / ☐ FAIL | ________ |
| 5    | 5.3 Race 🟠        | ☐ PASS / ☐ FAIL | ⚠️ CRITICAL |
| 6    | 6.1 Network        | ☐ PASS / ☐ FAIL | ________ |
| 6    | 6.2 Timeout        | ☐ PASS / ☐ FAIL | ________ |
| 6    | 6.3 CORS           | ☐ PASS / ☐ FAIL | ________ |
| 6    | 6.4 Auth           | ☐ PASS / ☐ FAIL | ________ |
| 6    | 6.5 Gemini Fail    | ☐ PASS / ☐ FAIL | ________ |
| 6    | 6.6 Degrade        | ☐ PASS / ☐ FAIL | ________ |

### Data Audit Results

| Query | Result | Expected | Status |
|-------|--------|----------|--------|
| Memory Dedup | duplicates_found = ? | 0 | ☐ PASS / ☐ FAIL |
| Orphaned Cases | orphaned_threads = ? | 0 | ☐ PASS / ☐ FAIL |
| Profile Corruption | corrupted_profiles = ? | 0 | ☐ PASS / ☐ FAIL |

### Score Summary

**Total Tests:** 26 + 3 data audits = 29 items  
**Passed:** __/29  
**Failed:** __/29  
**Critical Failures:** __/29  

**Pass Rate:** __% 

### Gate Decision

- [ ] 🟢 **PASS** (26/26 + 3/3 audits → 100% pass rate)
  - ✅ All critical tests passed (2.3, 5.3)
  - ✅ All data audits clean
  - ✅ No corruptions detected
  - **Action:** GREENLIGHT UI/UX revamp ✅
  
- [ ] 🟡 **CONDITIONAL PASS** (24-25/26 passed, minor issues)
  - ⚠️ Some non-critical tests failed
  - ⚠️ All critical tests passed
  - ⚠️ Data audits mostly clean
  - **Action:** Document blockers, proceed cautiously
  
- [ ] 🔴 **FAIL** (<24/26 passed)
  - ❌ Critical tests failed
  - ❌ Data corruption detected
  - ❌ Race conditions still present
  - **Action:** DO NOT PROCEED, fix required

### Critical Issues Found (if any)

1. ________________________________
2. ________________________________
3. ________________________________

### Recommendations for Next Phase

- ________________________________
- ________________________________
- ________________________________

### Sign-off

**Tester Name:** ________________________  
**Date & Time:** April 18, 2026 __:__  
**Signature:** ________________________  

---

## NOTES

- Tests marked 🔴 are CRITICAL - must PASS for gate PASS
- Tests marked 🟠 are MEDIUM - should PASS but won't block gate if minor
- Data audit queries must all return 0 for PASS
- Manual UI tests require actual user interaction in browser
- Backend verification can be done via SQL queries in Supabase

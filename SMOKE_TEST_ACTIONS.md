# 📋 SMOKE TEST - NEXT IMMEDIATE ACTIONS

## ✅ WHAT'S BEEN DONE (April 18, 2026)

### Backend Blocker Fixes (All Complete)
- ✅ Blocker #1 (🔴 CRITICAL): Memory race condition → DB UNIQUE + idempotency token
- ✅ Blocker #2 (🟠 MEDIUM): Thread creation race → 30s duplicate check + recovery
- ✅ Blocker #3 (🟠 MEDIUM): Profile atomicity → Promise.all() batch + error tracking
- ✅ Blocker #4 (🟠 MEDIUM): CORS NODE_ENV → Environment verification + debug headers
- ✅ Blocker #5 (🟠 MEDIUM): Quota retry-after → 6 pattern matchers + 180s fallback

### Code Validation
- ✅ Build successful (44 modules, 290KB JS, no errors)
- ✅ No linting errors on modified files
- ✅ All changes backward compatible
- ✅ Dev server running (http://localhost:5173)

### Documentation
- ✅ SMOKE_TEST_LOG.md created (comprehensive test checklist)
- ✅ smoke-test-verify.js created (backend audit automation)
- ✅ ARCHITECTURE.md updated (blocker status + next steps)
- ✅ OPERATIONAL_CHECKLIST.md created (24 smoke tests framework)

---

## 🎯 NEXT STEPS (Priority Order)

### **IMMEDIATE (Right Now)**

#### Step 1: Run Backend Verification
```bash
cd c:\Users\User\Videos\felicia project
node smoke-test-verify.js
```

**What it does:** Runs 3 critical database audit queries to verify:
- ✅ No memory duplicates found (Blocker #1 fix)
- ✅ No orphaned threads (Blocker #2 fix)
- ✅ No profile corruption (Blocker #3 fix)

**Expected output:**
```
✅ Audit 1 (Memory Dedup):     PASS ✅ - No duplicates detected
✅ Audit 2 (Orphan Threads):   PASS ✅ - No orphaned cases
✅ Audit 3 (Profile Integrity): PASS ✅ - No corrupted profiles

Overall: 🟢 ALL AUDITS PASS
```

---

#### Step 2: Manual UI Smoke Testing (2-3 hours)

**Open browser to:** http://localhost:5173

**Run these 6 test flows in order:**

1. **FLOW 1: Chat Interaction (4 tests)** - 15 min
   - Test 1.1: Send basic message
   - Test 1.2: Chat with action (create event)
   - Test 1.3: Mode switch
   - Test 1.4: Multi-turn conversation
   
2. **FLOW 2: Memory Management (5 tests)** - 20 min
   - Test 2.1: Direct memory save
   - Test 2.2: Auto-memory from chat
   - **Test 2.3 🔴 CRITICAL:** Rapid duplicate save (test concurrent write safety)
   - Test 2.4: Memory retrieval in context
   - Test 2.5: Category filtering
   
3. **FLOW 3: Quota Monitoring (5 tests)** - 15 min
   - Test 3.1: Status display in Settings
   - Test 3.2: Auto-refresh every 60s
   - Test 3.3: Rate-limited fallback
   - Test 3.4: Recovery detection (new fix)
   - Test 3.5: Debug endpoint
   
4. **FLOW 4: Profile Management (3 tests)** - 15 min
   - Test 4.1: Load on login
   - Test 4.2: Update single field
   - **Test 4.3 🟠 MEDIUM:** Update multiple fields + network simulation (atomicity test)
   
5. **FLOW 5: Case Management (3 tests)** - 15 min
   - Test 5.1: Auto-create case
   - Test 5.2: Auto-update case metadata
   - **Test 5.3 🟠 CRITICAL:** Rapid concurrent messages (test thread race safety)
   
6. **FLOW 6: Error Handling (6 tests)** - 15 min
   - Test 6.1: Network error
   - Test 6.2: API timeout
   - Test 6.3: CORS rejection
   - Test 6.4: Invalid token
   - Test 6.5: Gemini API failure
   - Test 6.6: Graceful degradation

**Use this checklist:** See SMOKE_TEST_LOG.md for detailed steps per test

---

#### Step 3: Data Consistency Audit (Manual)

**Open:** Supabase SQL Editor (https://app.supabase.com)  
**Database:** felicia-project  
**Run these 3 queries:**

```sql
-- Query 1: Memory Dedup Audit
SELECT 
  COUNT(*) as total_memories,
  COUNT(DISTINCT normalized_content, category, topic_key) as unique_combinations,
  COUNT(*) - COUNT(DISTINCT normalized_content, category, topic_key) as duplicates_found
FROM felicia_memories
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Query 2: Orphaned Threads
SELECT COUNT(*) as orphaned_threads
FROM felicia_chat_threads t
LEFT JOIN felicia_cases c ON t.id = c.thread_id
WHERE c.id IS NULL AND t.created_at > NOW() - INTERVAL '24 hours';

-- Query 3: Profile Consistency
SELECT COUNT(*) as corrupted_profiles
FROM felicia_profiles
WHERE (name IS NULL OR name = '') AND updated_at > NOW() - INTERVAL '24 hours';
```

**Expected results:**
- Query 1: `duplicates_found = 0`
- Query 2: `orphaned_threads = 0`
- Query 3: `corrupted_profiles = 0`

---

### **SHORT-TERM (After Smoke Test)**

#### Decision: Gate Status
Based on test results:

```
🟢 PASS (All 26 tests + 3 audits PASS):
   ✅ Proceed with UI/UX revamp immediately
   ✅ Announce stabilization phase complete
   ✅ Schedule UI designer kickoff

🟡 CONDITIONAL PASS (24-25/26 tests, 3/3 audits PASS):
   ⚠️ Document minor issues
   ⚠️ Create tickets for v2 improvements
   ✅ Can proceed with UI/UX but monitor closely

🔴 FAIL (<24/26 tests OR any audit FAIL):
   ❌ DO NOT PROCEED with UI revamp
   🔧 Fix identified blockers
   🔄 Re-run smoke test
```

---

#### Migration Deployment (Before Production)
**File:** `supabase/migrations/20260418_memory_race_fix.sql`

**When:** Before deploying to production
**How:** Run in Supabase SQL Editor once

```sql
-- This migration adds:
-- - normalized_content column (for UNIQUE constraint)
-- - idempotency_token column (for concurrent request safety)
-- - UNIQUE constraint on (normalized_content, category, topic_key)
-- - Cleanup of existing duplicates (keep latest, delete old)

-- Run the migration file:
[Copy full content from supabase/migrations/20260418_memory_race_fix.sql]
[Paste in Supabase SQL Editor]
[Click "Execute"]
```

---

#### Production Verification
After deploying to Vercel:

1. **Verify NODE_ENV set:**
   ```bash
   # In Vercel Project Settings → Environment Variables
   # Confirm: NODE_ENV=production
   ```

2. **Verify CORS working:**
   - Open DevTools
   - Check response header: `X-CORS-Debug: env=production,status=pass`

3. **Monitor logs:**
   - Check for CORS warnings
   - Monitor quota-eta for retry-after parsing
   - Check memory dedup for UNIQUE constraint hits

---

## 📊 SMOKE TEST RESULTS FORM

**Save your results in this format:**

```
Date: April 18, 2026
Tester: [Your Name]
Environment: Development
Browser: [Chrome/Firefox]

Test Results:
  Chat Interaction: 4/4 PASS ✅
  Memory Management: 5/5 PASS ✅ (2.3 critical: PASS ✅)
  Quota Monitoring: 5/5 PASS ✅
  Profile Management: 3/3 PASS ✅ (4.3 atomicity: PASS ✅)
  Case Management: 3/3 PASS ✅ (5.3 race: PASS ✅)
  Error Handling: 6/6 PASS ✅

Data Audits:
  Memory Dedup: duplicates_found = 0 ✅
  Orphaned Threads: orphaned_threads = 0 ✅
  Profile Integrity: corrupted_profiles = 0 ✅

Total: 26/26 PASS + 3/3 AUDITS PASS

Gate Decision: 🟢 PASS - READY FOR UI REVAMP
```

---

## 🎯 SUCCESS CRITERIA

✅ **CRITICAL TESTS (Must PASS):**
- Test 2.3 (Memory Dedup): No duplicates on concurrent save
- Test 5.3 (Thread Race): Only 1 case per thread on rapid creates
- All 3 data audit queries return 0

✅ **MEDIUM TESTS (Should PASS):**
- Test 4.3 (Profile Atomicity): All fields consistent after save
- No partial profile saves

✅ **SMOKE TESTS (Should PASS):**
- 24/26 tests pass
- No crash or hang
- Error messages clear
- Recovery works

---

## 🚨 IF SOMETHING FAILS

### Memory Dedup Test Fails (Test 2.3)
```
Issue: Duplicate memory created after concurrent save
Cause: UNIQUE constraint not working or not deployed
Fix:
  1. Verify migration ran: check normalized_content column exists
  2. Re-run migration if needed
  3. Test again
```

### Thread Race Test Fails (Test 5.3)
```
Issue: Multiple cases created for same thread
Cause: Thread creation race condition not fixed
Fix:
  1. Check createChatThread() has 30s duplicate check
  2. Verify logic in api/_lib/supabase.js
  3. Re-deploy and test
```

### Profile Atomicity Test Fails (Test 4.3)
```
Issue: Only some profile fields saved (partial update)
Cause: Promise.all() not working or error not tracked
Fix:
  1. Check saveCanonicalProfile() uses Promise.all()
  2. Verify error tracking works
  3. Check logs for which saves failed
  4. Re-run test
```

---

## 📞 NEXT MEETING

**Topic:** Smoke Test Results Review + Gate Decision  
**When:** After completing all tests  
**Agenda:**
1. Review backend audit results
2. Review manual UI test results
3. Decide gate status (PASS/CONDITIONAL/FAIL)
4. If PASS: Announce UI revamp greenlight + schedule design kickoff
5. If CONDITIONAL: Document issues + create v2 tickets
6. If FAIL: Identify blockers + schedule fix sprint

---

**Let's go! 🚀 Start with `node smoke-test-verify.js` now!**

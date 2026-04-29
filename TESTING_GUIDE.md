# Testing Guide: Execution Engine
**Project:** Felicia AI System  
**Date:** 2026-04-30  
**Scope:** Manual + Automated Testing for Hardened Core

---

## Testing Overview

### What We're Testing
1. **Execution State Machine** — pending → running → success/failed
2. **Idempotency** — duplicate requests don't create duplicate executions
3. **Retry Logic** — transient errors retry, permanent errors fail immediately
4. **Pending Confirmations** — soft-confirm UX works, TTL expires properly
5. **Observability** — logs linked to executions, end-to-end traceability

### Test Environments
- **Local:** `npm run dev` + `vercel dev`
- **Staging:** Supabase staging + Vercel staging deployment
- **Production:** Full deployment with monitoring

---

## Part A: Manual Testing (Local)

### Setup
```bash
# Terminal 1: Frontend dev server
npm run dev
# Vite will run on http://localhost:5173

# Terminal 2: Backend (Vercel Functions)
vercel dev
# Vercel will run on http://localhost:3000

# Terminal 3: Database connection
# Keep Supabase credentials in .env.local
```

### Test 1: Basic Action Execution
**Goal:** Verify action completes successfully, execution record created

**Steps:**
1. Open http://localhost:5173 (Felicia UI)
2. Chat: "Create event tomorrow at 2pm called meeting"
3. Verify response: "✓ Event created"
4. Check database:
```sql
SELECT id, action_name, status, attempt_count, created_at 
FROM felicia_action_executions 
ORDER BY created_at DESC 
LIMIT 1;
-- Should show: create_event, success, 1
```

**Expected Result:** ✅ 1 execution record, status=success, attempt_count=1

---

### Test 2: Idempotency (No Duplicates)
**Goal:** Verify sending same request twice doesn't create duplicate executions

**Steps:**
1. Chat: "Remind me in 30 minutes"
2. Wait 2 seconds (don't change message)
3. Send same message again: "Remind me in 30 minutes"
4. Verify only 1 execution created:
```sql
SELECT COUNT(*) as duplicates
FROM felicia_action_executions 
WHERE action_name = 'create_event'
  AND idempotency_key = (
    SELECT idempotency_key 
    FROM felicia_action_executions 
    ORDER BY created_at DESC LIMIT 1
  );
-- Should return: 1 (not 2)
```

**Expected Result:** ✅ Same idempotency_key, only 1 execution record

---

### Test 3: Pending Confirmation (Low Confidence)
**Goal:** Verify soft-confirm UX for low-confidence actions

**Steps:**
1. Chat: "remind me next week maybe sunday"  
   *(Vague, low confidence)*
2. System responds: "Just to confirm, reschedule meeting to Sunday next week? [ya/tidak]"
3. Check pending confirmation:
```sql
SELECT id, action_name, cleared, expires_at, now() as current_time
FROM felicia_pending_confirmations
WHERE cleared = false
ORDER BY created_at DESC LIMIT 1;
-- Should show: action not yet cleared, expires_at > current_time
```
4. User replies: "ya"
5. Verify confirmation cleared:
```sql
SELECT cleared
FROM felicia_pending_confirmations
ORDER BY created_at DESC LIMIT 1;
-- Should show: true
```

**Expected Result:** ✅ Pending confirmation created, then cleared on user response

---

### Test 4: Retry Logic (Simulate Transient Error)
**Goal:** Verify retry logic on transient error (timeout, quota)

**Prerequisites:**
- Modify Gemini mock to fail first attempt:
  ```javascript
  // In api/_lib/guards/ai-guard.js, temporarily add:
  if (!window.__mockAttempt) {
    window.__mockAttempt = 0;
  }
  if (window.__mockAttempt === 0) {
    window.__mockAttempt++;
    throw new Error("Quota exceeded"); // Transient error
  }
  ```

**Steps:**
1. Chat: "Create event today"
2. System should retry (user may not notice)
3. Check execution:
```sql
SELECT attempt_count, status, error_message 
FROM felicia_action_executions 
ORDER BY created_at DESC LIMIT 1;
-- Should show: attempt_count >= 1, status=success (after retry)
```

**Expected Result:** ✅ Multiple attempts, final status=success

---

### Test 5: Permanent Error (No Retry)
**Goal:** Verify permanent errors don't retry

**Steps:**
1. Chat: "Create calendar event" (with invalid date like "invalid-date")
2. System should fail immediately
3. Check execution:
```sql
SELECT attempt_count, status, error_message 
FROM felicia_action_executions 
WHERE status = 'failed'
ORDER BY created_at DESC LIMIT 1;
-- Should show: attempt_count=1, status=failed, error includes "invalid"
```

**Expected Result:** ✅ Only 1 attempt (no retry for validation error)

---

### Test 6: Observability Linkage
**Goal:** Verify action_execution_id links logs to executions

**Steps:**
1. Create an event: "Meeting tomorrow"
2. Get execution ID:
```sql
SELECT id FROM felicia_action_executions 
ORDER BY created_at DESC LIMIT 1;
-- Note: exec_id (e.g., 42)
```
3. Find linked logs:
```sql
SELECT id, input, result, action_execution_id
FROM felicia_action_logs
WHERE action_execution_id = 42;  -- Replace 42 with exec_id
-- Should show 1+ rows with matching action_execution_id
```

**Expected Result:** ✅ Logs have action_execution_id set, can trace execution

---

### Test 7: Intent Drift (Clear Pending Confirmation)
**Goal:** Verify pending confirmations auto-clear on new intent

**Steps:**
1. Chat: "Remind me tomorrow"  
   *(Creates pending confirmation)*
2. Before answering, chat: "What's the weather?"
   *(Different intent)*
3. Check pending confirmations:
```sql
SELECT cleared
FROM felicia_pending_confirmations
ORDER BY created_at DESC LIMIT 1;
-- Should show: true (auto-cleared due to intent drift)
```

**Expected Result:** ✅ Pending confirmation cleared (intent changed)

---

## Part B: Automated Testing

### Setup Test Suite
```bash
# Create test file
touch tests/execution-engine.test.js

# Add to package.json
"scripts": {
  "test": "vitest"
}

npm install --save-dev vitest
```

### Test File: `tests/execution-engine.test.js`
```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOrGetActionExecution, updateActionExecutionState } from '../api/_lib/supabase.js';
import { executeHandlerWithState } from '../api/_lib/actions/index.js';
import { normalizeParams } from '../api/_lib/utils/idempotency-normalizer.js';

describe('Execution Engine', () => {
  
  let mockUserId = 'test-user';
  let mockExecId;

  // Test 1: Create Execution Record
  it('should create execution record with idempotency key', async () => {
    const result = await createOrGetActionExecution({
      userId: mockUserId,
      actionName: 'create_event',
      params: { summary: 'test', startTime: '2026-04-30T10:00' },
      source: 'chat',
      idempotencyKey: 'test-key-123',
    });
    
    expect(result).toBeDefined();
    expect(result.id).toBeGreaterThan(0);
    expect(result.status).toBe('pending');
    mockExecId = result.id;
  });

  // Test 2: Update Execution State
  it('should transition execution state: pending → running → success', async () => {
    await updateActionExecutionState(mockExecId, { status: 'running' });
    
    // Verify
    const exec = await getExecution(mockExecId);
    expect(exec.status).toBe('running');
    
    // Finish
    await updateActionExecutionState(mockExecId, { 
      status: 'success',
      result: { eventId: 'xyz789' }
    });
    
    const finished = await getExecution(mockExecId);
    expect(finished.status).toBe('success');
    expect(finished.result.eventId).toBe('xyz789');
  });

  // Test 3: Idempotency Deduplication
  it('should return same execution for duplicate idempotency key', async () => {
    const key = 'dedup-test-' + Date.now();
    
    // First call
    const result1 = await createOrGetActionExecution({
      userId: mockUserId,
      actionName: 'create_event',
      params: { summary: 'test' },
      idempotencyKey: key,
    });
    
    // Second call (same key)
    const result2 = await createOrGetActionExecution({
      userId: mockUserId,
      actionName: 'create_event',
      params: { summary: 'test' },
      idempotencyKey: key,
    });
    
    expect(result1.id).toBe(result2.id);
  });

  // Test 4: Date Normalization (Hour Bucket)
  it('should normalize dates to hour bucket', () => {
    const params1 = { startTime: '2026-04-30T10:00' };
    const params2 = { startTime: '2026-04-30T10:45' };
    
    const normalized1 = normalizeParams(params1);
    const normalized2 = normalizeParams(params2);
    
    expect(normalized1).toEqual(normalized2); // Same hour bucket
  });

  // Test 5: Wrapped Handler Execution
  it('should execute handler with state tracking', async () => {
    const mockHandler = async () => {
      return { eventId: 'test-123', summary: 'meeting' };
    };
    
    const wrapped = executeHandlerWithState(mockHandler);
    const result = await wrapped({
      userId: mockUserId,
      params: { summary: 'meeting', startTime: '2026-04-30T14:00' },
    });
    
    expect(result.data).toBeDefined();
    expect(result.actionExecutionId).toBeDefined();
  });

  // Clean up
  afterEach(async () => {
    // Delete test data if needed
  });
});
```

### Run Tests
```bash
npm test
# Output should show all tests passing ✅
```

---

## Part C: Integration Testing (Staging)

### Pre-Integration Checklist
- [ ] Migrations applied to staging database
- [ ] Environment variables set in Vercel staging
- [ ] Staging deployment successful
- [ ] Supabase staging instance healthy

### Integration Test Suite

**Test 1: Full Flow (Chat → API → DB)**
```bash
# Scenario: User creates calendar event

curl -X POST http://staging-api.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "adit",
    "threadId": "550e8400-e29b-41d4-a716-446655440000",
    "message": "Create meeting tomorrow at 2pm"
  }'

# Expected response:
# {
#   "reply": "✓ Event created: meeting tomorrow at 2pm",
#   "actionExecutionId": 42,
#   "data": {...}
# }

# Verify in database:
SELECT * FROM felicia_action_executions WHERE id = 42;
SELECT * FROM felicia_action_logs WHERE action_execution_id = 42;
```

**Test 2: Pending Confirmation Flow**
```bash
# Message 1: Low-confidence action
curl -X POST http://staging-api.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "adit",
    "message": "remind me sometime next week"
  }'

# Expected: Pending confirmation created

# Message 2: Confirm
curl -X POST http://staging-api.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "adit",
    "message": "ya"
  }'

# Expected: Pending confirmation cleared, action executed
```

**Test 3: Retry Under Load**
```bash
# Create 10 events in rapid succession
for i in {1..10}; do
  curl -X POST http://staging-api.vercel.app/api/chat \
    -H "Content-Type: application/json" \
    -d "{
      \"userId\": \"adit\",
      \"message\": \"Create event $i\"
    }" &
done
wait

# Verify all succeeded (check execution records)
SELECT COUNT(*) FROM felicia_action_executions 
WHERE status = 'success' AND created_at > now() - interval '1 minute';
# Should return: 10
```

---

## Part D: Production Smoke Test

### Day-1 Post-Deployment
```bash
# 1. Health check
curl https://your-domain.vercel.app/api/system-status

# 2. Simple action
curl -X POST https://your-domain.vercel.app/api/chat \
  -H "Content-Type: application/json" \
  -d '{"userId": "adit", "message": "Hi"}'

# 3. Check logs
SELECT * FROM felicia_action_logs ORDER BY created_at DESC LIMIT 5;

# 4. Monitor errors
SELECT COUNT(*), status 
FROM felicia_action_executions 
WHERE created_at > now() - interval '1 hour'
GROUP BY status;
# Should show: mostly 'success', few/no 'failed'
```

### Weekly Smoke Test
```sql
-- Action success rate
SELECT 
  DATE_TRUNC('day', created_at) as day,
  COUNT(*) as total,
  COUNT(CASE WHEN status='success' THEN 1 END) as successes,
  ROUND(100.0 * COUNT(CASE WHEN status='success' THEN 1 END) / COUNT(*), 2) as success_rate
FROM felicia_action_executions
WHERE created_at > now() - interval '7 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

-- Retry effectiveness
SELECT 
  COUNT(CASE WHEN attempt_count=1 THEN 1 END) as first_attempt_only,
  COUNT(CASE WHEN attempt_count>1 THEN 1 END) as retried,
  COUNT(CASE WHEN attempt_count>1 AND status='success' THEN 1 END) as retry_succeeded
FROM felicia_action_executions
WHERE created_at > now() - interval '7 days';
```

---

## Part E: Performance Testing

### Load Test (10 Concurrent Users)
```bash
# Install load testing tool
npm install --save-dev autocannon

# Create load test script
cat > tests/load-test.js << 'EOF'
import autocannon from 'autocannon';

autocannon(
  {
    url: 'http://localhost:3000/api/chat',
    connections: 10,
    duration: 30,
    requests: [{
      path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'load-test-user',
        message: 'Create event'
      })
    }],
  },
  (err, result) => {
    console.log(result);
  }
);
EOF

# Run
node tests/load-test.js

# Expected:
# Requests/sec: 100+
# Latency p99: < 500ms
# Errors: 0
```

---

## Part F: Debugging Guide

### Enable Debug Logging
```bash
# In .env.local
LOG_LEVEL=debug
DEBUG_MODE=true
```

### Check Execution State
```sql
-- Find all executions with details
SELECT 
  id,
  action_name,
  status,
  attempt_count,
  error_message,
  created_at
FROM felicia_action_executions
WHERE user_id = 'adit'
ORDER BY created_at DESC
LIMIT 10;

-- Trace specific execution
SELECT * FROM felicia_action_executions WHERE id = 42;
SELECT * FROM felicia_action_logs WHERE action_execution_id = 42;
SELECT * FROM felicia_action_steps WHERE action_execution_id = 42;
```

### Common Issues & Fixes

**Issue: Pending confirmation never expires**
```sql
-- Check expired confirmations
SELECT COUNT(*) FROM felicia_pending_confirmations
WHERE cleared = false AND expires_at < now();

-- Manually clear if stuck
UPDATE felicia_pending_confirmations
SET cleared = true
WHERE expires_at < now() AND cleared = false;
```

**Issue: Retry not working**
```bash
# Check LOG_LEVEL is debug
echo $LOG_LEVEL

# Check error is retryable
grep -i "isRetryableError" api/_lib/utils/error-classifier.js
```

---

## Test Results Checklist

- [ ] Test 1: Basic execution → ✅ success
- [ ] Test 2: Idempotency → ✅ dedup
- [ ] Test 3: Pending confirmation → ✅ soft-confirm
- [ ] Test 4: Retry logic → ✅ retried
- [ ] Test 5: Permanent error → ✅ no retry
- [ ] Test 6: Observability → ✅ linked
- [ ] Test 7: Intent drift → ✅ cleared
- [ ] Integration tests → ✅ all pass
- [ ] Load test (10 users) → ✅ 100 req/s
- [ ] Production smoke test → ✅ healthy

---

**Last Updated:** 2026-04-30  
**Version:** 1.0  
**Next Phase:** Performance profiling + embedding retrieval

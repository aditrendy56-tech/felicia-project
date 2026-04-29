# Manual Setup & Deployment Checklist
**Date:** 2026-04-30  
**Project:** Felicia — Hardened Core Phase Deployment

---

## 🎯 QUICK START (Do This First)

- [ ] **Step 1:** Read `SUPABASE_DEPLOYMENT_GUIDE.md` (full context)
- [ ] **Step 2:** Apply all 6 migrations in order (Supabase Dashboard or CLI)
- [ ] **Step 3:** Run verification queries to confirm tables exist
- [ ] **Step 4:** Deploy code (git push or redeploy to Vercel)
- [ ] **Step 5:** Test one action end-to-end

---

## 📊 SUPABASE CHANGES SUMMARY

### New Tables (4 total)
| Table | Rows | Purpose | Migration |
|-------|------|---------|-----------|
| `felicia_action_executions` | ~100/day | State machine for actions | `20260430_action_executions.sql` |
| `felicia_action_logs` | ~200/day | Audit trail (observability) | `20260429_action_logs.sql` |
| `felicia_pending_confirmations` | ~10 (active) | Soft-confirm state | `20260430_pending_confirmations.sql` |
| `felicia_action_steps` | ~300/day | Step-level tracing | `20260430_action_steps.sql` |

### Columns Added
| Table | Column | Type | Purpose |
|-------|--------|------|---------|
| `felicia_action_executions` | `idempotency_key` | text | Prevent duplicate retries |
| `felicia_action_executions` | `steps` | jsonb | Store step array (legacy) |
| `felicia_action_executions` | `source` | text | Track origin (chat/api/cron) |
| `felicia_action_logs` | `action_execution_id` | bigint | Link to execution |

### Indexes Added (8 total)
- `felicia_action_executions`: action_name, user_id, idempotency_key
- `felicia_action_logs`: execution_id
- `felicia_pending_confirmations`: user_id, thread_id
- `felicia_action_steps`: execution_id, step_name, status

---

## 🔧 MANUAL TASKS (By Category)

### A. DATABASE (MUST DO)

**Task A1: Apply Migrations**
- [ ] Log in to Supabase Dashboard
- [ ] Navigate to SQL Editor
- [ ] Copy-paste & run each migration (6 files in order from SUPABASE_DEPLOYMENT_GUIDE.md)
- [ ] Verify success: each shows green checkmark or no error
- [ ] **Estimated time:** 5-10 minutes

**Task A2: Run Verification Queries**
- [ ] Run all 4 verification queries from SUPABASE_DEPLOYMENT_GUIDE.md SECTION 5
- [ ] Screenshot results (for record)
- [ ] Confirm all 4 tables exist + correct indexes
- [ ] **Estimated time:** 2 minutes

**Task A3: (Optional) Enable RLS if Multi-User**
- [ ] Skip for now (assumes single user)
- [ ] Document for future: add RLS policies when expanding users
- [ ] **Estimated time:** N/A (future)

---

### B. CODE DEPLOYMENT (DEPENDS ON YOUR SETUP)

**Task B1: Deploy Backend Updates**

If using **Vercel:**
```powershell
# Push code to GitHub (main branch)
git add .
git commit -m "chore: hardened core phase - execution engine + idempotency"
git push origin main

# Vercel auto-deploys on push to main
# Monitor: https://vercel.com/your-project → Deployments
```

If using **local Node.js:**
```powershell
# Restart server
npm run dev
# or if using prod build
npm run build
npm start
```

If using **Docker:**
```powershell
docker-compose down
docker-compose up -d
```

- [ ] Code deployed to production
- [ ] No new error logs in server logs
- [ ] **Estimated time:** 2-5 minutes

**Task B2: Verify API Endpoints Still Work**
- [ ] Test `/api/chat` endpoint with a simple message
- [ ] Expected: 200 response with action/reply
- [ ] Check server logs for no errors
- [ ] **Estimated time:** 2 minutes

---

### C. TESTING (RECOMMENDED)

**Task C1: Test Basic Action Flow**
```powershell
# Example: create calendar event
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "remind me tomorrow at 2pm to check email",
    "chatType": "utama",
    "userId": "adit"
  }'

# Expected: action execution created, logs recorded
```
- [ ] Message sent successfully
- [ ] Response contains reply or action
- [ ] Check Supabase: new row in `felicia_action_executions`
- [ ] **Estimated time:** 3 minutes

**Task C2: Test Idempotency (Retry Behavior)**
```powershell
# Send same message twice
# First should create new execution
# Second should return same execution_id (idempotent)

# Query to verify:
SELECT idempotency_key, id, attempt_count FROM felicia_action_executions 
WHERE action_name = 'create_event' 
ORDER BY created_at DESC LIMIT 2;
```
- [ ] Same idempotency_key returned for retry
- [ ] `attempt_count` incremented but `id` same
- [ ] **Estimated time:** 5 minutes

**Task C3: Test Soft-Confirm Flow**
```powershell
# Send message that triggers clarification (low confidence)
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "umm maybe reschedule that thing",
    "chatType": "utama"
  }'

# Query pending confirmations:
SELECT * FROM felicia_pending_confirmations WHERE cleared = false;

# Should show active confirmation
```
- [ ] Clarification reply received
- [ ] Row exists in `felicia_pending_confirmations`
- [ ] Confirmation expires after 5 min
- [ ] **Estimated time:** 5 minutes

**Task C4: Monitor First 24 Hours**
- [ ] Check server logs for errors
- [ ] Spot-check database: execute SELECT queries to verify data flowing
- [ ] Example: `SELECT COUNT(*) FROM felicia_action_executions WHERE created_at > now() - interval '1 hour';`
- [ ] Expected: growing count as users interact
- [ ] **Estimated time:** throughout day

---

### D. MONITORING & OBSERVABILITY (NICE-TO-HAVE)

**Task D1: Set Up Alerts (Optional)**
- [ ] Log in to Supabase → Project Settings → Database Alerts (if available)
- [ ] Enable alerts for:
  - Table growth > threshold
  - Query failures
  - Connection pool exhaustion
- [ ] **Estimated time:** 5 minutes

**Task D2: Query Performance Baseline**
```sql
-- Log queries to establish baseline
SELECT 
  query, 
  mean_time, 
  calls 
FROM pg_stat_statements 
WHERE query LIKE '%felicia_action%' 
ORDER BY mean_time DESC 
LIMIT 10;
```
- [ ] Screenshot baseline query times
- [ ] Monitor over time (for embedding phase)
- [ ] **Estimated time:** 2 minutes

---

### E. DOCUMENTATION (KEEP FOR REFERENCE)

**Task E1: Update README or Wiki**
- [ ] Add note: "Hardened Core Phase deployed on 2026-04-30"
- [ ] Link to `SUPABASE_DEPLOYMENT_GUIDE.md`
- [ ] List new features: idempotency, step tracing, soft-confirm UX
- [ ] **Estimated time:** 5 minutes

**Task E2: Backup Migration Scripts**
- [ ] Save `SUPABASE_DEPLOYMENT_GUIDE.md` to team wiki or Notion
- [ ] Save all migration files to secure location (already in repo)
- [ ] Document success date if deployment completes
- [ ] **Estimated time:** 2 minutes

---

## ⏱️ TOTAL EFFORT ESTIMATE

| Category | Time | Critical |
|----------|------|----------|
| A. Database | 15 min | ✅ YES |
| B. Code Deployment | 10 min | ✅ YES |
| C. Testing | 20 min | ⚠️ RECOMMENDED |
| D. Monitoring | 10 min | ❌ OPTIONAL |
| E. Documentation | 10 min | ❌ OPTIONAL |
| **TOTAL** | **~65 min** | — |

---

## 🚀 EXECUTION PLAN (Recommended Order)

### Phase 1: Setup (30 min)
1. Read SUPABASE_DEPLOYMENT_GUIDE.md thoroughly
2. Apply all 6 migrations to Supabase
3. Run verification queries
4. Deploy code to production

### Phase 2: Validation (15 min)
5. Test basic action flow
6. Verify at least one execution created in DB
7. Check logs for no errors

### Phase 3: Advanced Testing (20 min, Optional)
8. Test idempotency
9. Test soft-confirm flow
10. Monitor for errors

### Phase 4: Documentation (10 min, Optional)
11. Update README
12. Backup guide to wiki
13. Document deployment date

---

## ❌ DO NOT DO

- ❌ Apply migrations out of order (will fail constraints)
- ❌ Delete old tables (`felicia_commands`, `felicia_modes`, etc.) — they're still used
- ❌ Manually edit data in `felicia_action_executions` (system-managed)
- ❌ Deploy code before applying migrations (will see "table doesn't exist" warnings)
- ❌ Skip verification queries (you need to confirm deployment worked)

---

## ✅ IF EVERYTHING WORKS

After checklist complete:
- [ ] All tests pass
- [ ] New executions showing in Supabase
- [ ] No console errors
- [ ] Soft-confirm flow responsive

**Next Step:** Ready for Embedding Retrieval Phase! 🎯

---

## 🆘 HELP

If stuck, check:
1. **SUPABASE_DEPLOYMENT_GUIDE.md SECTION 9** (Troubleshooting)
2. **Supabase Dashboard** → Logs tab (error details)
3. **Server logs** on your deployment (Vercel, local, etc.)
4. **GitHub Issues** (if error persists)

---

**Generated:** 2026-04-30  
**Status:** Ready for immediate deployment  
**Next Review:** Post-embedding-retrieval  

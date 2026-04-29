# Supabase Setup & Migration Guide
**Date:** 2026-04-30  
**Version:** Post-Hardened-Core Phase  
**Status:** Ready for deployment

---

## 📋 SECTION 1: Overview of All Changes

### New Tables Created
1. `felicia_action_executions` — Main state machine for action tracking
2. `felicia_action_logs` — Observability/audit log (linked to executions)
3. `felicia_pending_confirmations` — Soft-confirm flow state
4. `felicia_action_steps` — Semantic step-level tracing (future analytics)

### New Columns Added
- `felicia_action_executions`: `idempotency_key`, `steps`, `source`
- `felicia_action_logs`: `action_execution_id` (linkage to executions)
- `felicia_pending_confirmations`: (all new table)

### Existing Tables Unchanged
- `felicia_memories` — no schema changes (code-only improvements)
- `felicia_chat_threads` — no schema changes
- `felicia_chat_messages` — no schema changes
- `felicia_modes` — no schema changes
- `felicia_commands` — no schema changes (still used for backward compat)

---

## 🔄 SECTION 2: Migration Execution Order

**CRITICAL:** Run migrations in this exact order to avoid constraint/dependency issues:

### Step 1: Create new tables (no dependencies)
```
1. supabase/migrations/20260429_action_logs.sql
2. supabase/migrations/20260430_pending_confirmations.sql
```

### Step 2: Create primary execution table
```
3. supabase/migrations/20260430_action_executions.sql
```

### Step 3: Add columns to existing tables
```
4. supabase/migrations/20260430_action_executions_add_columns.sql
5. supabase/migrations/20260430_action_logs_add_exec_id.sql
```

### Step 4: Create step-level tracing table (depends on executions)
```
6. supabase/migrations/20260430_action_steps.sql
```

---

## 🛠️ SECTION 3: How to Apply Migrations

### Option A: Supabase Dashboard (Safest for first-time)
1. Log in to supabase.com → your project
2. Navigate to SQL Editor
3. For each migration file in order above:
   - Open file from `supabase/migrations/`
   - Copy entire content
   - Paste into SQL Editor
   - Click "Run" button
   - Wait for success confirmation
   - Note: Dashboard shows green checkmark or error details

### Option B: psql CLI (Faster, for experienced users)
```powershell
# Set your Supabase connection string (from project settings → Connection Pooling)
$SUPABASE_CONNECTION = "postgres://postgres:<password>@<host>:5432/postgres?sslmode=require"

# Run each migration in order
psql $SUPABASE_CONNECTION -f "supabase/migrations/20260429_action_logs.sql"
psql $SUPABASE_CONNECTION -f "supabase/migrations/20260430_pending_confirmations.sql"
psql $SUPABASE_CONNECTION -f "supabase/migrations/20260430_action_executions.sql"
psql $SUPABASE_CONNECTION -f "supabase/migrations/20260430_action_executions_add_columns.sql"
psql $SUPABASE_CONNECTION -f "supabase/migrations/20260430_action_logs_add_exec_id.sql"
psql $SUPABASE_CONNECTION -f "supabase/migrations/20260430_action_steps.sql"
```

### Option C: Supabase CLI (Recommended if you use Supabase locally)
```powershell
cd "c:\Users\User\Videos\felicia project"

# Link to your remote Supabase project (first time only)
supabase link --project-ref <your-project-ref>

# Push all pending migrations
supabase db push
```

---

## 🔐 SECTION 4: Security & RLS Policies

### Current Status
- **RLS (Row Level Security):** NOT enabled on new tables (assumes single-user system)
- **Assumption:** Single authenticated user (Adit) per workspace

### If You Need Multi-User Support Later
Add RLS policies to each table:

```sql
-- Example for felicia_action_executions
ALTER TABLE felicia_action_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see their own executions" ON felicia_action_executions
  FOR SELECT USING (auth.uid()::text = user_id);

CREATE POLICY "Users can only insert their own executions" ON felicia_action_executions
  FOR INSERT WITH CHECK (auth.uid()::text = user_id);
```

---

## 📊 SECTION 5: Verification Queries (Run After Migrations)

After applying all migrations, run these queries to verify:

```sql
-- 1. Check new tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN (
  'felicia_action_executions',
  'felicia_action_logs',
  'felicia_pending_confirmations',
  'felicia_action_steps'
);

-- 2. Check columns in action_executions
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'felicia_action_executions'
ORDER BY column_name;

-- 3. Check indexes
SELECT indexname FROM pg_indexes 
WHERE tablename IN (
  'felicia_action_executions',
  'felicia_action_logs',
  'felicia_pending_confirmations',
  'felicia_action_steps'
);

-- 4. Check foreign keys (if any)
SELECT constraint_name, table_name FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY'
AND table_name IN (
  'felicia_action_executions',
  'felicia_action_logs',
  'felicia_pending_confirmations',
  'felicia_action_steps'
);
```

---

## ⚙️ SECTION 6: Code Changes Requiring Supabase Functions (Optional)

### Helper Functions Now Available in Code
All new DB operations are wrapped in helper functions in `api/_lib/supabase.js`:

```javascript
// Execution tracking
createActionExecution(...)
createOrGetActionExecution(...)  // idempotency-aware
updateActionExecutionState(...)

// Step-level tracing
insertActionStep(...)

// Pending confirmations
createPendingConfirmation(...)
getPendingConfirmationForUser(...)
clearPendingConfirmation(...)
```

**No custom SQL views or triggers needed** — code handles all logic.

---

## 📝 SECTION 7: Environment Variables (No Changes Needed)

Your existing `.env` should already have:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Action required:** None. Code auto-detects new tables.

---

## 🧪 SECTION 8: Testing After Deployment

### Test 1: Create an Action Execution
```powershell
# Use curl or Postman to test /api/chat endpoint
$body = @{
  message = "remind me to buy milk"
  chatType = "utama"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/api/chat" -Method Post -Body $body -ContentType "application/json"
```

### Test 2: Verify Execution Record Created
```sql
SELECT id, action_name, status, created_at FROM felicia_action_executions 
ORDER BY created_at DESC LIMIT 1;
```

### Test 3: Check Action Logs Linked
```sql
SELECT * FROM felicia_action_logs 
WHERE action_execution_id IS NOT NULL 
ORDER BY created_at DESC LIMIT 1;
```

### Test 4: Verify Pending Confirmation (soft-confirm flow)
```sql
SELECT * FROM felicia_pending_confirmations 
WHERE cleared = false AND expires_at > now()
ORDER BY created_at DESC LIMIT 1;
```

---

## 🚨 SECTION 9: Troubleshooting

### Issue: "Table does not exist"
- **Cause:** Migration not applied
- **Fix:** Run migration from SECTION 3, verify via SECTION 5

### Issue: "Column does not exist"
- **Cause:** Partial migration applied
- **Fix:** Re-run ALL migrations in order (safe, they use `IF NOT EXISTS`)

### Issue: "Constraint violation" or "Unique constraint fails"
- **Cause:** Data already exists from partial run
- **Fix:** 
  1. Drop table: `DROP TABLE IF EXISTS table_name CASCADE;`
  2. Re-run migration
  3. (Only if needed) clear old data first

### Issue: Code throws "Table doesn't exist yet (migration not applied)"
- **Cause:** Helper function detects table missing (graceful fallback)
- **Action:** Silently skipped in code. Once migration applied, will work.
- **Test:** Check query from SECTION 8 Test 2

---

## 📅 SECTION 10: Post-Deployment Checklist

- [ ] All 6 migrations applied successfully
- [ ] Verification queries from SECTION 5 all pass
- [ ] Test flow from SECTION 8 works
- [ ] No errors in server logs
- [ ] At least one action execution record exists in DB
- [ ] Pending confirmations flow tested (soft-confirm)
- [ ] Idempotency tested (retry should return same execution_id)

---

## 🔮 SECTION 11: Future Considerations

### When Adding Embedding Support
New migration will need:
- `felicia_memory_embeddings` table
- Columns: `memory_id, embedding (vector), created_at`
- Index on embedding for similarity search

### When Adding Multi-Step Actions
Use `felicia_action_steps` table:
- Each step gets recorded separately
- Enables partial failure handling
- Allows per-step analytics

### When Scaling to Multiple Users
Add RLS policies (SECTION 4) and `user_id` validation throughout

---

## 📞 Need Help?

If any migration fails:
1. Check error message from Supabase UI
2. Verify migration file syntax: `SELECT * FROM pg_stat_statements WHERE query LIKE '%CREATE TABLE%';`
3. Revert by dropping table: `DROP TABLE IF EXISTS table_name CASCADE;`
4. Re-run migration in correct order

---

**Last Updated:** 2026-04-30  
**Next Review:** After embedding retrieval implementation

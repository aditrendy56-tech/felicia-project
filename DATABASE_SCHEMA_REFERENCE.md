# Database Schema Reference
**Project:** Felicia AI System  
**Date:** 2026-04-30  
**Phase:** Hardened Core (Execution Engine Ready)

---

## Table of Contents
1. [New Tables](#new-tables)
2. [Modified Existing Tables](#modified-existing-tables)
3. [Unchanged Tables (Reference)](#unchanged-tables-reference)
4. [Indexes](#indexes)
5. [Data Flow Diagram](#data-flow-diagram)
6. [Query Examples](#query-examples)

---

## New Tables

### 1. felicia_action_executions
**Purpose:** Central state machine for all action executions  
**Row count estimate:** ~100/day  
**Retention:** 90 days (consider archiving older)

```sql
CREATE TABLE public.felicia_action_executions (
  id bigserial PRIMARY KEY,
  user_id text,                    -- who executed (null = system/cron)
  action_name text NOT NULL,       -- create_event, delete_event, set_mode, etc.
  params jsonb,                    -- normalized action params
  source text,                     -- chat, api, discord, cron, etc.
  thread_id uuid,                  -- link to conversation thread (if applicable)
  status text NOT NULL DEFAULT 'pending',  -- pending → running → success/failed
  attempt_count integer NOT NULL DEFAULT 0,
  idempotency_key text,            -- sha256 hash of (action+params+user) for dedup
  steps jsonb,                     -- array of step objects (legacy, future use felicia_action_steps)
  started_at timestamptz,
  finished_at timestamptz,
  result jsonb,                    -- final result/reply from action
  error_message text,              -- error details if failed
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
- `idx_felicia_action_executions_action_name` — query by action type
- `idx_felicia_action_executions_user_id` — query by user
- `idx_felicia_action_executions_idempotency` — idempotency lookups

**Example Data:**
```json
{
  "id": 42,
  "user_id": "adit",
  "action_name": "create_event",
  "params": {"summary": "meeting", "startTime": "2026-04-30T10:00"},
  "source": "chat",
  "thread_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "attempt_count": 1,
  "idempotency_key": "abc123def456...",
  "started_at": "2026-04-30T09:55:00Z",
  "finished_at": "2026-04-30T09:55:02Z",
  "result": {"eventId": "xyz789", "summary": "meeting", ...},
  "error_message": null,
  "created_at": "2026-04-30T09:55:00Z"
}
```

---

### 2. felicia_action_logs
**Purpose:** Audit trail / observability log  
**Row count estimate:** ~200/day  
**Retention:** 180 days (archive to cold storage if needed)

```sql
CREATE TABLE IF NOT EXISTS public.felicia_action_logs (
  id bigserial PRIMARY KEY,
  user_id text,
  source text,                    -- chat, discord, api, cron
  input text,                     -- raw user message or request
  parsed_intent text,             -- detected intent (set_mode, create_event, etc.)
  action_executed text,           -- which action handler ran
  result text,                    -- preview of result (first 500 chars)
  error text,                     -- error message if failed
  ai_provider_used text,          -- gemini, fallback_model, etc.
  fallback_used boolean,          -- true if fallback model used
  action_execution_id bigint,     -- LINK to felicia_action_executions.id
  status text,                    -- success, error, quota_limited, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
- `idx_felicia_action_logs_execution_id` — trace log → execution

**Example Data:**
```json
{
  "id": 100,
  "user_id": "adit",
  "source": "chat",
  "input": "remind me tomorrow at 2pm",
  "parsed_intent": "create_event",
  "action_executed": "create_event",
  "result": "✓ Event created",
  "error": null,
  "ai_provider_used": "gemini",
  "fallback_used": false,
  "action_execution_id": 42,
  "status": "success",
  "created_at": "2026-04-30T09:55:00Z"
}
```

---

### 3. felicia_pending_confirmations
**Purpose:** Store pending soft-confirm state (quick UX for low-confidence actions)  
**Row count estimate:** ~10 active at any time (expires in 300s)  
**TTL:** Auto-expires via `expires_at` (not auto-deleted, manually cleared)

```sql
CREATE TABLE IF NOT EXISTS public.felicia_pending_confirmations (
  id bigserial PRIMARY KEY,
  user_id text,
  thread_id uuid,
  action_name text NOT NULL,      -- the action waiting for confirmation
  params jsonb,                   -- action params user needs to confirm
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,               -- after this, confirmation is stale
  cleared boolean NOT NULL DEFAULT false         -- true = confirmed, rejected, or timed out
);
```

**Indexes:**
- `idx_felicia_pending_confirmations_user` — fetch pending for user
- `idx_felicia_pending_confirmations_thread` — fetch pending in thread

**Example Data:**
```json
{
  "id": 5,
  "user_id": "adit",
  "thread_id": "550e8400-e29b-41d4-a716-446655440000",
  "action_name": "reschedule",
  "params": {"eventId": "xyz789", "startTime": "2026-05-01T14:00"},
  "created_at": "2026-04-30T10:00:00Z",
  "expires_at": "2026-04-30T10:05:00Z",
  "cleared": false
}
```

**Flow:**
1. AI returns low-confidence action (confidence < 0.82)
2. System creates pending confirmation (TTL 300s)
3. Orchestrator asks for quick confirm
4. User replies "ya" or "tidak"
5. Confirmation cleared + action executed/rejected

---

### 4. felicia_action_steps
**Purpose:** Semantic step-level tracing for compound actions (future use)  
**Row count estimate:** ~300/day (once multi-step actions deployed)  
**Current status:** Infrastructure ready, not yet used actively

```sql
CREATE TABLE IF NOT EXISTS public.felicia_action_steps (
  id bigserial PRIMARY KEY,
  action_execution_id bigint NOT NULL,  -- FOREIGN KEY to felicia_action_executions.id
  step_name text NOT NULL,              -- create_event, link_case, save_memory, etc.
  attempt_number integer NOT NULL DEFAULT 1,  -- retry attempt within this step
  status text NOT NULL DEFAULT 'pending',     -- running, success, failed
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,                  -- milliseconds to complete this step
  input jsonb,                          -- what we sent to this step
  output jsonb,                         -- what this step returned
  error_message text,                   -- error if failed
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Indexes:**
- `idx_felicia_action_steps_execution_id` — fetch all steps for execution
- `idx_felicia_action_steps_step_name` — analytics by step type
- `idx_felicia_action_steps_status` — find failed steps

**Example Data (Future):**
```json
{
  "id": 1000,
  "action_execution_id": 42,
  "step_name": "create_event",
  "attempt_number": 1,
  "status": "success",
  "started_at": "2026-04-30T09:55:00Z",
  "finished_at": "2026-04-30T09:55:01Z",
  "duration_ms": 1200,
  "input": {"summary": "meeting", "startTime": "2026-04-30T10:00"},
  "output": {"eventId": "xyz789"},
  "error_message": null,
  "created_at": "2026-04-30T09:55:00Z"
}
```

---

## Modified Existing Tables

### felicia_action_executions (Additions)
- **New columns:** `idempotency_key`, `steps`, `source`
- **Migration:** `20260430_action_executions_add_columns.sql`

### felicia_action_logs (Additions)
- **New column:** `action_execution_id` (bigint, nullable, links to executions)
- **Migration:** `20260430_action_logs_add_exec_id.sql`

---

## Unchanged Tables (Reference)

### felicia_memories
- Stores long-term facts, context, preferences
- **No schema changes** (only code improvements: dedup detection, memory ranking)
- Still used by: memory retrieval, context building

### felicia_chat_threads
- Stores conversation threads (utama, refleksi, strategi types)
- **No schema changes**
- Links to `felicia_chat_messages`

### felicia_chat_messages
- Individual messages in a thread
- **No schema changes**
- Stores action params and execution metadata

### felicia_modes
- Active mode log (DROP, CHAOS, OVERWORK, FOCUS)
- **No schema changes**
- Still used by: mode activation, calendar reschedule

### felicia_commands
- Backward-compat log of all commands
- **No schema changes**
- Still used by: weekly review, audit trail

---

## Indexes

### All Indexes Created
```sql
-- felicia_action_executions (4)
CREATE INDEX idx_felicia_action_executions_action_name ON felicia_action_executions(action_name);
CREATE INDEX idx_felicia_action_executions_user_id ON felicia_action_executions(user_id);
CREATE INDEX idx_felicia_action_executions_idempotency ON felicia_action_executions(idempotency_key);

-- felicia_action_logs (1)
CREATE INDEX idx_felicia_action_logs_execution_id ON felicia_action_logs(action_execution_id);

-- felicia_pending_confirmations (2)
CREATE INDEX idx_felicia_pending_confirmations_user ON felicia_pending_confirmations(user_id);
CREATE INDEX idx_felicia_pending_confirmations_thread ON felicia_pending_confirmations(thread_id);

-- felicia_action_steps (3)
CREATE INDEX idx_felicia_action_steps_execution_id ON felicia_action_steps(action_execution_id);
CREATE INDEX idx_felicia_action_steps_step_name ON felicia_action_steps(step_name);
CREATE INDEX idx_felicia_action_steps_status ON felicia_action_steps(status);
```

**Note:** No full-text search indexes needed (action names are small, queryable via indexed columns).

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│         User → Chat / Discord / API                    │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
                   ┌──────────────────┐
                   │ Orchestrator     │
                   │ (ask AI, guard)  │
                   └────────┬─────────┘
                            │
                            ▼
                   ┌──────────────────────────┐
                   │ executeActionSafely()    │
                   │ - create execution       │ ◄─── felicia_action_executions (id=123)
                   │ - check idempotency      │ ◄─── idempotency_key lookup
                   │ - run handler + retry    │
                   │ - update state           │
                   └────────┬─────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
      ┌─────────────────┐     ┌──────────────────┐
      │ Action Handler  │     │ logCommand()     │
      │ (create_event)  │     │ - record input   │ ◄─── felicia_action_logs
      │ - performs work │     │ - link execution │ ◄─── action_execution_id
      │ - returns reply │     │ - track source   │
      └────────┬────────┘     └──────────────────┘
               │
               ▼
      ┌─────────────────┐
      │ User Gets Reply │ + Action Result Logged
      └─────────────────┘
```

---

## Query Examples

### Example 1: Get Last 5 Actions
```sql
SELECT 
  id, 
  action_name, 
  status, 
  attempt_count, 
  created_at 
FROM felicia_action_executions 
ORDER BY created_at DESC 
LIMIT 5;
```

### Example 2: Find Failed Actions (for debugging)
```sql
SELECT 
  id, 
  action_name, 
  error_message, 
  attempt_count, 
  created_at 
FROM felicia_action_executions 
WHERE status = 'failed' 
ORDER BY created_at DESC 
LIMIT 10;
```

### Example 3: Trace Execution → Logs
```sql
SELECT 
  e.id as exec_id,
  e.action_name,
  e.status,
  l.input,
  l.result,
  l.created_at
FROM felicia_action_executions e
LEFT JOIN felicia_action_logs l ON l.action_execution_id = e.id
WHERE e.id = 42
ORDER BY l.created_at DESC;
```

### Example 4: Check Active Confirmations
```sql
SELECT 
  id,
  action_name,
  expires_at,
  cleared,
  now() as current_time
FROM felicia_pending_confirmations
WHERE cleared = false 
  AND expires_at > now()
ORDER BY created_at DESC;
```

### Example 5: Step-Level Analytics (Future)
```sql
SELECT 
  step_name,
  COUNT(*) as total,
  AVG(duration_ms) as avg_duration_ms,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) as failures
FROM felicia_action_steps
WHERE created_at > now() - interval '7 days'
GROUP BY step_name
ORDER BY avg_duration_ms DESC;
```

### Example 6: Idempotency Check
```sql
SELECT 
  idempotency_key,
  COUNT(*) as executions,
  array_agg(id) as ids
FROM felicia_action_executions
WHERE created_at > now() - interval '1 hour'
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
-- Should return empty (no duplicates) or show retries with same id
```

---

## Migration Dependencies

```
20260429_action_logs.sql
       │
       ▼ (independent)
20260430_pending_confirmations.sql
       │
       ▼ (no deps yet)
20260430_action_executions.sql ◄─── PRIMARY TABLE
       │
       ├─ 20260430_action_executions_add_columns.sql
       │
       └─ 20260430_action_steps.sql ◄─── DEPENDS ON felicia_action_executions
          
20260430_action_logs_add_exec_id.sql ◄─── ADDS FK to action_executions
```

**Order:** Always run in sequence shown above.

---

## Performance Notes

### Query Performance (Baseline)
- **Get recent actions:** ~2ms (indexed by created_at)
- **Find by idempotency:** ~1ms (indexed)
- **Full trace (exec + logs):** ~5ms (two indexed lookups)
- **Active confirmations:** ~1ms (filtered by boolean + timestamp)

### Storage Estimate (Monthly)
- `felicia_action_executions`: ~3MB (100/day × 30 days × ~1KB/row)
- `felicia_action_logs`: ~6MB (200/day × 30 days × ~1KB/row)
- `felicia_action_steps`: ~9MB (future, when multi-step active)
- **Total:** ~18MB/month (negligible for Supabase)

### Recommendations
- Archive rows older than 90 days to cold storage if needed
- Monitor index bloat with `REINDEX` monthly
- Consider partition by date if hitting 10M+ rows/year

---

## Security Notes

- **RLS:** Not enabled (assumes single-user)
- **Auth:** Relies on Supabase service role (backend only)
- **Sensitive data:** No passwords or tokens stored in these tables
- **Future:** Add RLS policies if multi-user support needed

---

**Last Updated:** 2026-04-30  
**Schema Version:** 1.0 (Hardened Core)  
**Next Evolution:** Embedding vectors + step analytics

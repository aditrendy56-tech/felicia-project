# Environment Configuration Guide
**Project:** Felicia AI System  
**Date:** 2026-04-30  
**Scope:** Deployment + Configuration

---

## Environment Variables Required

### Supabase (Backend)
```bash
# Production
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Staging (if applicable)
STAGING_SUPABASE_URL=...
STAGING_SUPABASE_SERVICE_ROLE_KEY=...
```

### Gemini AI
```bash
GEMINI_API_KEY=your-gemini-api-key-here
# Fallback model (optional, for resilience)
FALLBACK_API_KEY=... (if using alternative AI provider)
```

### Discord Integration (Optional)
```bash
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-guild-id
DISCORD_CHANNEL_IDS=channel1,channel2,channel3
```

### Calendar Integration
```bash
GOOGLE_CALENDAR_CREDENTIALS=<json-string-or-path>
GOOGLE_CALENDAR_TIMEZONE=Asia/Jakarta  # Your timezone
```

### Frontend (Vite)
```bash
# In .env.local or .env.production
VITE_API_BASE_URL=http://localhost:3000/api  # dev
# or
VITE_API_BASE_URL=https://your-domain.vercel.app/api  # prod
```

### System Configuration
```bash
# Logging & Debugging
LOG_LEVEL=info  # debug, info, warn, error
DEBUG_MODE=false

# Feature Flags
ENABLE_PENDING_CONFIRMATIONS=true
ENABLE_RETRY_LOGIC=true
ENABLE_IDEMPOTENCY=true
IDEMPOTENCY_WINDOW_MINUTES=60

# Performance
MAX_ACTION_RETRY_ATTEMPTS=3
ACTION_RETRY_BACKOFF_MS=500  # exponential: 500, 1000, 2000
PENDING_CONFIRMATION_TTL_SECONDS=300  # 5 minutes

# Rate Limiting (Optional)
RATE_LIMIT_REQUESTS_PER_MINUTE=60
RATE_LIMIT_ACTIONS_PER_HOUR=100
```

---

## Setup Checklist

### 1. Local Development Setup

```bash
# Clone repo
git clone <your-repo>
cd felicia-project

# Install dependencies
npm install

# Create .env.local with development vars
cat > .env.local << EOF
SUPABASE_URL=<your-dev-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-dev-service-role-key>
GEMINI_API_KEY=<your-gemini-api-key>
LOG_LEVEL=debug
EOF

# Run dev server
npm run dev

# In another terminal, run Vercel Functions locally
vercel dev  # or `npm run api-dev` if script exists
```

**Verification:**
```bash
# Check Supabase connection
curl http://localhost:3000/api/system-status

# Should return:
# {
#   "status": "ok",
#   "supabase_connected": true,
#   "gemini_available": true,
#   "timestamp": "2026-04-30T..."
# }
```

---

### 2. Staging Deployment

```bash
# Set staging environment variables in Vercel
vercel env add SUPABASE_URL
# Enter: your-staging-supabase-url
vercel env add SUPABASE_SERVICE_ROLE_KEY
# Enter: your-staging-service-role-key

# Deploy to staging
vercel deploy --prod --env staging

# Verify migrations applied
psql -h staging-db.supabase.co -U postgres -d postgres \
  -c "SELECT * FROM information_schema.tables WHERE table_schema='public';"

# Should show: felicia_action_executions, felicia_action_logs, etc.
```

---

### 3. Production Deployment

**Pre-flight:**
1. Backup production Supabase database
2. Test migrations in staging first
3. Run smoke tests (create_event, retry, pending confirm)
4. Notify team of deployment window

**Deploy:**
```bash
# Set production env vars in Vercel
vercel env add SUPABASE_URL --prod
vercel env add SUPABASE_SERVICE_ROLE_KEY --prod

# Deploy to production
vercel deploy --prod

# Apply migrations to production database
# (See SUPABASE_DEPLOYMENT_GUIDE.md)

# Verify schema
# Query: SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';
# Should show ≥13 tables (8 existing + 5 new)
```

---

## Configuration by Environment

### Development
```
LOG_LEVEL: debug
DEBUG_MODE: true
ENABLE_PENDING_CONFIRMATIONS: true
ENABLE_RETRY_LOGIC: true (may want to disable for testing)
IDEMPOTENCY_WINDOW_MINUTES: 1 (shorter for faster testing)
```

### Staging
```
LOG_LEVEL: info
DEBUG_MODE: false
ENABLE_PENDING_CONFIRMATIONS: true
ENABLE_RETRY_LOGIC: true
IDEMPOTENCY_WINDOW_MINUTES: 60
MAX_ACTION_RETRY_ATTEMPTS: 2 (fewer retries for faster feedback)
```

### Production
```
LOG_LEVEL: warn
DEBUG_MODE: false
ENABLE_PENDING_CONFIRMATIONS: true
ENABLE_RETRY_LOGIC: true
IDEMPOTENCY_WINDOW_MINUTES: 60
MAX_ACTION_RETRY_ATTEMPTS: 3
ACTION_RETRY_BACKOFF_MS: 500
PENDING_CONFIRMATION_TTL_SECONDS: 300
```

---

## Secrets Management

### Using Vercel Secrets
```bash
# Add secret to Vercel
vercel env add SUPABASE_SERVICE_ROLE_KEY
# This will ask for value, store securely

# View all secrets (on vercel.com/dashboard)
# Secrets are encrypted, only visible at deploy time

# Rotate secret
vercel env rm SUPABASE_SERVICE_ROLE_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY  # with new value
```

### Using Local .env.local
```bash
# DO NOT commit .env.local
echo ".env.local" >> .gitignore

# Create locally (copy .env.example)
cp .env.example .env.local

# Fill in your values
nano .env.local

# .env.local should be readable only by you
chmod 600 .env.local
```

---

## Feature Flags

### Pending Confirmations
```
ENABLE_PENDING_CONFIRMATIONS=true

When false:
- Low-confidence actions execute immediately (no "confirm?" step)
- Useful for testing without soft-confirm flow
```

### Retry Logic
```
ENABLE_RETRY_LOGIC=true

When false:
- All errors result in immediate failure
- No exponential backoff retry
- Useful for isolating issues to first attempt
```

### Idempotency
```
ENABLE_IDEMPOTENCY=true

When false:
- Every action creates new execution record
- Duplicate requests execute twice
- Useful for testing (but don't use in production!)
```

---

## Database Connection Pooling

### Supabase Connection Pool (Auto-Managed)
```javascript
// Already handled by Supabase SDK
// Default: 10 connections per serverless function instance

// If hitting pool limits, increase in Supabase settings:
// Project Settings → Database → Connection Pooling
// Mode: Transaction (for serverless)
// Max connections: 20-50 (per instance)
```

---

## Monitoring & Observability

### Logging Destinations

**Local Development:**
- Console output (stdout/stderr)
- Set `LOG_LEVEL=debug` for verbose output

**Staging/Production:**
```bash
# Logs available in:
# 1. Vercel dashboard → Deployments → Logs
# 2. Supabase dashboard → SQL Editor (query felicia_action_logs)
# 3. Datadog/NewRelic (if configured)
```

### Health Check Endpoint
```bash
curl https://your-domain.vercel.app/api/system-status
```

Response:
```json
{
  "status": "ok",
  "supabase_connected": true,
  "gemini_available": true,
  "timestamp": "2026-04-30T10:15:00Z",
  "version": "2.1.0"
}
```

### Performance Metrics
```sql
-- Query execution times (from logs)
SELECT 
  action_name,
  COUNT(*) as total,
  AVG(EXTRACT(EPOCH FROM (finished_at - started_at))) as avg_duration_s,
  MAX(EXTRACT(EPOCH FROM (finished_at - started_at))) as max_duration_s
FROM felicia_action_executions
WHERE created_at > now() - interval '1 day'
GROUP BY action_name
ORDER BY avg_duration_s DESC;
```

---

## Troubleshooting

### Issue: "Supabase connection failed"
**Diagnosis:**
```bash
# Check credentials in .env
echo $SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY | head -c 50

# Test from local
curl -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/felicia_memories?limit=1"
# Should return JSON array, not 401 error
```

**Fix:**
1. Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correct
2. Check Supabase project is running (not suspended)
3. Verify service role key has `all` permissions (in Supabase UI)

---

### Issue: "Migrations failed"
**Check:**
```sql
-- From Supabase SQL Editor
SELECT * FROM information_schema.tables 
WHERE table_name LIKE 'felicia%' 
ORDER BY table_name;
-- Should show all felicia_* tables
```

**Fix:**
1. Check migration order (see SUPABASE_DEPLOYMENT_GUIDE.md)
2. Re-run migrations that failed
3. Check for permission errors in Supabase audit logs

---

### Issue: "Actions retrying infinitely"
**Check:**
```javascript
// Verify error classification in logs
const error = new Error("...");
console.log(isRetryableError(error)); // Should be false for validation errors
```

**Fix:**
1. Check error message against retry patterns in `error-classifier.js`
2. Add new error patterns if needed
3. Set `ENABLE_RETRY_LOGIC=false` to disable retries temporarily

---

### Issue: "Pending confirmations not clearing"
**Check:**
```sql
SELECT * FROM felicia_pending_confirmations 
WHERE cleared = false AND expires_at < now();
-- Should be auto-cleared, but let's check if stuck
```

**Fix:**
1. Manually clear: `UPDATE felicia_pending_confirmations SET cleared = true WHERE id = ?;`
2. Check orchestrator logs for "intent drift" detection
3. Verify `getPendingConfirmationForUser` is being called

---

## Rollback Plan

### If Migrations Fail
```bash
# Option 1: Rollback individual migration
# (if you have backup)
ROLLBACK TRANSACTION;

# Option 2: Delete tables and reapply
DROP TABLE IF EXISTS felicia_action_steps;
DROP TABLE IF EXISTS felicia_pending_confirmations;
DROP TABLE IF EXISTS felicia_action_logs;
DROP TABLE IF EXISTS felicia_action_executions;

# Then reapply migrations in order
```

### If Production Deployment Breaks
```bash
# Redeploy previous version from Vercel
vercel rollback

# Or manually revert code
git revert HEAD
git push
vercel deploy --prod
```

---

## Next Steps

1. **Copy .env.example → .env.local**
2. **Fill in your Supabase credentials**
3. **Fill in your Gemini API key**
4. **Run migrations (see SUPABASE_DEPLOYMENT_GUIDE.md)**
5. **Run `npm run dev` and test locally**
6. **Deploy to staging, then production**

---

**Last Updated:** 2026-04-30  
**Version:** 1.0  
**Maintainer:** Felicia Team

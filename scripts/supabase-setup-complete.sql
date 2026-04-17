-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Felicia — Complete Supabase Setup untuk Case Management
-- JALANKAN SEMUA COMMANDS INI DI SUPABASE SQL EDITOR
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ════════════════════════════════════════════════════════════════
-- STEP 1: Create trigger function untuk auto-update updated_at
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger jika sudah ada (idempotent)
DROP TRIGGER IF EXISTS update_felicia_cases_timestamp ON felicia_cases;

-- Create trigger untuk felicia_cases
CREATE TRIGGER update_felicia_cases_timestamp
BEFORE UPDATE ON felicia_cases
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Verify trigger created
SELECT 'Step 1 ✅: Trigger for felicia_cases created' AS status;

-- ════════════════════════════════════════════════════════════════
-- STEP 2: Create felicia_case_links table untuk explicit relationships
-- ════════════════════════════════════════════════════════════════

-- Create ENUM type untuk link_type
DO $$ BEGIN
    CREATE TYPE link_type_enum AS ENUM ('related_to', 'parent_of', 'child_of', 'duplicate_of');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS felicia_case_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_a_id UUID NOT NULL REFERENCES felicia_cases(id) ON DELETE CASCADE,
  case_b_id UUID NOT NULL REFERENCES felicia_cases(id) ON DELETE CASCADE,
  link_type link_type_enum NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT DEFAULT 'system',
  CONSTRAINT no_self_link CHECK (case_a_id != case_b_id),
  CONSTRAINT no_duplicate_links UNIQUE (case_a_id, case_b_id, link_type)
);

-- Create indexes untuk felicia_case_links
CREATE INDEX IF NOT EXISTS idx_case_links_case_a ON felicia_case_links(case_a_id);
CREATE INDEX IF NOT EXISTS idx_case_links_case_b ON felicia_case_links(case_b_id);
CREATE INDEX IF NOT EXISTS idx_case_links_type ON felicia_case_links(link_type);

-- Verify table created
SELECT 'Step 2 ✅: felicia_case_links table created' AS status;

-- ════════════════════════════════════════════════════════════════
-- STEP 3: Create performance indexes untuk felicia_cases
-- ════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_cases_status ON felicia_cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_category ON felicia_cases(category);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON felicia_cases(created_at);
CREATE INDEX IF NOT EXISTS idx_cases_updated_at ON felicia_cases(updated_at);

-- For entities JSONB search (if using PostgreSQL full-text search)
CREATE INDEX IF NOT EXISTS idx_cases_entities_gin ON felicia_cases USING gin(entities);

-- Verify indexes created
SELECT 'Step 3 ✅: Performance indexes created' AS status;

-- ════════════════════════════════════════════════════════════════
-- STEP 4: Create view untuk case statistics
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW case_stats AS
SELECT 
  category,
  status,
  COUNT(*) as total_cases,
  COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
  COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count,
  COUNT(CASE WHEN status = 'deleted' THEN 1 END) as deleted_count,
  MAX(updated_at) as last_update,
  ROUND(AVG(jsonb_array_length(details))::numeric, 2) as avg_details_per_case
FROM felicia_cases
WHERE status != 'deleted'
GROUP BY category, status
ORDER BY category, status;

-- Verify view created
SELECT 'Step 4 ✅: case_stats view created' AS status;

-- ════════════════════════════════════════════════════════════════
-- STEP 5: Verify all changes
-- ════════════════════════════════════════════════════════════════

-- Check tables exist
SELECT 
  'Tables Status' as check_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='felicia_cases') as felicia_cases_exists,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='felicia_case_links') as felicia_case_links_exists;

-- Check triggers exist
SELECT 'Triggers Status' as check_name,
  COUNT(*) as trigger_count
FROM information_schema.triggers
WHERE trigger_name = 'update_felicia_cases_timestamp';

-- Check indexes exist
SELECT 'Indexes Status' as check_name,
  COUNT(*) as index_count
FROM pg_indexes
WHERE tablename IN ('felicia_cases', 'felicia_case_links');

-- Check views exist
SELECT 'Views Status' as check_name,
  EXISTS (SELECT 1 FROM information_schema.views WHERE table_name='case_stats') as case_stats_exists;

-- ════════════════════════════════════════════════════════════════
-- FINAL VERIFICATION
-- ════════════════════════════════════════════════════════════════

SELECT '
✅ SETUP COMPLETE!

Tables:
  ✅ felicia_cases (existing)
  ✅ felicia_case_links (new)

Triggers:
  ✅ update_felicia_cases_timestamp

Indexes:
  ✅ felicia_cases (status, category, created_at, updated_at, entities)
  ✅ felicia_case_links (case_a_id, case_b_id, link_type)

Views:
  ✅ case_stats (for analytics)

Ready untuk production! 🚀
' as SETUP_STATUS;

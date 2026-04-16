-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Felicia — Case Management Trigger Setup
-- Jalankan di Supabase SQL Editor
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. Create function untuk auto-update updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop trigger jika sudah ada (untuk idempotent)
DROP TRIGGER IF EXISTS update_felicia_cases_timestamp ON felicia_cases;

-- 3. Create trigger untuk felicia_cases
CREATE TRIGGER update_felicia_cases_timestamp
BEFORE UPDATE ON felicia_cases
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();

-- Done: Trigger berhasil di-setup
SELECT 'Trigger setup complete for felicia_cases' AS status;

# 🗄️ SUPABASE SETUP INSTRUCTIONS

## Langkah-langkah:

### 1. **Buka Supabase Project**
   - Go to: https://app.supabase.com
   - Select project "felicia"
   - Click "SQL Editor" di sidebar kiri

### 2. **Create New Query**
   - Click "New Query" button
   - A blank SQL editor akan muncul

### 3. **Copy-Paste Setup Script**
   - Buka file: `scripts/supabase-setup-complete.sql`
   - Copy SEMUA isi file
   - Paste ke Supabase SQL Editor

### 4. **Execute**
   - Click "Run" button (atau Ctrl+Enter)
   - Wait untuk query selesai (30 detik)
   - Harus ada output: ✅ SETUP COMPLETE!

### 5. **Verify**
   - Check output untuk confirm:
     - Tables: felicia_cases ✅, felicia_case_links ✅
     - Triggers: update_felicia_cases_timestamp ✅
     - Indexes: 5+ created ✅
     - Views: case_stats ✅

---

## Apa yang dilakukan script ini:

✅ **STEP 1: Trigger untuk auto-update**
  - Setiap kali case di-update, `updated_at` otomatis set ke NOW()
  - Jadi tidak perlu manual update timestamp di code

✅ **STEP 2: Case Links Table**
  - Tabel untuk eksplisit link antar cases
  - Support: related_to, parent_of, child_of, duplicate_of
  - Foreign keys: tidak boleh delete case kalau ada link

✅ **STEP 3: Performance Indexes**
  - Index di status, category, created_at, updated_at
  - Index di entities (JSONB) untuk search
  - Query jadi lebih cepat 10-100x

✅ **STEP 4: Analytics View**
  - View untuk case statistics
  - Count by category, status
  - Average details, last update
  - Siap untuk dashboard analytics

✅ **STEP 5: Verification**
  - Auto-check semua tables, triggers, indexes
  - Output status confirm semuanya OK

---

## ⚠️ PENTING:

- Script ini IDEMPOTENT (aman dijalankan berkali-kali)
- Tidak akan delete existing data
- Jika ada table/trigger sudah ada, script akan skip atau replace (aman)

---

## Setelah Execute:

1. ✅ Backend code akan bisa pakai:
   - Case relationship tracking
   - Auto-timestamp updates
   - Better query performance

2. ✅ Frontend bisa pakai:
   - Case linking UI (Phase 4)
   - Analytics dashboard (Phase 5)
   - Case suggestions lebih cepat

---

## Troubleshooting:

**Q: Ada error "already exists"?**
A: Normal, script handle ini. Continue saja.

**Q: Query timeout?**
A: Rare, coba jalankan ulang.

**Q: Table tidak muncul di Data Editor?**
A: Refresh page. Atau buka Supabase di tab baru.

---

## Done! ✅

Setelah selesai, comeback ke development. Next: Phase 4 atau Phase 5? 🚀

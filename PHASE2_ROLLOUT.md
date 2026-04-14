# Phase 2 Rollout Plan (Safe Mode)

Tujuan: mengaktifkan memory schema enterprise **tanpa ganggu service aktif**.

## 1) Pre-check (wajib)

- Backup tabel `felicia_memories`.
- Pastikan environment `SUPABASE_SERVICE_ROLE_KEY` aktif.
- Pastikan deploy saat traffic rendah.

## 2) Deploy sequence (min risiko)

1. Jalankan SQL migration `supabase/migrations/20260412_phase2_memory.sql`.
2. Verifikasi kolom baru muncul di `felicia_memories`.
3. Deploy kode backend terbaru (`api/_lib/supabase.js`, `api/chat.js`, `api/_lib/context.js`).
4. Lakukan smoke test chat normal + memory save + memory repeat.

Kenapa urutan ini aman:
- Kode baru punya fallback ke schema lama.
- Migration additive, tidak drop/rename kolom lama.

## 3) Validasi pasca deploy

Cek cepat di Supabase:
- Insert memory baru menghasilkan kolom:
  - `topic_key`
  - `memory_type`
  - `source`
  - `version`
- Memory lama tetap bisa dibaca.
- Prompt Gemini tetap natural (tanpa tag STATE/DELTA mentah).

## 4) Rollback plan

Jika ada issue:
- Rollback ke deployment sebelumnya (kode lama).
- Kolom baru dibiarkan tetap ada (aman, karena additive).
- Investigasi log `saveMemory` dan `getRecentMemories`.

## 5) Saran untuk sistem (developer)

- Jangan bypass `decideMemorySave()`.
- Tetapkan limit memory context (tetap 20 terbaru) untuk jaga token prompt.
- Tambah alert sederhana jika error `saveMemory` > threshold.
- Jadwalkan cleanup `felicia_memory_repeats` (mis. hapus data > 30 hari).

## 6) Saran untuk user (Adit)

Agar memory akurat dan gak bias, pakai format singkat:
- Simpan baru: `ingat ya: <fakta inti>`
- Update: `update memory: <perubahan dari sebelumnya>`
- Koreksi: `koreksi memory: <versi yang benar>`

Contoh bagus:
- `ingat ya: target income April 10 juta`
- `update memory: target income April naik jadi 12 juta`
- `koreksi memory: bukan 12 juta, final 11 juta`

Kalimat makin jelas = analisis Felicia makin tepat.

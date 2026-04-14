# Felicia Memory Architecture

Dokumen ini jadi aturan main supaya memory Felicia tetap **jelas, terstruktur, dan scalable**.

## 1) Tujuan

Memory layer harus bisa:
- Menyimpan konteks personal Adit untuk kualitas jawaban yang konsisten.
- Membedakan **kondisi terbaru** vs **perubahan/progres**.
- Menekan duplikasi info agar prompt tidak bising.
- Tetap ringan untuk serverless Vercel.

## 2) Desain Saat Ini (v1 - tanpa migrasi schema)

Storage: tabel `felicia_memories` (kolom existing: `category`, `content`, `created_at`).

Strategi hybrid di `api/chat.js`:
- `STATE[topic_key] ...` = kondisi utama terbaru.
- `DELTA[topic_key] ...` = perubahan dari kondisi sebelumnya.

Contoh:
- `STATE[goal_income] target income bulan ini 10 juta`
- `DELTA[goal_income] sekarang target naik jadi 12 juta`

Flow singkat:
1. User kirim pesan
2. Detect intent memory (`ingat/catat/...`) atau `save_memory` action
3. Cek duplikasi
4. Klasifikasikan `state` atau `delta`
5. Simpan ke `felicia_memories`

## 3) Guardrail (wajib)

- Semua write memory harus lewat satu pintu: `decideMemorySave()`.
- Duplikat tidak disimpan ulang.
- Perubahan penting disimpan sebagai `DELTA`, bukan overwrite buta.
- Action berisiko (mis. delete massal) wajib konfirmasi eksplisit.
- Feature baru wajib declare:
  - masuk layer mana (`api`, `lib`, `storage`, `prompt`)
  - dampak ke memory apa
  - rollback plan minimal

## 4) Kelebihan v1

- Tidak perlu migrasi DB (aman, cepat, low-risk).
- Jejak perkembangan tetap ada (`DELTA`).
- Noise memory berkurang (dedup).
- Cocok untuk iterasi cepat.

## 5) Kekurangan & Batasan v1 (detail)

### A. Belum ada schema enterprise

Kondisi sekarang:
- Metadata memory (`topic_key`, `memory_type`, `source`, `version`) masih ditanam di string `content`.
- Query analitik jadi terbatas karena DB tidak punya kolom terstruktur.

Dampak:
- Sulit filter cepat via SQL, contoh:
  - "ambil semua DELTA untuk topic goal_income"
  - "bandingkan state terbaru per topic"
- Sulit bikin dashboard progress otomatis yang presisi.

Risiko jangka panjang:
- Saat data sudah besar, parsing string di app layer jadi lebih mahal dan rawan edge-case.

Mitigasi saat ini:
- Prefix standar: `STATE[...]` / `DELTA[...]`.
- Topic key konsisten untuk memudahkan parsing.

Arah upgrade (v2):
- Tambah kolom nyata di `felicia_memories`:
  - `topic_key TEXT`
  - `memory_type TEXT CHECK (memory_type IN ('state','delta'))`
  - `source TEXT` (chat/manual/import/api)
  - `version INT`
  - `supersedes_id UUID NULL`
- Tambah index: `(topic_key, created_at DESC)`.

### B. Topic key masih heuristik keyword

Kondisi sekarang:
- `topic_key` ditentukan dari regex keyword (mis. `cepot`, `income`, `mindset`, dll).
- Jika kalimat ambigu, key bisa salah klasifikasi.

Contoh masalah:
- "income naik tapi mental turun" bisa masuk `income` padahal inti kalimat mungkin `mindset`.
- Bahasa campur/slang baru bisa lolos dari regex.

Dampak:
- Agregasi progress per topik bisa kurang akurat.
- Ringkasan perkembangan berpotensi bias topik.

Mitigasi saat ini:
- Fallback key berdasarkan 1-2 token bermakna.
- Tetap simpan konten asli (tidak hilang data mentah).

Arah upgrade (v2/v3):
- Tambah lightweight classifier (rule + confidence score).
- Jika confidence rendah, simpan ke `topic_key='general_uncertain'`.
- Opsi human-in-the-loop: Felicia minta konfirmasi topik untuk pesan ambigu.

### C. Tracker pengulangan in-memory per instance

Kondisi sekarang:
- Counter repeat disimpan di `Map` di memory runtime Node.
- Di serverless, instance bisa ganti kapan saja (cold start / scale out).

Dampak:
- Counter tidak global:
  - Request A di instance-1, request B di instance-2 => riwayat repeat bisa tidak nyambung.
- Tone "complain halus" level 2/3 mungkin tidak konsisten antar request.

Kenapa tetap dipakai dulu:
- Murah, cepat, zero migration, zero external dependency.

Arah upgrade (v2):
- Pindah repeat counter ke store terpusat:
  - Redis / Upstash (TTL)
  - atau tabel Supabase khusus `felicia_memory_repeats`
- Key contoh: `(user_id, normalized_topic_hash)` + `count` + `last_seen_at`.

## 6) Prinsip supaya project tidak liar

Setiap fitur baru harus lolos checklist ini:
- **Scope jelas:** fitur ini menyelesaikan masalah apa?
- **Owner layer jelas:** logic ditempatkan di file/layer yang tepat.
- **Kontrak data jelas:** input/output serta format error ditetapkan.
- **Observability jelas:** log minimal untuk audit.
- **Rollback jelas:** cara mematikan fitur jika error.

## 7) Roadmap Bertahap (disarankan)

### Phase 1 (sudah jalan)
- Hybrid memory (`STATE/DELTA`) via content tag
- Dedup memory
- Repeat feedback bertingkat

### Phase 2 (stabilitas)
- Migrate schema enterprise
- Repeat tracker global
- Topic confidence + uncertain bucket
- Transcript-to-seed converter untuk import konteks lama dari ChatGPT/Claude

## 7.1) Seed v2 (structured personal history)

`Seed v2` berarti memory Felicia tidak hanya diisi dari template dasar, tapi juga dari:
- riwayat percakapan nyata,
- progres user dari waktu ke waktu,
- konteks proyek, visi, pola hidup, dan perubahan penting.

Flow v2:
1. User paste transcript mentah ChatGPT/Claude/web notes
2. Endpoint `api/convert-transcript` ubah transcript menjadi JSON memory seed (`STATE` + `DELTA`)
3. User review JSON hasil convert
4. JSON dikirim ke `api/import-memory`
5. Memory masuk ke Supabase dan dipakai di prompt Felicia

Nilai tambah v2:
- Konteks lebih personal dan historis
- Analisis lebih konsisten lintas waktu
- Mengurangi kebutuhan user mengulang cerita lama

Tradeoff v2:
- Proses convert lebih berat daripada chat biasa
- Hasil extract tetap perlu direview sebelum import
- Transcript mentah bisa mengandung noise atau kontradiksi

### Phase 3 (analitik)
- Weekly memory progression summary
- Trend by topic (mindset, income, learning, health)
- Alert saat terjadi regresi konsisten

## 8) Batas operasional sederhana

- Load memory ke prompt: max 20 item terbaru.
- Simpan `DELTA` hanya jika ada sinyal perubahan nyata.
- Jangan simpan data sensitif mentah (password/token/API key).
- Untuk perubahan besar, prefer format user:
  - `update memory: <isi perubahan>`

---

Dokumen ini living document. Jika arsitektur berubah, update bagian:
1) Flow
2) Guardrail
3) Batasan
4) Roadmap

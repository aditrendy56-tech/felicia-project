# Felicia v2 — Ringkasan Perubahan

## Tujuan Awal
Dari awal, tujuan kita adalah bikin arsitektur Felicia jadi lebih rapi, gampang dirawat, dan gampang dikembangkan.

Masalah utama yang mau diberesin:
- `api/chat.js` terlalu besar dan campur semua hal
- logic chat, memory, action, routing, dan AI semua numpuk di satu tempat
- susah dibaca, susah debug, susah nambah fitur

## Arah Besar
Arah yang kita pilih adalah:

- `chat.js` jadi pintu masuk tipis saja
- semua alur chat dikendalikan oleh `chat-orchestrator.js`
- AI cuma buat jawab dan baca intent
- action dijalankan di layer action
- memory, case, mode, dan context dipisah ke layer masing-masing

Singkatnya:
**handler → orchestrator → services/actions → response**

## Yang Sudah Dilakukan

### 1. `api/chat.js` dipangkas
Sekarang `api/chat.js` cuma:
- ambil `message`, `threadId`, `chatType`, `userId`
- panggil `orchestrateChat()`
- balikin hasilnya sebagai JSON

Jadi file ini sekarang jauh lebih bersih.

### 2. Struktur folder baru dibuat
Kita mulai bikin struktur baru seperti ini:
- `api/_lib/orchestrator/`
- `api/_lib/core/`
- `api/_lib/actions/`
- `api/_lib/utils/`

Tujuannya biar tiap bagian punya tugas masing-masing.

### 3. `buildSystemPrompt` dipindah
Fungsi `buildSystemPrompt` sudah dipisah ke `api/_lib/core/prompt-builder.js`.

Kenapa ini penting:
- prompt lebih gampang dikelola
- logic prompt tidak nempel di file besar
- AI layer jadi lebih jelas

### 4. Parser respon Gemini dipisah
Logic parsing respon Gemini dipindah ke `api/_lib/core/intent-classifier.js`.

Fungsi ini bertugas baca hasil Gemini lalu ubah jadi bentuk terstruktur:
- `type`
- `action`
- `params`
- `reply`

### 5. Reply cepat dan route simpel dipisah
Fungsi seperti:
- `buildInstantReply()`
- `tryDeterministicRoute()`

sudah dipindah ke file util sendiri.

### 6. `chat-orchestrator.js` dibuat sebagai otak koordinasi
Orchestrator sekarang jadi pengatur alur utama:
- cek instant reply
- cek deterministic route
- bikin system prompt
- panggil Gemini
- parse response
- jalankan action kalau perlu
- return hasil akhir

## Perbedaan Lama vs Baru

### Sebelum
- semua logic numpuk di `api/chat.js`
- satu file ngurus banyak hal
- susah di-maintain
- susah nambah fitur

### Sesudah
- `api/chat.js` cuma pintu masuk
- flow chat dipusatkan di orchestrator
- AI, action, prompt, parser dipisah
- struktur lebih bersih dan lebih gampang dibaca

## Urutan Kerja Baru
Urutan yang sekarang dipakai kira-kira seperti ini:

1. User kirim pesan
2. `api/chat.js` terima request
3. `orchestrateChat()` dipanggil
4. cek instant reply
5. cek deterministic route
6. bikin system prompt
7. panggil Gemini
8. parse hasil Gemini
9. kalau action → jalankan action
10. balikkan hasil ke user

## Prioritas yang Dipakai
Prioritas refactor kita dari awal adalah:

### Prioritas 1 — Stabil
Jangan ubah perilaku lebih dari yang perlu.

### Prioritas 2 — Pisah tanggung jawab
Logic besar dipisah ke file yang tepat.

### Prioritas 3 — Baru rapikan bertahap
Setelah struktur dasar aman, baru lanjut beresin layer lain satu per satu.

## Catatan Penting Saat Ini
Ada beberapa bagian yang masih perlu diselesaikan:

- `actions/index.js` masih stub / belum isi penuh
- `chat-orchestrator.js` masih punya helper lokal
- beberapa behavior lama di `api/chat.js` sudah pindah atau belum ikut dipertahankan

Jadi saat ini hasilnya sudah jauh lebih rapi, tapi belum final 100%.

## Inti Mudahnya
Kalau diringkas banget:

- **Dulu:** satu file besar urus semuanya
- **Sekarang:** tugas dipisah per file
- **Tujuan:** lebih gampang dirawat, dibaca, dan dikembangkan

Kalau kamu mau, file ini bisa jadi pegangan buat lanjut refactor step berikutnya.

# Felicia Web Dashboard

Dashboard web untuk Felicia (Personal AI Assistant) dengan frontend React + Vite dan backend API di `api/`.

> Mulai baca dari `MASTER_ARCHITECTURE.md` untuk arah arsitektur paling aktual.

## Status Cepat

- `Chat` → live dan terhubung ke backend.
- `Today` → live untuk jadwal, quota, dan quick ask.
- `Memory` → live untuk profil canonical.
- `Goals` → masih local state / placeholder.
- `Keuangan` → masih local state / placeholder.
- `Time` → masih placeholder UI.

Untuk penjelasan lengkap, lihat `MASTER_ARCHITECTURE.md`.

## Data Live vs Data Placeholder

### Data Live (terhubung backend)

- `Chat` (`/chat`) → `POST /api/chat`
- `Profil permanen` → `GET/POST /api/profile`
- `Today` (`/today`) → jadwal, quick ask, quota, dan mode
- `Memory` (`/memory`) → profil canonical dari backend

### Data Placeholder / Local Only

- `Goals` (`/goals`) → local state dulu
- `Keuangan` (`/finance`) → local state dulu
- `Time` (`/time`) → placeholder UI
- Beberapa panel di `Settings` masih informatif / placeholder

## Identitas Permanen (Anti Ngaco)

- Profil resmi (`nama`, `alias`, `gender`, `domisili`) diedit dari menu `Settings` panel **Profil Permanen User**.
- Chat biasa tidak otomatis mengubah identitas permanen.
- Jika ada prompt ngawur seperti "nama aku Ilham", sistem guard akan menganggap itu bukan update permanen.
- Tujuannya: identitas inti tetap konsisten walaupun ada teks random di chat.

## Cara Pakai Semua Fitur

### 1) Hari Ini (`/today`)

- Lihat ringkasan jadwal harian.
- Pakai tombol quick action (Status/Focus/Drop/Tipe Hari).
- Tulis pertanyaan di "Tanya Felicia" lalu klik `Kirim`.

### 2) Chat (`/chat`)

- Pilih mode: `Utama`, `Refleksi`, `Strategi`.
- Klik `Thread Baru` untuk mulai percakapan.
- Pilih thread di kiri untuk lanjut chat lama.
- Ketik pesan lalu Enter untuk kirim.
- Hapus thread via tombol `✕` di item thread.

### 3) Goals (`/goals`)

- Tambah goal sementara masih disimpan di state halaman.
- Detail dan persistence backend akan menyusul di roadmap.

### 4) Waktu (`/time`)

- Menampilkan timeline dan placeholder block fokus.
- Belum tersambung ke penyimpanan backend.

### 5) Keuangan (`/finance`)

- Menampilkan saldo, pemasukan, pengeluaran, dan transaksi terakhir.
- Data saat ini masih local state di halaman.

### 6) Memory (`/memory`)

- Menampilkan profil canonical.
- Timeline memory akan dikembangkan lebih jauh di roadmap.

### 7) Settings (`/settings`)

- Lihat status quota AI dan integrasi.
- Edit profil permanen user (nama/alias/gender/domisili) lewat form khusus.
- Sebagian panel bersifat informatif/placeholder.

## Dokumen Utama

- `MASTER_ARCHITECTURE.md` → pusat arsitektur dan arah kerja
- `IMPLEMENTATION_ROADMAP.md` → urutan implementasi
- `ARCHITECTURE.md` → detail arsitektur lama / legacy reference

## Menjalankan Project

```powershell
cd "c:\Users\User\Videos\felicia project"
npm install
npm run dev
```

Opsional jika mau pakai backend lokal (bukan API Vercel), set env berikut sebelum `npm run dev`:

```powershell
$env:VITE_API_PROXY_TARGET="http://localhost:3000"
npm run dev
```

Build produksi:

```powershell
cd "c:\Users\User\Videos\felicia project"
npm run build
```

Deploy Vercel:

```powershell
cd "c:\Users\User\Videos\felicia project"
npx vercel --prod
```

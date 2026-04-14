# Felicia Web Dashboard

Dashboard web untuk Felicia (Personal AI Assistant) dengan frontend React + Vite dan backend API di `api/`.

## Ubah Data yang Salah (Paling Cepat)

Semua data demo/statik sekarang dipusatkan di:

- `src/config/demoData.js`

Yang bisa kamu edit langsung:

- `demoProfile` → data profil di halaman `Memory`
- `demoMemories` → daftar memory di halaman `Memory`
- `demoGoals` → daftar goal di halaman `Goals`
- `demoTransactions` → data transaksi di halaman `Keuangan`

> Setelah edit file, jalankan ulang dev server atau refresh browser.

## Data Live vs Data Demo

### Data Live (terhubung backend)

- `Chat` (`/chat`) → pakai endpoint `POST /api/chat`
- `Profil permanen` → `GET/POST /api/profile` (tersimpan ke `felicia_memories` kategori `identity`)
- `Today` (`/today`) bagian:
  - jadwal (query ke AI melalui `/api/chat`)
  - quick ask
  - quota status (`/api/quota-eta`)

### Data Demo (sementara hardcoded)

- `Memory` (`/memory`) bagian timeline memory demo → dari `src/config/demoData.js`
- `Goals` (`/goals`) → dari `src/config/demoData.js`
- `Keuangan` (`/finance`) → dari `src/config/demoData.js`
- Beberapa kartu di `Time` dan `Settings` masih placeholder UI

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

- Klik kartu goal di kiri untuk lihat detail milestones di kanan.
- Data saat ini demo; edit di `src/config/demoData.js` bagian `demoGoals`.

### 4) Waktu (`/time`)

- Menampilkan timeline dan placeholder block fokus.
- Belum tersambung ke penyimpanan backend.

### 5) Keuangan (`/finance`)

- Menampilkan saldo, pemasukan, pengeluaran, dan transaksi terakhir.
- Data saat ini demo; edit di `src/config/demoData.js` bagian `demoTransactions`.

### 6) Memory (`/memory`)

- Menampilkan profil dan memory timeline.
- Data saat ini demo; edit di `src/config/demoData.js` bagian `demoProfile` dan `demoMemories`.

### 7) Settings (`/settings`)

- Lihat status quota AI dan integrasi.
- Edit profil permanen user (nama/alias/gender/domisili) lewat form khusus.
- Sebagian panel bersifat informatif/placeholder.

## Menjalankan Project

```powershell
cd "c:\Users\User\Videos\felicia project"
npm install
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

# Quiz Materi AI

Aplikasi kuis berbasis Express, EJS, MongoDB, dan OpenAI untuk membuat 100 soal pilihan ganda dari materi PDF. Admin mengunggah materi, user mengerjakan 10 soal acak dengan timer, lalu hasil tersimpan sebagai riwayat dan laporan.

## Prasyarat

- Node.js 20 atau lebih baru
- MongoDB lokal atau Atlas
- OpenAI API key

## Setup

1. Install dependency:

   ```bash
   npm install
   ```

2. Buat file `.env` dari contoh:

   ```bash
   cp .env.example .env
   ```

3. Isi `.env`:

   ```bash
   PORT=3000
   MONGODB_URI=mongodb://127.0.0.1:27017/tugas_api
   SESSION_SECRET=change-this-to-a-long-random-secret
   OPENAI_API_KEY=sk-...
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=admin123
   ```

   Jangan pernah commit `.env` atau secret lain ke repository.

4. Seed akun admin:

   ```bash
   npm run seed:admin
   ```

5. Jalankan mode development:

   ```bash
   npm run dev
   ```

   Buka `http://localhost:3000/login`.

## Demo Flow

1. Login sebagai admin dengan `ADMIN_USERNAME` dan `ADMIN_PASSWORD`.
2. Buka `Materi admin`, lalu upload PDF dari menu `Upload`.
3. Tunggu proses AI membuat 100 soal sampai materi siap.
4. Register akun user, login, lalu buka `Materi`.
5. Mulai kuis: user mendapat 10 soal acak, timer 10 menit, skor `+10` untuk benar dan `-5` untuk salah/kosong.
6. Submit kuis, lihat score hero, lalu buka `Riwayat saya`.
7. Kerjakan ulang materi yang sama untuk membuat attempt kedua.
8. Login admin dan buka `Laporan` untuk melihat semua attempt.

## Testing

```bash
npm test
```

## Catatan Keamanan

- `.env` berisi secret dan tidak boleh dicommit.
- Pakai `SESSION_SECRET` yang panjang dan unik di environment non-lokal.
- Batasi akses route `/admin/*` hanya untuk akun admin.

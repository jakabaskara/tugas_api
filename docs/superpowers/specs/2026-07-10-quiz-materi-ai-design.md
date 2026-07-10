# Design: Quiz Materi AI (Node.js + MongoDB + OpenAI)

**Date:** 2026-07-10  
**Repo:** https://github.com/jakabaskara/tugas_api  
**Status:** Approved for implementation planning

## Goal

Aplikasi kuis berbasis materi: admin mengunggah PDF, AI menghasilkan 100 soal pilihan ganda, user memilih materi dan mengerjakan 10 soal acak dengan timer dan skor. Simple, on point, tampilan menarik, stack Node.js.

## Requirements (locked)

| Item | Keputusan |
|------|-----------|
| Stack UI | Express + EJS + CSS custom |
| Generate soal | Sinkron saat upload (monolith) |
| Bentuk soal | Pilihan ganda 4 opsi (A–D) |
| Bank soal | 100 soal per materi (AI) |
| Kuis | 10 soal acak dari bank |
| Skor | Benar +10, salah −5 (kosong = salah) |
| Timer | 10 menit total; habis → auto-submit |
| Ulang | Boleh berkali-kali; simpan semua attempt |
| Laporan | User: skor sendiri; Admin: semua user × materi |
| Auth | Session + bcrypt; role `admin` \| `user` |
| Secret | `OPENAI_API_KEY` & Mongo URI di `.env` (jangan hardcode) |

## Architecture

Satu proses Node.js (Express) berbicara ke MongoDB dan OpenAI API.

```
Browser (EJS)
    │
    ▼
Express
  ├── Auth (express-session, bcrypt)
  ├── Admin: upload PDF → extract → OpenAI → 100 questions
  ├── User: pilih materi → 10 random → timer → score
  └── Reports: own attempts / all attempts
    │
    ▼
MongoDB + local uploads/ + OpenAI
```

- PDF disimpan di `uploads/`, teks diekstrak dengan `pdf-parse`.
- Admin awal di-seed sekali (script atau env: `ADMIN_USERNAME` / `ADMIN_PASSWORD`).
- Tidak ada worker terpisah, queue, atau frontend SPA.

## Data model

### `users`
- `username` (unique), `passwordHash`, `role` (`admin` | `user`), `createdAt`

### `materials`
- `title`, `filename`, `uploadedBy` (ObjectId → users), `status` (`ready` | `failed`), `createdAt`
- Hanya materi `ready` yang muncul di daftar kuis user.

### `questions`
- `materialId`, `text`, `options` `{ A, B, C, D }`, `correctAnswer` (`A`|`B`|`C`|`D`)
- Satu materi punya tepat 100 dokumen soal setelah generate sukses.

### `attempts`
- `userId`, `materialId`
- `questionIds` (array 10 ObjectId, urutan tampilan)
- `answers` (array: pilihan user atau `null`; kosong sampai submit)
- `score` (number | null — `null` = kuis masih berjalan; setelah submit boleh negatif, max 100)
- `correctCount`, `wrongCount` (0 sampai submit selesai)
- `status` (`in_progress` | `submitted`)
- `timedOut` (boolean)
- `startedAt`, `submittedAt`, `durationSec`

## Pages & routes

### Public / auth
- `GET/POST /register` — role default `user`
- `GET/POST /login`
- `POST /logout`

### User
- `GET /` atau `GET /materials` — daftar materi `ready`
- `POST /quiz/:materialId/start` — ambil 10 soal acak, buat session kuis sementara
- `GET /quiz/:attemptId` — kerjakan soal + timer
- `POST /quiz/:attemptId/submit` — hitung skor, simpan attempt
- `GET /quiz/:attemptId/result` — tampilan skor
- `GET /reports/me` — riwayat attempt sendiri

### Admin
- `GET /admin/materials` — daftar materi + jumlah soal
- `GET/POST /admin/materials/upload` — judul + PDF; proses generate sinkron
- `GET /admin/reports` — semua attempt; filter opsional `user` / `material`

Middleware: `requireAuth`, `requireAdmin`.

## Core flows

### Admin upload → 100 soal
1. Validasi file PDF + judul.
2. Simpan file ke `uploads/`.
3. Ekstrak teks; jika terlalu panjang, potong ke batas token/karakter aman (tetap representatif).
4. Panggil OpenAI dengan prompt ketat: hasilkan **100** soal PG berbasis materi, response JSON array.
5. Validasi tiap item (`text`, 4 opsi, `correctAnswer` valid). Jika < 100 valid: retry sekali; jika masih gagal → simpan material `status: failed` (tanpa soal), tampilkan error, jangan tampilkan ke daftar kuis user.
6. Insert 100 questions, set material `ready`, redirect sukses.

### User kuis
1. User pilih materi `ready`.
2. Server: `$sample` 10 questions; **langsung buat** dokumen `attempts` dengan `status: in_progress`, `questionIds`, `score: null`, `startedAt: now`.
3. Kirim ke client **tanpa** `correctAnswer`.
4. Timer 10:00 di client (dari `startedAt`); pada 0 → submit form otomatis.
5. `POST` submit: tolak jika bukan milik user atau sudah `submitted`. Hitung skor dari kunci di DB; jika elapsed > 10 menit set `timedOut: true` (jawaban tetap diterima).
6. Update attempt: `status: submitted`, skor, counts, `submittedAt`; tampilkan hasil.

### Laporan
- User: query `attempts` by `userId`, join judul materi.
- Admin: query semua + filter; tampilkan username, materi, skor, tanggal.

## Scoring rules

- Benar: `+10`
- Salah atau tidak dijawab: `-5`
- Range teoritis: −50 … 100 untuk 10 soal
- Tidak ada floor di 0 (skor boleh negatif)

## Error handling

| Kasus | Perilaku |
|-------|----------|
| PDF kosong / gagal parse | Flash error; jangan buat material `ready` |
| OpenAI error / JSON invalid | Material `failed`; pesan coba upload ulang |
| < 100 soal valid setelah retry | Material `failed`; jangan partial bank |
| User akses `/admin/*` | 403 atau redirect |
| Login/register gagal | Flash di form |
| Submit attempt asing / bukan milik user | 403 |

## UI direction

- CSS custom satu tema (bukan Bootstrap default polos): tipografi jelas, aksen warna tegas, layout bersih.
- Login/register centered.
- Kuis: timer sticky; 10 soal dalam satu halaman scroll atau navigasi sederhana.
- Hasil: skor besar + ringkasan benar/salah.
- Admin/laporan: tabel rapi.

## Out of scope (YAGNI)

- Edit soal manual di UI
- Chat / Q&A bebas dengan AI
- Leaderboard publik
- Generate async / job queue
- SPA (React/Vue)
- Mobile app
- E2E otomatis / load test

## Testing

- **Unit:** fungsi skor; validasi shape soal AI.
- **Manual:** register/login; upload → 100 soal; kuis 10 acak; timer auto-submit; laporan user vs admin; isolation role.
- Tidak wajib automated E2E.

## Config / env

```
PORT=
MONGODB_URI=
SESSION_SECRET=
OPENAI_API_KEY=
ADMIN_USERNAME=
ADMIN_PASSWORD=
```

Jangan commit `.env` atau API key. Gunakan `.env.example` tanpa secret.

## Success criteria

1. Admin bisa upload PDF dan mendapat 100 soal tersimpan.
2. User login, pilih materi, dapat 10 soal acak, selesai dalam timer 10 menit.
3. Skor mengikuti +10/−5 dan tersimpan per attempt.
4. User melihat riwayat sendiri; admin melihat semua.
5. App jalan dengan Node.js + MongoDB; tampilan rapi dan bisa di-demo untuk tugas.

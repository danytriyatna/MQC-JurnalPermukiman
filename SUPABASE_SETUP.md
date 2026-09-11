# Setup Supabase — MQC Assistant

## 1. Buat/siapkan project Supabase

Kalau belum punya, buat project baru di [supabase.com](https://supabase.com) → **New Project**. Catat:

- **Project URL** — Project Settings → API → Project URL
- **anon public key** — Project Settings → API → Project API keys → `anon` `public`

## 2. Jalankan migrasi skema

1. Buka Supabase Studio → **SQL Editor**.
2. Buka file [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), salin seluruh isinya.
3. Tempel ke SQL Editor, klik **Run**.
4. Cek di **Table Editor**: harus muncul tabel `profiles`, `manuscripts`, `manuscript_versions`, `screening_runs`, `findings`.

## 3. Isi environment variable

```bash
cp .env.local.example .env.local
```

Isi `.env.local` dengan Project URL dan anon key dari langkah 1:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## 4. Buat akun staf sekretariat

Aplikasi ini tidak punya halaman self-signup (sesuai desain — hanya staf internal yang boleh punya akun). Buat akun lewat Studio:

1. Studio → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Isi email dan password.
3. Penting: buka bagian **User Metadata**, isi:
   ```json
   { "full_name": "Nama Staf" }
   ```
   Ini dipakai untuk menampilkan nama asli di header aplikasi. Kalau dilewati, sistem akan pakai bagian sebelum "@" dari email sebagai fallback.
4. Ulangi untuk setiap staf yang butuh akun.
5. Cek di **Table Editor** → tabel `profiles` — harus otomatis muncul satu baris per user yang dibuat.

## 5. Verifikasi

```bash
npm install
npm run dev
```

1. Buka `http://localhost:3000` — harus redirect ke `/login`.
2. Login pakai salah satu akun staf yang dibuat di langkah 4.
3. Harus redirect ke `/dashboard`, header menampilkan nama asli staf tersebut.
4. Klik avatar di header → coba tombol **Keluar** → harus kembali ke `/login`.
5. Coba akses `/dashboard` langsung tanpa login (mode private/incognito) → harus redirect ke `/login`.

Dashboard akan tampil **empty state** ("Belum ada naskah diunggah") karena tabel `manuscripts` masih kosong — ini normal, fitur upload naskah belum dibangun (tahap berikutnya).

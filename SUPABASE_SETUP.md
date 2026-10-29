# Setup Supabase — MQC Assistant

## 1. Buat/siapkan project Supabase

Kalau belum punya, buat project baru di [supabase.com](https://supabase.com) → **New Project**. Catat:

- **Project URL** — Project Settings → API → Project URL
- **anon public key** — Project Settings → API → Project API keys → `anon` `public`

## 2. Jalankan migrasi skema

Buka Supabase Studio → **SQL Editor**, lalu jalankan keempat migrasi **berurutan**. Untuk setiap file: salin seluruh isinya, tempel ke SQL Editor, klik **Run**.

| Urutan | File | Isi |
| --- | --- | --- |
| 1 | [`0001_init.sql`](supabase/migrations/0001_init.sql) | Tabel inti dan RLS |
| 2 | [`0002_storage.sql`](supabase/migrations/0002_storage.sql) | Bucket `manuscripts` + policy baca/unggah |
| 3 | [`0003_soft_delete.sql`](supabase/migrations/0003_soft_delete.sql) | Kolom `deleted_at` untuk hapus lunak |
| 4 | [`0004_storage_limits.sql`](supabase/migrations/0004_storage_limits.sql) | Batas 50MB per file + policy hapus milik sendiri |
| 5 | [`0005_reference_checks.sql`](supabase/migrations/0005_reference_checks.sql) | Tabel hasil verifikasi referensi |

Setelah selesai, cek:

- **Table Editor** → harus muncul tabel `profiles`, `manuscripts`, `manuscript_versions`, `screening_runs`, `findings`.
- **Storage** → harus muncul bucket `manuscripts` (private).

Migrasi 0002 dan 0004 wajib ada: naskah .docx diunggah **langsung dari browser ke Storage**, bukan lewat API, sehingga policy bucket-lah yang menentukan unggahan berhasil atau tidak.

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

Dashboard akan tampil **empty state** ("Belum ada naskah diunggah") karena tabel `manuscripts` masih kosong — ini normal.

Untuk memastikan jalur unggah lengkap berfungsi, lanjutkan:

6. Buka **Unggah Naskah**, masukkan satu file `.docx` (naskah dengan gambar, ukuran belasan MB, adalah kasus uji terbaik).
7. Harus berpindah ke halaman detail naskah berisi daftar temuan.
8. Cek **Storage** → bucket `manuscripts` → harus ada objek baru di folder bernama user id staf tersebut.

Kalau langkah 6 gagal dengan pesan soal penyimpanan, migrasi 0002/0004 belum dijalankan.

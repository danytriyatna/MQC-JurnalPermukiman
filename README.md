# MQC Assistant — Jurnal Permukiman

Alat bantu sekretariat **Jurnal Permukiman** (Direktorat Jenderal Cipta Karya, Kementerian Pekerjaan Umum) untuk memeriksa kesesuaian naskah masuk terhadap gaya selingkung jurnal, secara otomatis.

Staf mengunggah naskah `.docx`. Sistem membongkar isinya, memeriksa 20-an aturan tata letak dan penulisan, lalu menampilkan daftar temuan yang bisa langsung dikirimkan ke penulis — menggantikan pemeriksaan manual yang sebelumnya dilakukan baris per baris.

> **Ini bukan aplikasi publik.** Tidak ada halaman pendaftaran mandiri; akun staf dibuat manual lewat Supabase Studio. Basis datanya memuat naskah yang belum terbit beserta identitas penulisnya.

## Kemampuan

| Fitur | Keterangan |
|---|---|
| Penyaringan gaya selingkung | 20-an pemeriksaan otomatis: ukuran kertas, margin, font, judul, abstrak dua bahasa, urutan bab, judul tabel/gambar, jumlah dan sitasi referensi |
| Riwayat versi | Tiap revisi naskah tersimpan sebagai versi tersendiri beserta hasil penyaringannya |
| Verifikasi referensi | Memeriksa tiap entri daftar pustaka ke Crossref, OpenAlex, dan OpenLibrary, serta menguji tautan yang dicantumkan |
| Laporan | Ekspor hasil pemeriksaan ke Word, dan rekap bulanan ke CSV |
| Dasbor | Status seluruh naskah, statistik, pencarian, dan penyaringan |

## Teknologi

Next.js 16.3.1 (App Router, Turbopack) · React 19.2.8 · TypeScript · Tailwind CSS 4 · Supabase (Auth, Postgres, Storage) · di-deploy di Vercel.

Pembongkaran `.docx` dilakukan sendiri dengan `jszip` + `fast-xml-parser` — tidak ada layanan konversi pihak ketiga, sehingga naskah tidak pernah meninggalkan infrastruktur sendiri. Penyusunan laporan Word memakai paket `docx`.

## Menjalankan secara lokal

```bash
npm install
```

Lalu siapkan Supabase dan isi `.env.local` dengan mengikuti **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** — termasuk menjalankan kelima migrasi di `supabase/migrations/` secara berurutan. Tanpa itu aplikasi akan gagal saat login.

```bash
npm run dev
```

Buka http://localhost:3000, lalu masuk dengan akun staf yang dibuat pada langkah setup.

## Dokumentasi

| Dokumen | Isi |
|---|---|
| **[docs/SPESIFIKASI-TEKNIS.md](docs/SPESIFIKASI-TEKNIS.md)** | Arsitektur, peta modul, skema basis data, alur permintaan, mesin aturan, dan **daftar cacat yang sudah diketahui**. Baca ini lebih dulu sebelum mengubah kode. |
| [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | Menyiapkan proyek Supabase dari nol, migrasi, dan pembuatan akun staf |
| [AGENTS.md](AGENTS.md) | Catatan untuk asisten AI yang bekerja di repositori ini |

## Perintah

```bash
npm run dev     # server pengembangan
npm run build   # build produksi
npm run lint    # eslint
```

> `npm run lint` saat ini masih melaporkan **3 error yang sudah ada sejak sebelumnya** di `AnalyticsCharts.tsx`, `EmptyStateDashboard.tsx`, dan `AppHeader.tsx`. Keluaran yang merah ini belum bersih — lihat bagian cacat yang diketahui pada spesifikasi teknis.

## Catatan untuk pengembang baru

Repositori ini **belum punya tes otomatis**. Mesin aturan di `src/lib/docx/rules.ts` dikalibrasi dari template resmi dan naskah nyata, dan perubahan di sana dapat merusak penyaringan tanpa terdeteksi. Baca bagian "Mesin aturan" pada spesifikasi teknis sebelum menyentuhnya, dan uji perubahan terhadap naskah sungguhan.

# Spesifikasi Teknis — MQC Assistant Jurnal Permukiman

Dokumen serah terima untuk pengembang yang baru masuk ke sistem ini. Tujuannya satu: Anda bisa menjalankan, memahami, dan mengubah sistem ini tanpa perlu bertanya kepada pengembang sebelumnya.

Dibuat pada 29 Oktober 2026, sesuai keadaan kode di commit `66c4dcd`.

---

## 1. Konteks

Sekretariat Jurnal Permukiman menerima naskah dalam format Word. Sebelum masuk ke proses telaah substansi, tiap naskah harus diperiksa kesesuaiannya terhadap gaya selingkung jurnal — ukuran kertas, margin, font, struktur bab, format abstrak, penulisan judul tabel dan gambar, serta kelengkapan daftar pustaka. Sebelumnya itu dikerjakan manual.

Sistem ini mengotomatiskan pemeriksaan tersebut. Yang **tidak** dilakukannya: menilai mutu ilmiah, mendeteksi plagiarisme, atau mengelola alur telaah sejawat.

**Penggunanya hanya staf internal.** Tidak ada pendaftaran mandiri; akun dibuat lewat Supabase Studio. Setiap staf yang login dapat melihat seluruh naskah — tidak ada pemisahan kepemilikan, dan kebijakan RLS memang ditulis demikian secara sengaja.

> **Kerahasiaan data.** Basis data produksi memuat naskah yang belum terbit beserta nama penulisnya. Untuk pengembangan, gunakan proyek Supabase terpisah dan naskah contoh, bukan proyek produksi.

---

## 2. Arsitektur

```
Browser (staf)
   │
   ├──1─► Supabase Storage          unggah .docx langsung, memakai sesi staf
   │       bucket "manuscripts"      (TIDAK lewat API — lihat §5.1)
   │
   ├──2─► Next.js Route Handler     POST /api/manuscripts  { storagePath, originalFileName }
   │         │
   │         ├─► Supabase Storage   unduh kembali berkasnya
   │         ├─► mesin penyaringan  parseDocx → rules → findings   (murni, tanpa jaringan)
   │         └─► Postgres           simpan manuscript, version, run, findings
   │
   └──3─► Next.js Route Handler     PATCH /api/manuscripts/[id]/references
             │
             ├─► Crossref / OpenAlex / OpenLibrary   (jaringan keluar)
             └─► Postgres                            simpan hasil verifikasi
```

Tiga hal yang perlu dipahami sejak awal:

1. **Berkas naskah tidak pernah melewati badan permintaan API.** Alasannya ada di §5.1. Ini keputusan arsitektural, bukan kebetulan.
2. **Mesin penyaringan bersifat murni dan luring.** `screenManuscript(buffer)` tidak menyentuh jaringan maupun basis data. Karena itu hasilnya dapat direproduksi dan diuji tanpa server.
3. **Verifikasi referensi bergantung jaringan, maka dipisahkan.** Ia tidak memengaruhi status naskah maupun hitungan aturan.

---

## 3. Peta berkas

60 berkas TypeScript, sekitar 6.700 baris.

### `src/lib/docx/` — mesin penyaringan

| Berkas | Tanggung jawab |
|---|---|
| `parseDocx.ts` | Membongkar `.docx` (zip) dan menyusun `ParsedDocument`: daftar paragraf berikut format terselesaikannya, properti halaman, dan jumlah halaman yang dicatat Word |
| `styleResolver.ts` | Menelusuri rantai `basedOn` pada `styles.xml` lalu menimpanya dengan format langsung paragraf |
| `rules.ts` | Seluruh aturan gaya selingkung (±900 baris). Inti sistem ini |
| `screenManuscript.ts` | Menjalankan semua pemeriksaan dan merangkum hasilnya |
| `generateReport.ts` | Menyusun laporan hasil pemeriksaan dalam format Word |
| `types.ts` | `ParsedDocument`, `FindingDraft`, `ScreeningResult` |

### `src/lib/references/` — verifikasi referensi

| Berkas | Tanggung jawab |
|---|---|
| `extractReferences.ts` | Mengubah paragraf daftar pustaka menjadi entri terstruktur (DOI, URL, ISBN, penulis, tahun, judul) |
| `verifyReference.ts` | Kaskade pemeriksaan dan penentuan verdict |
| `similarity.ts` | Kemiripan judul (Dice atas bigram karakter) dan ambang batasnya |
| `sources/crossref.ts` | Resolusi DOI dan pencarian bibliografis |
| `sources/openalex.ts` | Pencarian berdasarkan judul, cakupan lebih luas |
| `sources/openlibrary.ts` | Buku, lewat ISBN atau judul |
| `sources/urlCheck.ts` | Uji tautan **berikut penjagaan SSRF** — lihat §7.3 |
| `sources/regulation.ts` | Pemeriksaan konsistensi kutipan peraturan |
| `sources/http.ts` | Pemanggilan HTTP bersama, batas waktu, User-Agent |

### `src/lib/upload/` — jalur unggah

| Berkas | Tanggung jawab |
|---|---|
| `storagePath.ts` | Membuat kunci objek dan **memvalidasi kepemilikannya** (§7.1) |
| `receiveUpload.ts` | Sisi server: membaca amplop JSON, mengunduh objek, mengembalikan Buffer |
| `validateFile.ts` | Validasi nama dan ukuran, dipakai bersama klien dan server |
| `constants.ts` | Nama bucket dan tipe konten; sengaja tanpa impor apa pun agar aman di sisi klien |

### Lainnya

- `src/app/api/` — route handler (lihat §4)
- `src/app/` — halaman: `/login`, `/dashboard`, `/manuscripts/[id]`, `/manuscripts/upload`
- `src/components/` — komponen UI, dikelompokkan per domain
- `src/lib/supabase/` — pembuat klien untuk sisi browser dan server
- `src/proxy.ts` — middleware; melindungi `/dashboard` dan `/manuscripts`, menyegarkan sesi
- `supabase/migrations/` — migrasi SQL bernomor

---

## 4. Route API

| Metode & jalur | Fungsi |
|---|---|
| `POST /api/manuscripts` | Mendaftarkan naskah baru dari objek yang sudah diunggah, lalu menyaringnya |
| `POST /api/manuscripts/[id]/revisions` | Sama, tetapi sebagai versi baru dari naskah yang sudah ada |
| `DELETE /api/manuscripts/[id]` | Hapus lunak (mengisi `deleted_at`) |
| `GET /api/manuscripts/[id]/original` | Unduh berkas `.docx` asli |
| `GET /api/manuscripts/[id]/report` | Unduh laporan pemeriksaan (Word) |
| `GET /api/manuscripts/[id]/versions` | Riwayat versi |
| `GET /api/manuscripts/[id]/references` | Hasil verifikasi referensi terakhir |
| `POST /api/manuscripts/[id]/references` | Memulai proses verifikasi: mengurai daftar pustaka, membuat baris berstatus `pending` |
| `PATCH /api/manuscripts/[id]/references` | Memverifikasi satu batch (6 entri) |
| `GET /api/manuscripts/export` | Rekap bulanan (CSV) |

Seluruh route memeriksa otentikasi **sebelum** membaca badan permintaan, sehingga permintaan tanpa sesi dijawab 401 tanpa memuat apa pun.

Perhatikan bahwa halaman tidak mengambil data lewat route di atas. Dasbor dan halaman detail naskah adalah server component yang membaca Supabase secara langsung — route API hanya dipakai untuk aksi (unggah, hapus, verifikasi) dan unduhan berkas.

---

## 5. Alur penting

### 5.1 Unggah — mengapa berkasnya tidak lewat API

**Ini bagian yang paling mudah dirusak tanpa sengaja. Mohon dibaca sebelum menyentuh jalur unggah.**

Vercel membatasi badan permintaan sebuah serverless function di sekitar **4,5 MB**. Naskah jurnal yang memuat gambar rutin berukuran 13 MB. Penolakan terjadi di tepi platform, **sebelum kode aplikasi dijalankan**, dan dikirim sebagai HTML — sehingga browser tidak punya cara membedakannya dari koneksi putus.

Gejalanya dulu: pesan "Gagal terhubung ke server. Periksa koneksi internet Anda" pada naskah besar, padahal koneksi normal dan di lokal berhasil.

Alurnya sekarang:

1. Browser mengunggah `.docx` **langsung ke Supabase Storage** memakai sesi staf.
2. Browser mem-POST amplop JSON berisi kunci objeknya saja — beberapa ratus byte, berapa pun ukuran berkas.
3. Server mengunduh kembali objek itu dari Storage untuk disaring.

`experimental.proxyClientMaxBodySize` pernah dicoba dan **tidak menolong**: opsi itu menaikkan batas buffer milik Next, bukan batas Vercel. Opsi tersebut sudah dihapus; jangan dikembalikan.

> Kalau suatu saat jalur ini dikembalikan menjadi `multipart/form-data` ke API, bug 13 MB itu akan muncul lagi persis seperti semula.

Hal lain yang penting dipertahankan: pembacaan balasan (`res.json()`) berada **di luar** blok `try` pemanggilan. Dulu ia di dalam, sehingga balasan non-JSON dari gateway menyamar menjadi kesalahan koneksi dan menyesatkan penelusuran selama berhari-hari.

### 5.2 Penyaringan

`screenManuscript(buffer)` menjalankan `parseDocx` lalu seluruh fungsi `check*`, dan mengembalikan daftar `FindingDraft`.

Tiap temuan punya:

- `severity`: `error` (wajib diperbaiki) atau `warning` (disarankan)
- `checkType`: `automated` atau `manual_review_suggested`

**Hanya temuan `automated` yang memengaruhi hitungan X/Y.** Status naskah ditentukan sederhana: ada temuan `error` → `needs_revision`, tidak ada → `passed`.

### 5.3 Verifikasi referensi

Dijalankan atas permintaan dari halaman naskah, dalam batch 6 entri yang dikendalikan browser. Alasannya sama dengan §5.1: satu permintaan yang memeriksa seluruh daftar pustaka akan menembus batas waktu eksekusi, kehilangan seluruh pekerjaan, dan tidak bisa melaporkan progres.

Kaskadenya, dari bukti terkuat:

1. **DOI** → Crossref. Satu-satunya langkah yang jawaban negatifnya bermakna kuat.
2. **Peraturan/SNI** → hanya diperiksa konsistensi internal kutipannya; tidak ada basis data terbuka untuk ini.
3. **Buku** → OpenLibrary (ISBN, lalu judul).
4. **Artikel** → pencocok bibliografis Crossref, lalu OpenAlex.
5. **Sisanya yang bertautan** → uji tautan.

Verdict-nya bertingkat:

| Verdict | Arti |
|---|---|
| `verified` | Terkonfirmasi ada |
| `doi_invalid` | **Indikasi kuat tidak nyata** — DOI tercantum tapi tidak terdaftar |
| `metadata_mismatch` | Karyanya ada, datanya melenceng |
| `url_unreachable` | Tautan mati |
| `regulation_inconsistent` | Kutipan peraturan tidak lengkap atau tahunnya bertentangan |
| `not_found` | Tidak ditemukan — **bukan** berarti fiktif |
| `not_verifiable` | Di luar jangkauan sumber yang dipakai |
| `check_failed` | Pemeriksaan gagal (jaringan); dapat diulang |

> **Prinsip yang harus dipertahankan.** Jurnal ini banyak mengutip jurnal lokal Indonesia, terbitan kementerian, SNI, dan literatur kelabu yang tidak terindeks registry mana pun. Karena itu "tidak ditemukan" nyaris tidak membuktikan apa-apa. Hanya **DOI yang tidak terdaftar** yang boleh disajikan sebagai indikasi kuat fiktif, karena DOI diterbitkan registrar. Melonggarkan ini berarti menuduh penulis jujur.

Empat kelas false positive pernah ditemukan dan sudah ditangani; jangan dihilangkan tanpa menguji ulang pada naskah nyata:

1. DOI yang tercetak di dalam URL terambil berlebihan → setiap pemotongan di batas garis miring dicoba.
2. Sumber web dicocokkan ke artikel ilmiah yang sekadar mirip → sumber web dinilai dari tautannya lebih dulu, dan pita kemiripan lemah hanya bicara bila tahun dan penulis mendukung.
3. Buku edisi cetak ulang → selisih tahun untuk buku tidak dianggap kesalahan.
4. Literatur sekunder ("Comments on X") memuat judul aslinya → awalan semacam itu ditolak.

---

## 6. Model data

Lima migrasi, dijalankan berurutan. Seluruh tabel memakai RLS dengan pola yang sama: **staf terotentikasi boleh membaca dan menulis semuanya.**

| Tabel | Isi |
|---|---|
| `profiles` | 1:1 dengan `auth.users`; nama tampilan. Terisi otomatis oleh trigger saat user dibuat |
| `manuscripts` | Satu baris per naskah; memuat ringkasan hasil penyaringan versi terkini agar dasbor cukup membaca tabel ini saja |
| `manuscript_versions` | Riwayat unggahan; `file_storage_path`, status parsing |
| `screening_runs` | Satu baris per pemeriksaan atas suatu versi; `rule_set_version` |
| `findings` | Temuan per pemeriksaan |
| `reference_check_runs` | Satu baris per proses verifikasi referensi; `completed_at` null selama batch masih berjalan |
| `reference_checks` | Satu baris per entri daftar pustaka; `verdict` `pending` selama belum diperiksa |

Status naskah: `processing` · `needs_revision` · `passed` · `processing_failed`.

**Penghapusan bersifat lunak** — `manuscripts.deleted_at`. Kueri yang menampilkan naskah harus menyaringnya.

### Storage

Satu bucket privat, `manuscripts`. Kunci objek berbentuk `<user id>/<uuid>.docx` — sengaja tidak memakai nama berkas asli, karena nama berkas sungguhan kerap memuat karakter yang ditolak Storage. Nama aslinya disimpan di kolom `original_file_name`.

Batas 50 MB ditetapkan pada bucket (migrasi 0004) dan dicocokkan dengan `MAX_UPLOAD_SIZE_BYTES` di kode.

---

## 7. Keamanan

### 7.1 Kunci objek berasal dari browser

Karena kunci dibuat di sisi klien, server **tidak boleh mempercayainya**. `isOwnManuscriptStoragePath()` hanya meloloskan kunci yang berbentuk persis `<uuid>/<uuid>.docx` dan berada di folder milik pemanggil. Tanpa itu, satu akun dapat mengarahkan penyaring ke objek milik akun lain.

### 7.2 Otentikasi

Sesi berbasis cookie lewat `@supabase/ssr`. Middleware `src/proxy.ts` melindungi `/dashboard` dan `/manuscripts` serta menyegarkan sesi. Route API memeriksa `auth.getUser()` sebelum apa pun.

### 7.3 Uji tautan dan SSRF

URL yang diuji berasal dari dokumen yang diunggah — artinya dikendalikan pihak luar, sementara permintaannya dikirim **dari dalam jaringan deployment**. Tanpa penjagaan, ini adalah primitif SSRF.

`sources/urlCheck.ts` karena itu:

- hanya mengizinkan skema HTTP(S);
- meresolusi hostname dan menolak **seluruh** alamat privat, loopback, dan link-local — termasuk `169.254.169.254`, endpoint metadata cloud;
- mengikuti pengalihan secara manual dan memvalidasi **setiap hop**, bukan hanya yang pertama;
- tidak menyamar sebagai browser; situs yang memblokir bot dilaporkan "tidak dapat dipastikan", bukan "mati".

Sisa risiko yang diketahui: DNS rebinding tidak tertutup sepenuhnya karena `fetch` tidak mengizinkan penyematan koneksi. Yang terekspos hanyalah satu GET tanpa otentikasi yang isi balasannya tidak pernah dikembalikan ke pemanggil — hanya kode statusnya.

### 7.4 Rahasia

`.env.local` ada di `.gitignore` dan tidak pernah terlacak. Hanya kunci `anon` yang dipakai aplikasi; **tidak ada service role key** di mana pun di kode ini. Seluruh pembatasan akses bersandar pada RLS.

`REFERENCE_CHECK_CONTACT_EMAIL` bersifat opsional dan dikirim ke Crossref. **Jangan diisi dengan alamat email staf atau pengguna** — isi dengan alamat kontak lembaga, atau biarkan kosong.

---

## 8. Mesin aturan

Berada di `src/lib/docx/rules.ts`. Bacalah komentarnya — hampir setiap keputusan di sana menjelaskan *mengapa*, dan banyak di antaranya hasil kalibrasi terhadap template resmi serta naskah nyata, bukan terhadap prosa pedoman.

Beberapa contoh penting:

- Margin dan perataan judul bab dikalibrasi dari berkas nyata, dan **berbeda dari yang tertulis di pedoman**. Pedoman menyebut rata kiri; template dan naskah nyata memakai rata kiri-kanan.
- Deteksi judul tabel/gambar mensyaratkan paragrafnya pendek dan diikuti judul berhuruf kapital. Tanpa itu, kalimat biasa seperti "Figure 8 shows an overlay map…" ikut tertangkap dan dilaporkan sebagai judul yang salah format — menyuruh penulis memperbaiki sesuatu yang sudah benar.
- Penguraian penulis referensi menangani mononim Indonesia dan penulis institusional. Verifikasi referensi menormalkan tahun tanpa tanda kurung lebih dulu, agar naskah bergaya Chicago tetap dapat diverifikasi walau gaya kutipannya menyalahi gaya selingkung.

Menambah aturan: tulis fungsi `check*` baru yang mengembalikan `FindingDraft[]`, daftarkan di `runAllChecks`, tambahkan entri ke `AUTOMATED_RULE_CATALOG` bila ia bersifat `automated`, dan sesuaikan `TOTAL_AUTOMATED_RULE_COUNT` (lihat cacat §9.2).

---

## 9. Cacat yang sudah diketahui

Dicatat apa adanya. Tak satu pun menghalangi penggunaan sehari-hari, tetapi semuanya akan ditemui pengembang yang bekerja di area terkait.

### 9.1 Parser membaca kotak teks dua kali, dan tidak melihat paragraf bersarang

Word menulis kotak teks dua kali: sebagai DrawingML di `mc:Choice` dan sebagai VML warisan di `mc:Fallback`. Keduanya memuat `w:txbxContent` yang sama, sehingga tiap paragraf di dalamnya terbaca dua kali — judul gambar muncul ganda, penyebut "X dari Y judul tabel/gambar" menggelembung, dan satu judul yang salah bisa dilaporkan sebagai dua.

Membuang bagian `mc:Fallback` **tidak bisa dilakukan sendirian**. Pengambil paragraf di `parseDocx.ts` memakai regex yang tidak sadar sarang, sehingga `<w:p>` di dalam kotak teks terserap oleh paragraf yang menambatkan gambarnya. Duplikat itulah satu-satunya alasan paragraf tersebut muncul sama sekali — percobaan membuang fallback saja membuat **kedua judul tabel lenyap** dari hasil parsing sebuah naskah nyata.

Perbaikan yang benar: pasangkan tag `<w:p>` dengan tumpukan agar paragraf bersarang dipancarkan tersendiri, hentikan pengumpulan run saat menemui paragraf bersarang, lalu buang `mc:Fallback`. **Ini menggeser penomoran paragraf di semua dokumen**, dan setiap aturan melaporkan posisi "Paragraf N", jadi bandingkan temuan sebelum dan sesudah pada beberapa naskah nyata.

Catatan `KNOWN ISSUE` yang lebih rinci ada tepat di atas `extractParagraphsInDocumentOrder`.

### 9.2 Jumlah aturan otomatis tidak konsisten

- `TOTAL_AUTOMATED_RULE_COUNT` = **27** — ini penyebut pada "X dari Y aturan terpenuhi"
- `AUTOMATED_RULE_CATALOG` berisi **22** entri — ini yang diiterasi saat menyusun laporan Word
- Mesin dapat memancarkan **24** `ruleId` berbeda, 3 di antaranya tidak ada di katalog: `page-setup-unreadable`, `references-citation-breakdown`, `references-manual-review` (ketiganya bertipe `manual_review_suggested`, jadi memang wajar di luar katalog otomatis)
- Komentar di atas katalog menyebut "23 entri, sesuai `TOTAL_AUTOMATED_RULE_COUNT`" — keliru pada kedua angkanya

Akibatnya angka 27 tidak berpadanan dengan apa pun yang dapat dihitung: dasbor menyebut X/27 sementara laporan Word hanya mampu menyebut 22 aturan. Perbaikannya: turunkan jumlah itu dari katalog, bukan ditulis tangan.

### 9.3 Tiga error lint lama

`npm run lint` melaporkan 3 error yang tidak berkaitan dengan perubahan terakhir:

- `AnalyticsCharts.tsx:25` — `react-hooks/immutability`, variabel akumulator diubah saat render
- `EmptyStateDashboard.tsx:50` dan `AppHeader.tsx:42` — `<a>` seharusnya `<Link>`

### 9.4 Tidak ada tes otomatis

Sekitar 6.700 baris tanpa jaring pengaman. Risiko terbesarnya ada di `rules.ts`: perubahan ambang batas atau pola dapat merusak penyaringan tanpa ada yang memberi tahu. `playwright` sudah terpasang sebagai devDependency tetapi belum ada satu pun berkas tes.

Saran prioritas: kunci perilaku mesin aturan terhadap beberapa naskah nyata lebih dulu.

### 9.5 Temuan lama tidak diperbarui

Temuan tersimpan sebagai hasil pemeriksaan pada saat itu. Memperbaiki sebuah aturan **tidak** mengubah naskah yang sudah disaring; naskahnya perlu diunggah ulang sebagai revisi. Tidak ada tombol "saring ulang".

---

## 10. Lingkungan dan deployment

### Variabel environment

| Variabel | Wajib | Keterangan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ya | URL proyek Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ya | Kunci `anon`; seluruh pembatasan bersandar pada RLS |
| `REFERENCE_CHECK_CONTACT_EMAIL` | tidak | Alamat kontak lembaga untuk polite pool Crossref. Jangan diisi email staf |

### Deployment

Di-deploy ke Vercel, terhubung ke branch `main` — **setiap push ke `main` langsung mengubah produksi.** Deployment dilindungi Vercel Authentication, sehingga tidak dapat diakses tanpa login ke akun Vercel.

Catatan operasional: paket Hobby hanya menyimpan runtime log selama satu jam, jadi penelusuran masalah produksi harus dilakukan segera setelah kejadian.

### Menyiapkan lingkungan pengembangan

Ikuti [SUPABASE_SETUP.md](../SUPABASE_SETUP.md) pada proyek Supabase **baru**, bukan proyek produksi. Jalankan kelima migrasi berurutan, buat satu akun staf, lalu unggah satu naskah contoh untuk memastikan jalurnya utuh.

---

## 11. Konvensi

- **Next.js 16 berbeda dari yang mungkin Anda kenal.** Baca panduan terkait di `node_modules/next/dist/docs/` sebelum menulis kode Next; lihat `AGENTS.md`.
- **Migrasi bernomor, tidak pernah disunting ulang.** Perubahan skema ditambahkan sebagai berkas baru `000N_*.sql`, lalu didaftarkan di `SUPABASE_SETUP.md`.
- **Seluruh teks yang dilihat pengguna berbahasa Indonesia**, termasuk pesan kesalahan.
- **Komentar menjelaskan mengapa, bukan apa.** Banyak keputusan di repositori ini terlihat sembarang sampai alasannya dibaca — pertahankan kebiasaan itu.

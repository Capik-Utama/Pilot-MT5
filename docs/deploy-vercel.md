# Deploy MT5 Pilot ke Vercel

## Tahap saat ini: beranda statis

Pada tahap ini Vercel hanya menerbitkan beranda informasional. Proyek memakai preset Vite, menjalankan `pnpm build:vercel`, lalu menyajikan folder output `public/` sebagai aset statis. Impor repository pada root repository; jangan memilih subfolder `client`.

Beranda `/` tidak memanggil OAuth, database, tRPC, atau API akun MT5. API Express yang masih berada di source belum diterbitkan sebagai backend pada tahap ini. Dengan demikian, halaman awal tetap dapat dibuka tanpa konfigurasi server dan tidak melewati fungsi Express yang sebelumnya menghasilkan error.

## Periksa hasil deployment beranda

- Pastikan URL root mengembalikan `200` dengan `Content-Type: text/html` dan menampilkan beranda MT5 Pilot.
- Pastikan `/manus-routes.json` tetap mengembalikan JSON yang mendeklarasikan `/`.
- Jangan menambahkan rewrite yang mengarahkan semua path ke Express atau file JavaScript.
- Build ini tidak menjalankan migrasi database dan tidak mengaktifkan kontrol trading.

## Sebelum fitur dashboard diaktifkan

Server Express, OAuth, tRPC, telemetry EA, antrean perintah, dan skema database masih disiapkan di source untuk tahap lanjutan. Sebelum fitur tersebut dipublikasikan, pilih hosting backend yang sesuai dan pastikan semua route bekerja terpisah dari beranda statis.

Jangan masukkan file `.env`, URL database, token, atau key ke Git. Untuk backend di masa mendatang, environment runtime yang perlu ditinjau meliputi `DATABASE_URL`, `MANUS_PROJECT_ID`, `MANUS_OAUTH_API_URL`, `MANUS_JWT_SECRET`, `MANUS_API_URL`, `MANUS_API_KEY`, dan `OWNER_OPEN_ID`. Nilai variabel aktual harus diatur lewat pengelola secret di hosting backend, bukan pada source code. Identitas pemilik harus gagal tertutup jika belum dikonfigurasi; project dan deployment privat harus tetap owner-only.

Gunakan database MySQL yang memang dapat dijangkau oleh hosting backend, tinjau jaringan/TLS dan backup, serta jalankan migrasi secara terencana. Jangan menjalankan migrasi pada database yang berisi data produksi tanpa persetujuan dan backup. Sebelum pemantauan/kontrol trading digunakan, validasi autentikasi owner-only, endpoint EA dan token, callback OAuth, serta seluruh alur pada akun demo.

Dokumentasi Vercel: [Vite](https://vercel.com/docs/frameworks/frontend/vite), [Express](https://vercel.com/docs/frameworks/backend/express), [Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), dan [vercel.json](https://vercel.com/docs/project-configuration/vercel-json).

# MT5 Pilot

Dashboard privat untuk telemetry dan pengelolaan Fast-Grid EA MetaTrader 5. Struktur deployment memisahkan frontend statis Vite di Vercel dan Express API di VPS. Database aplikasi masih MySQL; migrasi ke Supabase/PostgreSQL VPS belum dilakukan.

## Menjalankan dan memeriksa

- `pnpm dev` menjalankan frontend Vite dan server Express untuk pengembangan lokal.
- `pnpm check`, `pnpm test`, dan `pnpm build` menjalankan pemeriksaan, tes, dan build produksi.
- `pnpm build:vercel` membangun frontend statis ke `dist/public` untuk Vercel.
- `pnpm db:migrate` menerapkan migrasi MySQL Drizzle yang sudah tercatat. Jangan menjalankannya untuk setup hosting; jangan memakai `db:push` untuk mengganti atau menghapus skema/data.
- `/api/health` adalah endpoint readiness yang tidak memerlukan login.

## Autentikasi dan data

Login aplikasi memakai Manus OAuth dan sesi diproses oleh Express API. Role owner dicocokkan dengan `PILOT_OWNER_EMAIL`; owner dapat mengundang email akun Manus lain untuk role read-only atau staff. Untuk deployment terpisah, URL API publik di frontend dikonfigurasi melalui `VITE_API_BASE_URL`. Lihat [panduan deployment](docs/deploy-vercel.md) dan [panduan operasional](docs/operasional.md).

Database aktif masih memakai driver, schema, dan migration MySQL. Migrasi Supabase/PostgreSQL VPS ditunda; jangan masukkan connection string PostgreSQL atau jalankan migrasi sampai fase tersebut diminta dan schema direkonsiliasi.

## Integrasi EA

Source EA yang diperbarui ada di [`ea/Fast-Grid-Pilot.mq5`](ea/Fast-Grid-Pilot.mq5). Interval default adalah telemetry 500 ms dan polling command 1000 ms; keduanya bisa diubah di input EA atau pengaturan per akun pada kartu Pilot. Running/Profit kartu diperbarui dengan target 500 ms. Ikuti [panduan operasi dan koneksi EA](docs/operasional.md) untuk URL API, token, allow-list WebRequest, role, dan batas keamanan trading. Koneksi remote baru dimulai dalam mode MANUAL. Jangan menghubungkan akun live sebelum EA dikompilasi, URL diverifikasi, konfigurasi risiko diperiksa, serta pengujian demo berhasil.

Setelah server menyimpan AUTO, EA memulihkan mode itu pada restart sebelum telemetry pertama. Perintah AUTO/MANUAL/Close yang sudah antre didahulukan daripada mode lama yang tersimpan; jika status mode belum dapat dipastikan, EA bertahan MANUAL.

## Platform

Source disimpan di GitHub. Frontend dirancang untuk Vercel; Express API berjalan sebagai service persisten pada VPS di balik HTTPS reverse proxy. Database berada di luar Vercel dan masih membutuhkan MySQL selama fase persiapan ini. Struktur ini belum mengonfigurasi kredensial, menjalankan deployment, atau memigrasikan database.

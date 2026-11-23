# MT5 Pilot

Dashboard privat untuk telemetry dan pengelolaan Fast-Grid EA MetaTrader 5, dioperasikan dalam satu project Manus dengan API Express dan database MySQL terkelola.

## Menjalankan dan memeriksa

- `pnpm dev` menjalankan frontend dan server Express pada port project Manus.
- `pnpm check`, `pnpm test`, dan `pnpm build` menjalankan pemeriksaan, tes, dan build produksi.
- `pnpm db:migrate` menerapkan migrasi Drizzle yang sudah tercatat. Jangan memakai `db:push` untuk mengganti atau menghapus skema/data.
- `/api/health` adalah endpoint readiness yang tidak memerlukan login.

## Autentikasi dan data

Login aplikasi memakai Manus OAuth. Akses role pertama owner dicocokkan dengan secret terlindungi `PILOT_OWNER_EMAIL`; owner kemudian mengundang email akun Manus untuk role read-only atau staff. Tidak ada password lokal. Data akun/password Supabase sebelumnya tidak ikut dipindahkan; database Manus baru tidak berisi saldo simulasi.

## Integrasi EA

Source EA yang diperbarui ada di [`ea/Fast-Grid-Pilot.mq5`](ea/Fast-Grid-Pilot.mq5). Interval default adalah telemetry 500 ms dan polling command 1000 ms; keduanya bisa diubah di input EA atau pengaturan per akun pada kartu Pilot. Running/Profit kartu diperbarui dengan target 500 ms. Ikuti [panduan operasi dan koneksi EA](docs/operasional.md) untuk URL API, token, allow-list WebRequest, role, dan batas keamanan trading. Koneksi remote baru dimulai dalam mode MANUAL. Jangan menghubungkan akun live sebelum EA dikompilasi, URL diverifikasi, konfigurasi risiko diperiksa, serta pengujian demo berhasil.

Setelah server menyimpan AUTO, EA memulihkan mode itu pada restart sebelum telemetry pertama. Perintah AUTO/MANUAL/Close yang sudah antre didahulukan daripada mode lama yang tersimpan; jika status mode belum dapat dipastikan, EA bertahan MANUAL.

## Platform

Project ini tidak memerlukan GitHub sebagai runtime, Vercel, Supabase, Appwrite, atau VPS pengguna. Source, server, database, dan publikasi dikelola melalui project Manus. Auto-publish dan hosting always-on tidak diaktifkan oleh konfigurasi awal.

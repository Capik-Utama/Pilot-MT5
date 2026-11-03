# MT5 Pilot — dashboard privat Fast-Grid

MT5 Pilot menyediakan dashboard privat untuk memantau dan mengendalikan source EA Fast-Grid. Frontend React/Vite disajikan oleh Vercel. Supabase Auth menangani login, sementara Edge Function `mt5-api` memvalidasi sesi dashboard atau token EA sebelum membaca dan mengubah data. EA terhubung melalui HTTPS WebRequest dari MetaTrader 5.

Dashboard hanya menerima telemetry langsung dari MT5; tidak ada saldo atau transaksi sintetis. Aplikasi tidak mengklasifikasikan jenis akun dan tidak mencegah EA dipasang pada jenis akun lain. Pastikan terminal MT5 yang dipilih benar-benar akun real yang Anda maksud sebelum memasang EA.

## Menghubungkan akun MT5

1. Owner masuk di `https://pilot-mt5.vercel.app/`. Pendaftaran publik ditutup; akun tambahan dibuat owner dari menu pengguna.
2. Pilih **Tambah EA** untuk membuat koneksi dan simpan token yang hanya ditampilkan satu kali.
3. Buka `ea/Fast-Grid-Pilot.mq5` di MetaEditor, compile, lalu pasang EA pada chart akun dan simbol yang dimaksud.
4. Masukkan token pada input `EAConnectionToken` dan izinkan WebRequest ke `https://qqdsultliybypiuvihli.supabase.co` pada Tools → Options → Expert Advisors.
5. Verifikasi nama akun, login, server, saldo, dan equity yang muncul di dashboard sebelum membiarkan EA berdagang.

**Penting untuk akun real:** setiap koneksi baru otomatis disetel ke **AUTO** dan server mengantrekan perintah AUTO. Ketika EA tersambung, EA dapat langsung membuka posisi mengikuti parameter dan batas risiko yang berlaku. Perilaku ini memang dipertahankan. Periksa akun, lot, batas rugi, target, simbol, Magic Number, dan izin Algo Trading sebelum menyambungkan EA. Pilih **MANUAL** terlebih dahulu jika Anda tidak ingin entry otomatis.

Mode trading yang tersimpan juga dipulihkan setelah EA melakukan polling. Karena itu, jika akun tersimpan dalam AUTO, EA dapat kembali membuka posisi setelah reload atau sambung ulang. Memilih MANUAL sebelum melepas atau memulai ulang EA menghentikan entry otomatis; perlindungan SL dan trailing yang sudah berjalan tetap bekerja.

## Fitur dan keselamatan

Dashboard menyediakan metrik telemetry dan antrean perintah Manual/Auto, BUY/SELL, reset, penutupan posisi, serta editor parameter remote. Perintah penutupan hanya menargetkan posisi Fast-Grid pada simbol chart dan Magic Number yang dikonfigurasi. Akses read-only dapat melihat data tanpa mengirim perintah. Role staff dapat mengendalikan hanya kartu akun yang diizinkan owner.

Token EA disimpan sebagai hash di Supabase; token mentah hanya ditampilkan saat koneksi dibuat. Jangan bagikan token. Jangan menaruh service-role key atau kredensial broker di frontend, EA, atau Git. Perintah trading dapat berdampak langsung pada dana akun real; awasi tab Experts/Journal dan konfirmasi hasil transaksi di terminal serta riwayat broker.

## Pengembangan

- `pnpm install --frozen-lockfile` memasang dependency.
- `pnpm check` menjalankan pemeriksaan TypeScript.
- `pnpm build:vercel` membangun frontend ke direktori `public/`.
- `pnpm test` menjalankan test aplikasi.

Skema Supabase berada di `supabase/migrations/`; kode Edge Function ada di `supabase/functions/mt5-api/`. Browser hanya menggunakan publishable key; tabel tetap dilindungi RLS dan tidak memberi akses langsung ke role anon/authenticated.

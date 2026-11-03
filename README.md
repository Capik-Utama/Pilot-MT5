# MT5 Pilot — dashboard EA demo

MT5 Pilot menampilkan dashboard privat untuk source `Fast-Grid` yang dilampirkan pemilik. Frontend React/Vite diterbitkan statis di Vercel; Supabase Auth menangani akun login, sedangkan Edge Function `mt5-api` memvalidasi sesi browser atau token EA sebelum membaca/menulis database. Koneksi EA menggunakan HTTPS WebRequest dari MT5.

Pada tahap demo, pendaftaran Supabase Auth terbuka supaya pemilik dapat membuat login sendiri. Data tetap dipisahkan berdasarkan pengguna; login lain tidak dapat membaca telemetry, token, atau perintah milik akun Anda. Auto, BUY/SELL manual, RESET, dan perintah tutup yang dikirim melalui dashboard tersedia untuk akun demo maupun real setelah pemilik login dan EA terhubung.

## Uji EA

1. Buka `https://pilot-mt5.vercel.app/`, buat akun/masuk dan buat token koneksi.
2. Buka `ea/Fast-Grid-Pilot.mq5` di MetaEditor, compile, lalu pasang di chart akun MT5.
3. Masukkan token pada input `EAConnectionToken`.
4. Izinkan WebRequest untuk `https://qqdsultliybypiuvihli.supabase.co` pada Tools → Options → Expert Advisors.
5. Pastikan EA menunjukkan heartbeat online. **Kartu yang baru dibuat akan menerima satu perintah AUTO saat EA tersambung; AUTO dapat langsung membuka posisi sesuai konfigurasi risiko.** Uji hanya pada akun dan konfigurasi yang memang Anda setujui.

EA menolak inisialisasi pada akun real dan secara lokal memulai Manual; AUTO awal untuk kartu baru diantrekan Pilot satu kali dan dijalankan setelah koneksi EA aktif. Terapkan migrasi Supabase terbaru secara berurutan dari `supabase/migrations/`, termasuk `20261102210000_pilot_staff_account_access.sql`, `20261102220000_pilot_new_account_auto_start.sql`, dan `20261103101635_pilot_account_polling_interval.sql`, lalu deploy ulang Edge Function `mt5-api` bila source function berubah. Owner dapat mengubah nama kartu EA dan menghapus koneksi dari Pilot dengan verifikasi sandi; penghapusan mencabut token dashboard tetapi tidak menghentikan EA di terminal MT5. Tombol aksi kartu mengirim perintah tanpa dialog konfirmasi tambahan. Owner juga dapat membuat role Staff dan mencentang akun yang boleh diakses; Staff hanya dapat menjalankan tombol pada kartu akun terpilih, tanpa akses mengubah parameter EA atau mengelola akun/pengguna. Owner dapat mengatur polling per akun ke 500 ms, 1 detik (default), atau 2 detik; interval ini hanya mengatur pemeriksaan tombol/perubahan parameter dan tidak mengubah frekuensi telemetry. Setelah memperbarui file MQL5, compile di MetaEditor dan pasang versi baru di terminal MT5. Lihat [panduan integrasi Fast-Grid](docs/mt5-ea-api.md) untuk arti setiap metrik dan batas kontrol. MetaEditor tidak tersedia di sandbox, jadi file MQL5 perlu dikompilasi dan dijalankan di terminal MT5 milik pengguna.

## Pengembangan

- `pnpm install --frozen-lockfile` memasang dependency.
- `pnpm check` menjalankan pemeriksaan TypeScript.
- `pnpm build:vercel` membangun frontend ke direktori `public/`.
- `pnpm test` menjalankan test aplikasi.

Skema Supabase berada di `supabase/migrations/`; kode Edge Function ada di `supabase/functions/mt5-api/`. Jangan pernah memasukkan service-role key atau kredensial broker ke frontend, EA, atau Git. Publishable key di browser bukan rahasia; akses tabel langsung dari anon/authenticated dicabut dan RLS aktif.

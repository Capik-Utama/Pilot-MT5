# MT5 Pilot — dashboard EA demo

MT5 Pilot menampilkan dashboard privat untuk source `Fast-Grid` yang dilampirkan pemilik. Frontend React/Vite diterbitkan statis di Vercel; Supabase Auth menangani akun login, sedangkan Edge Function `mt5-api` memvalidasi sesi browser atau token EA sebelum membaca/menulis database. Koneksi EA menggunakan HTTPS WebRequest dari MT5.

Pada tahap demo, pendaftaran Supabase Auth terbuka supaya pemilik dapat membuat login sendiri. Data tetap dipisahkan berdasarkan pengguna; login lain tidak dapat membaca telemetry, token, atau perintah milik akun Anda. EA membatasi Auto dan perintah tutup ke akun demo.

## Uji EA

1. Buka `https://pilot-mt5.vercel.app/`, buat akun/masuk dan buat token koneksi demo.
2. Buka `ea/Fast-Grid-Pilot.mq5` di MetaEditor, compile, lalu pasang di chart akun demo.
3. Masukkan token pada input `EAConnectionToken`.
4. Izinkan WebRequest untuk `https://qqdsultliybypiuvihli.supabase.co` pada Tools → Options → Expert Advisors.
5. Pastikan EA menunjukkan mode Manual dan heartbeat online sebelum menguji Auto atau kontrol penutupan.

EA versi ini menolak inisialisasi pada akun real, memulai dalam Manual, dan mengalihkan ke Manual sebelum menutup posisi. Lihat [panduan integrasi Fast-Grid](docs/mt5-ea-api.md) untuk arti setiap metrik dan batas kontrol. MetaEditor tidak tersedia di sandbox, jadi file MQL5 perlu dikompilasi dan dijalankan di terminal MT5 milik pengguna.

## Pengembangan

- `pnpm install --frozen-lockfile` memasang dependency.
- `pnpm check` menjalankan pemeriksaan TypeScript.
- `pnpm build:vercel` membangun frontend ke direktori `public/`.
- `pnpm test` menjalankan test aplikasi.

Skema Supabase berada di `supabase/migrations/`; kode Edge Function ada di `supabase/functions/mt5-api/`. Jangan pernah memasukkan service-role key atau kredensial broker ke frontend, EA, atau Git. Publishable key di browser bukan rahasia; akses tabel langsung dari anon/authenticated dicabut dan RLS aktif.

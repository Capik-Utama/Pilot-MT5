# Deploy MT5 Pilot ke Vercel

## Arsitektur

Vercel membangun frontend React/Vite dari root repository dengan `pnpm build:vercel`, lalu menyajikan folder statis `public/`. Browser menggunakan URL dan publishable key Supabase. Autentikasi, database, telemetry EA, dan antrean kontrol berada pada project Supabase `Pilot-MT5`; service-role key hanya berada di lingkungan server Supabase.

## Proses publish

Hubungkan repository pada root repo, gunakan preset Vite, build command `pnpm build:vercel`, dan output directory `public/`. Push ke branch produksi akan memicu deployment Vercel. Setelah deployment, halaman `/` harus menampilkan login saja; tidak ada pendaftaran publik. Request ke Edge Function tanpa sesi pengguna atau token EA yang valid harus ditolak.

Vercel tidak memerlukan server Express, variabel MySQL, OAuth Manus, atau secret service-role Supabase untuk konfigurasi ini. Jangan menambahkan service-role key atau token koneksi EA ke frontend, `.env` yang dikomit, atau HTML statis.

## Supabase dan MT5

Schema berada di `supabase/migrations/`; Edge Function `mt5-api` berjalan pada project Supabase yang sama. Function memvalidasi JWT pengguna atau token EA khusus sebelum mengakses tabel. Gateway menggunakan `verify_jwt=false` karena EA memakai token kustom; autentikasi internal tetap wajib dan tidak boleh dihapus. RLS aktif dan role browser tidak memperoleh grant langsung ke tabel.

Signup publik Supabase Auth ditutup. Owner mengelola user dari dashboard; data tetap dibatasi menurut owner dan izin akun. Pada terminal MT5, izinkan WebRequest ke origin `https://qqdsultliybypiuvihli.supabase.co`.

Aplikasi tidak mengklasifikasikan jenis akun MT5. Pastikan terminal yang dipilih adalah akun real yang dimaksud sebelum memasang EA. Koneksi baru otomatis memulai dalam AUTO dan mengantrekan perintah AUTO; setelah EA terhubung, entry dapat dimulai mengikuti konfigurasi. Perilaku ini dipertahankan sesuai permintaan owner. Tinjau parameter risiko terlebih dahulu.

## Verifikasi pascadeploy

Pastikan halaman login tidak menyediakan signup. Setelah owner masuk, akun yang belum mengirim telemetry harus tampil kosong/offline, tanpa angka sintetis. Endpoint `mt5-api` tanpa Authorization/token harus ditolak. Sebelum menghubungkan EA pada akun real, cek terminal MT5, simbol, lot, Magic Number, batas rugi dan target. Setelah tersambung, cocokkan nama, login, server, saldo, equity, status AUTO/MANUAL, serta perintah yang masuk di tab Experts/Journal dan riwayat broker.

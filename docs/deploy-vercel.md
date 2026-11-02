# Deploy MT5 Pilot ke Vercel

## Arsitektur aktif

Vercel membangun frontend React/Vite dari root repository dengan `pnpm build:vercel`, lalu menyajikan folder statis `public/`. Browser menggunakan URL dan publishable key Supabase yang memang boleh tampil di client. Autentikasi, tabel, telemetry EA, dan antrean kontrol berada pada proyek Supabase `Pilot-MT5`; Vercel tidak menerima database/service-role key.

## Proses publish

Impor repository pada root repo, jangan pilih subfolder `client`. Pastikan framework preset Vite, build command `pnpm build:vercel`, dan output directory `public/`. Deploy setelah perubahan masuk ke branch produksi. Setelah deploy, buka root domain, verifikasi layar login/registrasi, lalu tes Edge Function Supabase dengan request tanpa sesi/token (harus ditolak). Preview branch dapat memerlukan autentikasi Vercel dan tidak otomatis berarti produksi sudah diperbarui.

Tidak diperlukan server Express, variabel MySQL, OAuth Manus, atau secret Supabase di Vercel untuk konfigurasi ini. Jangan menambahkan service-role key atau token koneksi EA ke frontend, file `.env` yang dikomit, atau HTML statis.

## Supabase dan MT5

Schema ada di `supabase/migrations/`; Edge Function `mt5-api` harus dideploy pada proyek yang sama. Fungsi menggunakan secret standar Supabase di server dan autentikasi internal untuk JWT pengguna / token EA. Function gateway memakai `verify_jwt=false` karena EA membawa token kustom; jangan mengubahnya menjadi endpoint tanpa autentikasi. Tabel RLS aktif, dan role browser tidak mendapat grant langsung.

Pada tahap demo, pendaftaran Supabase Auth terbuka agar pemilik dapat membuat login. Data dan perintah tetap dipisahkan dengan `owner_id`, sehingga satu akun tidak bisa membaca milik akun lain. Perintah web hanya diizinkan jika sesi pemilik valid, EA terhubung dengan token yang benar, dan heartbeat masih aktif; source EA juga memvalidasi token EA. Untuk uji, tambahkan origin `https://qqdsultliybypiuvihli.supabase.co` ke allow-list WebRequest MT5.

## Verifikasi pascadeploy

Pastikan dashboard `/` menampilkan login/daftar. Setelah login, halaman harus menunjukkan empty state (tanpa angka simulasi) sampai token dibuat dan EA mengirim heartbeat. Test endpoint `mt5-api` tanpa Authorization harus menghasilkan 401. Buat akun MT5, uji satu command per satu, periksa status acknowledgement dan transaksi broker, lalu cek tab Experts/Journal MT5. Pastikan pengaturan risiko sesuai sebelum mengirim perintah.

# Deployment Pilot-MT5

Arsitektur target: frontend statis Vite di Vercel, Express API persisten dan Supabase self-hosted (Auth + PostgreSQL) di VPS. Tidak ada provisioning, migrasi, atau deployment yang dijalankan sebagai bagian perubahan ini. Database masih baru/kosong dan tidak ada impor data lama.

## Vercel: frontend

Gunakan build command `pnpm build:vercel` dan output directory `dist/public`. Atur `VITE_API_BASE_URL=https://api.example.com` (origin publik API saja, tanpa path dan slash akhir). Nilai `VITE_` masuk ke bundle browser: hanya URL publik boleh digunakan. Jika browser memang mengakses Supabase Auth langsung, hanya `VITE_SUPABASE_URL` dan anon/publishable key `VITE_SUPABASE_ANON_KEY` yang boleh ada di Vercel. Jangan pernah memasukkan `DATABASE_URL`, password database, Supabase service-role/secret key, atau kredensial server lainnya ke Vercel.

Vercel hanya menyajikan frontend; `/api/*` tetap berjalan pada VPS. API harus mengizinkan origin frontend melalui `CORS_FRONTEND_ORIGIN` (daftar origin persis dipisahkan koma, tanpa `*`).

## VPS: Express API dan Supabase

Express API berjalan pada VPS di belakang reverse proxy HTTPS. Konfigurasikan `PORT`, `API_ONLY=true`, `PUBLIC_API_URL`, dan `CORS_FRONTEND_ORIGIN`. Supabase self-hosted Auth/PostgreSQL juga berada pada VPS/private network; jangan membuka port PostgreSQL ke internet.

Environment server-only: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` atau `SUPABASE_SERVICE_ROLE_KEY`, `PILOT_OWNER_EMAIL`, password/kredensial database, dan semua secret Auth. `DATABASE_URL` harus memakai login runtime tersendiri, bukan akun postgres/admin atau service-role. `/api/health` tidak memerlukan login dan hanya menguji proses Express, bukan koneksi DB.

### Provisioning database yang belum dilakukan

1. Administrator Supabase/database yang berwenang meninjau file `supabase/migrations/20261123150000_pilot_mt5_postgres_fresh.sql` pada database baru. Jangan menjalankannya tanpa persetujuan eksplisit. SQL membuat role grup `pilot_api NOLOGIN`, tabel `public`, FK ke `auth.users`, RLS `FORCE`, dan kebijakan/grant role API; tidak ada seed atau sinkronisasi profil otomatis.
2. Buat akun database runtime tersendiri dan berikan membership `pilot_api` menggunakan administrator yang sah. Migrasi tidak menebak username login dan tidak menyetel password. Simpan password hanya sebagai secret pada Express VPS. Jangan gunakan user admin/migration sebagai runtime. `pilot_api` sendiri NOLOGIN dan bukan kredensial koneksi.
3. Pastikan user Auth dibuat melalui Supabase Auth dan bahwa `public.users.id` sama persis dengan `auth.users.id`. Tidak ada trigger signup dalam migrasi ini; aplikasi harus membuat/memelihara profile row sesuai alur Auth, atau trigger terpisah harus dirancang dan ditinjau.
4. Periksa perilaku RLS dengan login runtime. Policy migrasi memberi anggota role `pilot_api` akses penuh ke tabel aplikasi; ini hanya aman jika kredensialnya eksklusif untuk backend terpercaya. Browser tidak boleh terhubung dengan role ini.
5. Isi `DATABASE_URL` dan kredensial Supabase server-side setelah provisioning dan validasi non-produksi. Tidak ada langkah ini yang dilakukan saat ini.

Supabase migrasi membuat objek sebagai role administrator yang menerapkannya (bukan memindahkan ownership ke role runtime). Hak akses yang diperlukan diberikan eksplisit; role setup/admin tetap dikelola pemilik VPS. Sesuaikan prosedur role/member grant dengan kebijakan Supabase self-hosted setempat, jangan mengubah secret/hak akses dengan asumsi username bawaan.

## Urutan aktivasi (panduan, tidak dijalankan)

Provision Supabase dan database lebih dahulu, tinjau serta terapkan migrasi hanya setelah persetujuan, uji Express/API pada lingkungan non-produksi, lalu deploy API VPS dan frontend Vercel. Verifikasi CORS, Auth, dashboard dan koneksi EA di akun demo. Jangan kirim rahasia lewat chat atau commit file environment.

# MT5 Pilot

Dashboard privat untuk telemetry dan pengelolaan Fast-Grid EA MetaTrader 5. Frontend statis Vite tetap di Vercel; Express API dan Supabase self-hosted (Auth + PostgreSQL) berjalan pada VPS. Database baru masih kosong; tidak ada impor data lama yang dilakukan.

## Pengembangan dan pemeriksaan lokal

- `pnpm dev` menjalankan frontend dan Express untuk pengembangan lokal.
- `pnpm check`, `pnpm test`, dan `pnpm build` menjalankan pemeriksaan, tes, dan build.
- `pnpm build:vercel` membangun frontend statis untuk Vercel.
- `pnpm db:generate` menghasilkan migrasi Drizzle lokal. Jangan menjalankan migrasi terhadap database produksi tanpa tinjauan dan otorisasi terpisah.
- Migrasi awal yang disiapkan adalah `supabase/migrations/20261123150000_pilot_mt5_postgres_fresh.sql`; migrasi ini belum diterapkan.

## Konfigurasi environment

Di VPS/API, simpan `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, dan `PILOT_OWNER_EMAIL` sebagai konfigurasi server-only; jangan masukkan database password, service-role key, session secret, atau kredensial OAuth ke Vercel/build browser. `CORS_FRONTEND_ORIGIN` berisi origin frontend persis yang diizinkan. Bila API memakai Supabase Auth server-side, API menggunakan Supabase URL/key pada server dan PostgreSQL hanya melalui koneksi API khusus.

Di Vercel, gunakan hanya `VITE_API_BASE_URL` (origin HTTPS API tanpa path) dan, hanya jika browser Auth langsung memang digunakan, `VITE_SUPABASE_URL` serta `VITE_SUPABASE_ANON_KEY` (anon/publishable key saja). Variabel `VITE_` menjadi publik di bundle. Jangan pernah menaruh `DATABASE_URL`, kredensial privileged, atau service-role key dalam variabel `VITE_`.

## Provisioning yang direncanakan — belum dijalankan

1. Provision dan amankan Supabase self-hosted di VPS; jangan membuka PostgreSQL langsung ke internet. Siapkan backup dan TLS sesuai setup VPS.
2. Dengan administrator database yang berwenang, tinjau dan terapkan migrasi fresh sekali pada database kosong. Migrasi membuat role grup `pilot_api` NOLOGIN, tabel di `public`, FK `public.users.id` ke `auth.users.id`, RLS, dan grant untuk role API. Belum ada user, trigger pembuatan profil, atau data seed; identitas profil harus memakai UUID yang memang dibuat Supabase Auth, bukan UUID acak. Pastikan alur aplikasi membuat/memelihara profil `public.users` yang cocok dengan UUID Auth.
3. Buat login runtime tersendiri dengan hak minimum, lalu berikan membership `pilot_api` kepada login tersebut melalui administrator database. Jangan memakai `postgres`, akun migrasi/admin, atau `service_role` sebagai runtime. Kebijakan RLS mengizinkan role grup API akses tabel penuh sehingga kredensial runtime harus rahasia dan hanya dipakai Express di VPS.
4. Konfigurasikan `DATABASE_URL` server-only ke login runtime, Supabase Auth URL/key, `CORS_FRONTEND_ORIGIN`, dan domain HTTPS. Validasi pada lingkungan non-produksi sebelum mengaktifkan layanan.
5. Atur Vercel `VITE_API_BASE_URL` ke origin API dan domain frontend yang sama pada allowlist CORS. Jangan deploy atau menerapkan migrasi sebagai bagian dari instruksi ini.

Semua langkah di atas adalah panduan, bukan operasi yang telah dilakukan. Jangan jalankan migrasi atau provisioning database tanpa persetujuan eksplisit.

## Integrasi EA

Source EA ada di [`ea/Fast-Grid-Pilot.mq5`](ea/Fast-Grid-Pilot.mq5). Ikuti [panduan operasi](docs/operasional.md) untuk koneksi, token, allow-list WebRequest, role, dan batas keamanan trading. Koneksi remote baru dimulai MANUAL. Jangan hubungkan akun live sebelum EA dikompilasi, URL diverifikasi, konfigurasi risiko diperiksa, dan pengujian demo berhasil.

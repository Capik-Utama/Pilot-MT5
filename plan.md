# Rencana Migrasi Pilot-MT5 ke Supabase VPS + Express API + Vercel

## Keputusan arsitektur dan batasan

Supabase self-hosted pada VPS menjadi penyedia Auth dan PostgreSQL. Express tetap menjadi API aplikasi/EA pada host API/VPS, sedangkan React/Vite statis tetap di Vercel. Browser memakai Supabase Auth langsung hanya dengan URL/key anon atau publishable yang publik, lalu mengirim access token sebagai Bearer ke Express. Express memverifikasi token terhadap Supabase Auth dan memakai koneksi PostgreSQL runtime khusus.

Database tujuan dimulai kosong. Tidak ada import/pemulihan pengguna, password, akun EA, telemetry, command, event, atau data MySQL/Supabase lama. Migrasi SQL pada `supabase/migrations/20261123150000_pilot_mt5_postgres_fresh.sql` hanya membuat objek skema kosong. Perubahan ini dibatasi pada source, dokumentasi, dan validasi lokal; SQL tidak diterapkan ke database, provisioning VPS tidak dilakukan, dan aplikasi tidak di-deploy.

## Implementasi

- Pertahankan tampilan dashboard, pencarian/filter EA, telemetri, command, audit log, pengaturan dan perilaku EA yang sudah ada.
- Ganti identitas internal ke UUID Supabase Auth. Profil `public.users.id` mereferensikan `auth.users.id`; password tetap berada di Supabase Auth dan tidak disimpan/hash di tabel aplikasi. Role owner/staff/read-only serta assignment akun diverifikasi oleh Express.
- Express memakai PostgreSQL melalui Drizzle dan `pg`, serta memverifikasi Supabase bearer token. Invite pengguna dan administrasi Auth dilakukan server-side dengan Supabase Auth Admin API; key Admin tidak pernah masuk bundle browser.
- API EA tetap mempertahankan kontrak telemetry, konfigurasi, polling/ack command, expiry dan event audit yang digunakan EA. Scope owner/account UUID dipastikan di setiap endpoint.
- PostgreSQL fresh schema memakai constraint/foreign key dan RLS pada tabel Pilot. `pilot_api` adalah role grup NOLOGIN; runtime harus login memakai akun PostgreSQL terdedikasi yang diberi membership oleh administrator VPS. Tidak menggunakan superuser DB sebagai runtime.
- Vercel hanya menerima variabel publik `VITE_API_BASE_URL`, `VITE_SUPABASE_URL` dan anon/publishable key. Secrets Supabase Auth Admin dan `DATABASE_URL` hanya pada VPS/API.

## Struktur proyek

- `client/src/pages/Home.tsx`, `client/src/_core/hooks/useAuth.ts`, `client/src/lib/supabase.ts`, `client/src/lib/api.ts`: UI, login Supabase, bearer headers, dan request ke API VPS.
- `server/mt5-api.ts`: API dashboard dan EA, authorization role/scope, telemetry, command, audit serta provisioning user Auth.
- `server/_core/supabase.ts`, `server/_core/sdk.ts`: klien Supabase server dan validasi access token.
- `server/db.ts`, `drizzle/schema.ts`, `drizzle.config.ts`: koneksi `pg`, model PostgreSQL dan konfigurasi Drizzle.
- `supabase/migrations/`: SQL fresh schema; belum diterapkan.
- `ea/Fast-Grid-Pilot.mq5`: EA yang berkomunikasi dengan endpoint HTTPS Express.
- `docs/`: petunjuk Auth, deployment frontend, operasi, role, koneksi dan keamanan.

## Desain

Pertahankan estetika terminal finansial gelap yang sudah dipakai dashboard; tidak ada redesign besar. Prioritaskan angka telemetry yang terbaca, status online/offline yang jelas, warna cyan untuk koneksi, hijau untuk sehat, amber untuk peringatan, merah untuk risiko, dan kontrol trading yang jelas batas risikonya. Panel kartu tetap responsif untuk desktop/mobile; animasi hanya untuk status, loading dan toast. Suara UI ringkas, faktual dan operasional. Brand tetap MT5 Pilot dengan warna terminal cyan.

## Status operasional

Source migrasi dan validasi lokal dilakukan sebelum commit/push. Penggunaan Auth email invitation memerlukan SMTP serta redirect allowlist yang dikonfigurasi di Supabase VPS. Penerapan skema, konfigurasi secret VPS/Vercel, pengujian EA, dan deployment adalah langkah terpisah dan belum dilakukan.

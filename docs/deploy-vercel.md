# Deployment Pilot-MT5

Arsitektur yang disiapkan memisahkan frontend statis Vite di Vercel dari Express API di VPS. EA MT5 dan frontend mengakses API VPS melalui HTTPS. Database pada aplikasi masih memakai MySQL; migrasi ke Supabase/PostgreSQL di VPS sengaja belum dilakukan.

## Vercel: frontend

Hubungkan repository GitHub ke Vercel dengan root directory repository. Gunakan build command `pnpm build:vercel` dan output directory `dist/public`. Tambahkan environment variable `VITE_API_BASE_URL=https://api.example.com` pada Vercel untuk Production dan Preview yang memang akan digunakan. Build script sengaja gagal jika variable ini kosong, supaya frontend tanpa URL API tidak terpublikasi. Nilainya adalah origin publik API saja, tanpa path `/api` dan tanpa slash akhir. Variable `VITE_` masuk ke bundle browser, sehingga isinya hanya boleh berupa URL publik—jangan simpan secret, token, maupun kredensial database di Vercel.

Vercel hanya membangun frontend. `/api/*` tidak disediakan oleh deployment Vercel ini. Pastikan domain frontend di Vercel sudah stabil sebelum mengisi allowlist CORS pada VPS.

## VPS: Express API

Jalankan Dockerfile repository sebagai container persisten pada VPS. Container mendengarkan port `3000`; pasang reverse proxy HTTPS di depannya dan arahkan hostname API ke container. Set `API_ONLY=true`, `PORT=3000`, `PUBLIC_API_URL` ke origin HTTPS API, `FRONTEND_URL` ke origin frontend, dan `CORS_ORIGINS` ke satu atau lebih origin frontend yang dipisahkan koma. CORS membandingkan origin secara persis; jangan memakai `*`. Tambahkan domain Preview hanya bila diperlukan.

Contoh setelah file environment runtime berada di luar repository pada `/srv/pilot-mt5-api/.env`:

```sh
docker build -t pilot-mt5-api .
docker run -d --name pilot-mt5-api --restart unless-stopped \
  --env-file /srv/pilot-mt5-api/.env \
  -p 127.0.0.1:3000:3000 pilot-mt5-api
```

Reverse proxy HTTPS dapat meneruskan hostname API ke `127.0.0.1:3000`; pemetaan port loopback ini tidak membuka port aplikasi ke internet secara langsung.

Konfigurasikan environment server sesuai `.env.example`. `APP_SESSION_SECRET`, kredensial OAuth, serta `DATABASE_URL` adalah rahasia runtime di VPS dan tidak boleh dimasukkan ke build frontend. Endpoint readiness `GET /api/health` harus dapat dijangkau tanpa autentikasi. Endpoint ini hanya memastikan proses Express merespons; ia tidak memeriksa koneksi database. Jangan mengekspos port internal container atau port database langsung ke internet.

Semua endpoint aplikasi yang membaca atau menulis data masih membutuhkan MySQL yang dapat dijangkau melalui `DATABASE_URL`. Jika variabel itu kosong atau database tidak tersedia, `/api/health` masih dapat merespons tetapi endpoint aplikasi akan gagal. Karena target Supabase VPS masih kosong dan driver PostgreSQL belum digunakan, struktur ini belum siap untuk deployment operasional sampai database aktif dikonfigurasi atau migrasi database diselesaikan nanti.

Untuk login OAuth lintas-origin, `MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, dan `MANUS_OAUTH_API_URL` harus diatur pada API VPS. Redirect callback OAuth harus memakai `https://<API_HOST>/api/oauth/callback`. URL frontend dan API yang dikonfigurasi harus berupa origin, bukan URL dengan path. Callback mengembalikan token sesi melalui URL fragment ke frontend; frontend menyimpannya dalam `sessionStorage` dan meneruskannya sebagai Bearer token. Cookie lintas-origin juga memakai HTTPS, tetapi Bearer token menjadi fallback jika browser membatasi cookie pihak ketiga. Login belum dianggap teruji sebelum origin, OAuth project, dan secret server benar-benar dikonfigurasi.

Password/session dan identitas pengguna tetap diproses API. EA harus memakai URL `https://<API_HOST>/api/mt5` dan allow-list WebRequest MT5 hanya memerlukan origin `https://<API_HOST>`.

## Database: belum dimigrasi

Kode aktif pada branch ini masih menggunakan driver dan schema Drizzle MySQL. Jangan mengisi `DATABASE_URL` dengan connection string PostgreSQL Supabase sebelum driver, schema, query, migration, serta autentikasi direkonsiliasi. Berkas `supabase/migrations` yang sudah ada memakai model berbeda dan bukan schema aktif aplikasi. Karena database Supabase VPS masih kosong, fase berikutnya perlu menetapkan schema kanonis dan melakukan migrasi secara terpisah. Jangan menjalankan migrasi database sebagai bagian dari setup frontend/API ini.

Alamat `https://personal-database.my.id` yang diberikan sebelumnya merespons Basic Auth pada root dan belum terverifikasi sebagai endpoint Postgres atau Supabase API. Jangan gunakan root URL itu sebagai connection string database.

## Urutan aktivasi

Setelah konfigurasi domain dan environment siap, deploy API VPS lebih dahulu, verifikasi `/api/health`, lalu deploy frontend Vercel. Uji CORS, login, halaman dashboard, dan request EA pada akun demo sebelum menghubungkan akun live. Jangan kirim secret melalui chat atau commit file environment lokal.

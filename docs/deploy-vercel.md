# Deploy MT5 Pilot ke Vercel

Panduan ini menyiapkan source untuk Vercel. Deploy belum dianggap siap dipakai untuk mengendalikan akun sampai autentikasi pemilik, database yang dapat dijangkau Vercel, EA, dan semua route diverifikasi.

## Build dan routing

Impor repository GitHub pada root repository (jangan memilih subfolder `client`). `vercel.json` menetapkan build command `pnpm build:vercel` dan output directory `public`. Script tersebut membangun React/Vite ke `public/`; Vercel menyajikan UI dan aset statis dari CDN. Root `index.ts` mengekspor aplikasi Express sebagai satu Node.js Function, sedangkan `server/_core/index.ts` tetap menjadi listener untuk development/Docker. Kode server tidak menjalankan `listen()` saat diekspor oleh root handler.

Saat ini dashboard hanya memiliki page route `/`, sehingga tidak dibutuhkan SPA catch-all rewrite. Hindari rewrite `/(.*)` karena bisa mengalihkan route `/api/*` atau route milik platform ke HTML. API dashboard, OAuth, telemetry EA, command polling/ack, dan health diharapkan ditangani Express Function; `express.static()` tidak dipakai untuk menyajikan UI di Vercel.

## Variabel environment

Atur pada Vercel Project Settings untuk environment yang diperlukan (Preview/Production). Jangan menaruh nilai sebenarnya di Git, issue, PR, log, atau chat. `.env.example` hanya berisi nama variabel kosong.

Pisahkan **build-time** dan **runtime**. Plugin frontend membangun `api/platform/config.js` saat build dan hanya menyalin whitelist `MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_API_URL`, serta `MANUS_API_BROWSER_KEY` ke bundle publik. Nilai-nilai publik itu harus tersedia pada Build Environment Vercel untuk setiap Preview/Production build yang memakainya; jangan pernah menaruh credential rahasia di sini. Environment runtime Function harus tersedia untuk requests: `MANUS_PROJECT_ID`, `MANUS_OAUTH_API_URL`, `MANUS_JWT_SECRET`, `MANUS_API_URL`, `MANUS_API_KEY`, `OWNER_OPEN_ID`, dan `DATABASE_URL`. `MANUS_PROJECT_ID` serta `MANUS_API_URL` muncul di kedua daftar karena digunakan bersama oleh browser dan backend; keduanya bukan pengganti secret API key.

| Variabel | Kegunaan |
|---|---|
| `DATABASE_URL` | URL MySQL untuk session/user, akun MT5, telemetry, command, dan audit. Gunakan database khusus yang dapat dijangkau dari Vercel; jangan asumsikan URL Manus managed DB dapat dipakai dari luar. |
| `MANUS_PROJECT_ID` | Identitas aplikasi untuk validasi sesi/OAuth backend; juga whitelisted pada konfigurasi browser saat build. Sediakan untuk build dan runtime. |
| `MANUS_OAUTH_API_URL` | Base URL API OAuth Manus yang dipakai backend. Redirect callback harus menerima host/domain Vercel yang dipakai. |
| `MANUS_JWT_SECRET` | Secret sesi server; buat nilai acak yang kuat dan unik untuk deployment Vercel. Jangan salin ke frontend atau Git. |
| `MANUS_API_URL` | Base URL Manus API; bukan secret, dipakai backend dan masuk whitelist browser saat build. Sediakan pada build dan runtime. |
| `MANUS_API_KEY` | Credential server-side yang dipakai backend saat menyelaraskan user. Runtime saja; jangan pernah dimasukkan ke whitelist frontend. |
| `OWNER_OPEN_ID` | Open ID akun pemilik yang tepat. Bila kosong atau tidak cocok, akses owner harus tetap ditolak (fail-closed). |
| `MANUS_OAUTH_PORTAL_URL` / `MANUS_API_BROWSER_KEY` | Nilai publik whitelisted untuk alur login browser; tersedia saat build Preview/Production agar masuk ke file config frontend. Jangan masukkan secret server ke field publik. |

## Database

Buat database MySQL terpisah untuk deployment Vercel, pastikan TLS/network access dan lokasi/region sesuai, kemudian jalankan migrasi SQL yang sudah ada secara berurutan terhadap database tersebut. Jangan menjalankan `pnpm db:migrate` dengan URL database Manus atau database lain yang berisi data produksi tanpa persetujuan dan backup. Build Vercel tidak menjalankan migrasi.

## Privasi dan OAuth

Pastikan project Vercel dan Preview deployments dibatasi bagi pemilik sebelum menggunakan UI. Perlindungan deployment Vercel dan owner gate aplikasi adalah dua lapis berbeda. Konfigurasikan `OWNER_OPEN_ID` setelah memastikan nilai persis milik akun pemilik. Daftarkan callback production yang tepat (`/api/oauth/callback`) dan uji login di origin Vercel. Akses dashboard/aksi trading tidak boleh dibuka kepada pengguna lain hanya karena mereka dapat membuka URL.

## Pemeriksaan sebelum rilis

Pastikan URL root mengembalikan `200` dengan `Content-Type: text/html` dan menampilkan dashboard, bukan file JavaScript. Pastikan `GET /api/health` mengembalikan JSON sukses; route `/api/trpc` hanya memberi akses sesuai sesi owner; endpoint EA menolak token invalid; login/cookie bekerja pada domain Vercel; pembacaan dan penulisan terkontrol bekerja pada database Vercel; manifest `/manus-routes.json` tetap JSON; dan kontrol tetap terkunci ketika owner belum terkonfigurasi atau akun EA offline. Setelah itu hubungkan EA milik pengguna, uji pada akun demo, lalu minta persetujuan pemilik sebelum promosi production.

Vercel secara resmi menjalankan Express sebagai Function dan menyajikan file statis dari `public/`; lihat [Express on Vercel](https://vercel.com/docs/frameworks/backend/express), [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Node.js Functions](https://vercel.com/docs/functions/runtimes/node-js), dan [vercel.json](https://vercel.com/docs/project-configuration/vercel-json).

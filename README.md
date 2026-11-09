# MT5 Pilot — PocketBase lokal

Dashboard Fast-Grid memakai Express API dan PocketBase. Untuk development keduanya dapat berjalan lokal; untuk publikasi, frontend/API berjalan di Vercel dan PocketBase tetap menjadi database persisten pada VPS ber-HTTPS. Browser login melalui Express proxy, bukan mengakses database langsung. Tidak diperlukan Supabase untuk runtime aplikasi.
## Deploy Vercel

Ikuti [docs/deploy-vercel.md](docs/deploy-vercel.md). Vercel memerlukan `POCKETBASE_URL` HTTPS, `POCKETBASE_SUPERUSER_EMAIL`, dan `POCKETBASE_SUPERUSER_PASSWORD` di Project Settings → Environment Variables. Jangan menyimpan credential VPS di Git. Setelah mengubah environment variables, lakukan redeploy.

Dashboard hanya menerima telemetry langsung dari MT5; tidak ada saldo atau transaksi sintetis. Aplikasi tidak mengklasifikasikan jenis akun atau mencegah EA dipasang pada jenis akun lain. Pastikan terminal MT5 yang dipilih benar sebelum memasang EA.

## Menjalankan lokal

1. Gunakan Node.js 22 dan pnpm. Unduh PocketBase untuk Windows dari [halaman rilis PocketBase](https://github.com/pocketbase/pocketbase/releases), lalu letakkan `pocketbase.exe` di folder yang mudah diakses.
2. Dari root repo, jalankan `pocketbase.exe serve --http=127.0.0.1:8090`, lalu buat superuser pertama melalui `http://localhost:8090/_/`. Data tersimpan di `pb_data/` dan tidak masuk Git.
3. Salin `.env.example` menjadi `.env`, lalu isi email/password superuser serta username/password owner dashboard. Gunakan password yang berbeda dan kuat.
4. Jalankan `pnpm install --frozen-lockfile`, lalu `pnpm pocketbase:setup`. Perintah ini membuat collections tertutup dan owner pertama.
5. Jalankan `pnpm dev`, lalu buka `http://localhost:3000`. Jika port 3000 sedang dipakai, jalankan `$env:PORT=3001; pnpm dev` di PowerShell.

Panel admin PocketBase tersedia di `http://localhost:8090/_/`. Jangan bagikan kredensial superuser. Gunakan backup PocketBase untuk menyalin atau memulihkan isi `pb_data/`.

## Akses web sementara dari internet

Quick Tunnel memublikasikan Express produksi saja. PocketBase tetap di `127.0.0.1:8090`, data `pb_data/` dan repo tetap di laptop. Login/refresh browser melewati dua route Auth terbatas pada Express; API record dan Admin API PocketBase tidak diteruskan ke tunnel.

Biarkan PocketBase berjalan, lalu di terminal repo:

```powershell
pnpm build
$env:NODE_ENV='production'; $env:PORT='3001'; pnpm exec node dist/index.js
```

Di terminal PowerShell lain, mulai tunnel:

```powershell
& "$env:LOCALAPPDATA\MT5Pilot\cloudflared.exe" tunnel --no-autoupdate --url http://127.0.0.1:3001
```

Buka URL `trycloudflare.com` yang muncul. URL Quick Tunnel bersifat publik dan berubah setiap tunnel dimulai ulang; siapa pun yang memilikinya dapat mencapai halaman login, tetapi dashboard tetap memerlukan akun. Hentikan server dan tunnel dengan `Ctrl+C` saat selesai. Ini untuk uji sementara, bukan hosting dengan jaminan uptime.

## Menghubungkan akun MT5

1. Masuk dengan username dan password owner lokal. Owner dapat membuat akun read-only/staff dari menu pengguna.
2. Pilih **Tambah EA** dan simpan token yang ditampilkan satu kali.
3. Buka `ea/Fast-Grid-Pilot.mq5` di MetaEditor, compile, lalu isi `PilotApiUrl` dengan URL API yang ditampilkan dashboard dan `EAConnectionToken` dengan token tersebut.
4. Di MetaTrader → Tools → Options → Expert Advisors, izinkan WebRequest ke origin dashboard, misalnya `http://localhost:3000`.
5. Cocokkan nama akun, login, server, saldo, dan equity dengan terminal sebelum melanjutkan.

**Penting:** kartu baru disetel ke **AUTO** dan memiliki command AUTO awal. Saat EA tersambung, ia dapat mulai membuka posisi sesuai konfigurasi. Pilih MANUAL jika tidak ingin entry otomatis dan periksa parameter risiko sebelum menghubungkan akun real. Mode yang tersimpan dipulihkan saat EA polling atau tersambung ulang.

Jika MetaTrader berada di komputer lain, server aplikasi dan PocketBase harus dapat dijangkau melalui LAN; gunakan alamat IP komputer server, bind PocketBase ke alamat LAN, dan atur firewall dengan hati-hati. Jangan membuka PocketBase ke internet tanpa TLS, autentikasi jaringan, dan konfigurasi reverse proxy yang benar.

## Catatan migrasi

Kode dan migrasi di `supabase/` dipertahankan sebagai arsip, tetapi tidak dipakai oleh runtime lokal. Data Supabase dan password login lama tidak otomatis dipindahkan. Buat ulang akun di PocketBase; ekspor data lama secara terpisah sebelum menutup project Supabase.

## Pengembangan

- `pnpm pocketbase:setup` menyiapkan collections dan owner dari variabel `.env`.
- `pnpm check` menjalankan pemeriksaan TypeScript.
- `pnpm test` menjalankan test aplikasi.
- `pnpm build` membangun frontend dan server.

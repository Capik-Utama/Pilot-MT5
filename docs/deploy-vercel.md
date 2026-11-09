# Deploy MT5 Pilot ke Vercel

Frontend dan Express API berjalan pada Vercel; PocketBase tetap berjalan dengan data persisten pada VPS melalui HTTPS. File `api/[...path].ts` mengadaptasi Express app ke Vercel Functions. Browser hanya mengakses endpoint Auth yang diproksikan oleh Express; collection dan Admin API PocketBase tidak dibuka ke browser.

## Konfigurasi Vercel

1. Hubungkan repository `Pilot-MT5` ke Vercel pada root repository.
2. Build command: `pnpm build:vercel`.
3. Output directory: `public`.
4. Tambahkan environment variables pada Vercel Project Settings → Environment Variables:
	- `POCKETBASE_URL=https://personal-database.my.id` (origin saja, tanpa `/_/`).
	- `POCKETBASE_SUPERUSER_EMAIL` dan `POCKETBASE_SUPERUSER_PASSWORD` untuk akun superuser PB. Isi langsung di dashboard Vercel; jangan commit atau kirim nilainya melalui chat.
5. Redeploy agar environment variables digunakan. Pastikan `/api/health` mengembalikan `200` dan login/dashboard berfungsi.

PocketBase harus memiliki sertifikat HTTPS valid dan dapat dijangkau dari Vercel. Batasi akses port PocketBase ke reverse proxy dan jangan mengekspos port database secara langsung. Halaman Admin PB `/_/` sebaiknya dibatasi dengan firewall atau Cloudflare Access. Buat backup `pb_data` secara berkala.

`POCKETBASE_SUPERUSER_PASSWORD` yang pernah digunakan pada setup lokal sebaiknya dirotasi sebelum ditambahkan ke Vercel. Kredensial Vercel hanya digunakan server-side.

## Keselamatan EA

Koneksi EA baru disetel AUTO dan menerima command AUTO awal. Tinjau risiko trading, simbol, lot, Magic Number, batas rugi, dan target; uji pada akun demo sebelum menghubungkan akun live.
# Deployment lokal

Arsitektur PocketBase memerlukan PocketBase dan server Express yang berjalan terus-menerus. Deployment frontend statis di Vercel tidak didukung karena browser, dashboard API, dan MetaTrader harus dapat menjangkau server lokal.

Ikuti instruksi setup lokal di README. Untuk akses dari komputer lain di LAN, gunakan IP server, batasi port dengan firewall, dan jangan mengekspos PocketBase atau HTTP tanpa TLS ke internet.

Koneksi EA baru sengaja disetel AUTO dan menerima command AUTO awal. Tinjau risiko trading, simbol, lot, Magic Number, batas rugi, dan target sebelum menghubungkan akun.

# Deploy MT5 Pilot ke Vercel

Frontend dan Express API berjalan pada Vercel; PocketBase tetap berjalan dengan data persisten pada VPS melalui HTTPS. File `api/[...path].ts` mengadaptasi Express app ke Vercel Functions. Browser hanya mengakses endpoint Auth yang diproksikan oleh Express; collection dan Admin API PocketBase tidak dibuka ke browser.

## Konfigurasi Vercel

1. Hubungkan repository `Pilot-MT5` ke Vercel pada root repository.
2. Build command: `pnpm build:vercel`.
3. Output directory: `public`.
4. Tambahkan environment variables pada Vercel Project Settings → Environment Variables:
	- `POCKETBASE_URL=https://personal-database.my.id` (origin saja, tanpa `/_/`).
	- `POCKETBASE_SUPERUSER_EMAIL` dan `POCKETBASE_SUPERUSER_PASSWORD` untuk akun superuser PB. Isi langsung di dashboard Vercel; jangan commit atau kirim nilainya melalui chat.
5. Jika host database baru belum memiliki collection Pilot, jalankan `pnpm pocketbase:setup` sekali dengan variabel superuser PocketBase dan kredensial owner yang disimpan lokal di `.env` (jangan masukkan rahasia di GitHub atau chat). Skrip menyiapkan collection dan membuat owner hanya jika akun tersebut belum ada.
6. Redeploy agar environment variables digunakan. Buka `https://<domain-aplikasi>/api/health`; status harus `200` dengan `checks.superuser`, `checks.usersAuth`, dan semua collection bernilai `true`.

## Setelah database dipindah

- Mengubah URL saja tidak memindahkan data. Pastikan server PocketBase baru menggunakan salinan/pemulihan `pb_data` yang benar. Jika database baru kosong, jalankan `pnpm pocketbase:setup` untuk membuat skema dan owner, lalu buat ulang pengguna lain melalui owner.
- Jika sumber lama adalah Supabase, akun dan passwordnya tidak otomatis dapat dipakai di PocketBase. Buat akun PocketBase baru atau reset password pengguna di PocketBase.
- Login menerima username atau email. Username tanpa `@` dicoba sebagai email internal `<username>@pilot-mt5.local`; alamat email yang diketik digunakan apa adanya. Akun yang dibuat oleh skrip setup mengikuti format ini.
- `503` dari `/api/health` berarti pemeriksaan superuser, konfigurasi auth `users`, atau collection belum lolos. Cek Environment Variables Vercel untuk salah eja/lingkungan yang belum dipilih (`Production`/`Preview`), lalu redeploy. Kode sekarang menolak URL PocketBase yang berisi halaman admin/path dan tidak lagi diam-diam memakai localhost di Vercel.
- Jika health `200` tetapi login ditolak, verifikasi bahwa akun berada di database baru, collection auth bernama `users`, password benar, dan email/username sesuai format di atas. Jangan mengirim token atau password ke endpoint publik.

PocketBase harus memiliki sertifikat HTTPS valid dan dapat dijangkau dari Vercel. Batasi akses port PocketBase ke reverse proxy dan jangan mengekspos port database secara langsung. Halaman Admin PB `/_/` sebaiknya dibatasi dengan firewall atau Cloudflare Access. Buat backup `pb_data` secara berkala.

`POCKETBASE_SUPERUSER_PASSWORD` yang pernah digunakan pada setup lokal sebaiknya dirotasi sebelum ditambahkan ke Vercel. Kredensial Vercel hanya digunakan server-side.

## Keselamatan EA

Koneksi EA baru disetel AUTO dan menerima command AUTO awal. Tinjau risiko trading, simbol, lot, Magic Number, batas rugi, dan target; uji pada akun demo sebelum menghubungkan akun live.
# Deployment lokal

Arsitektur PocketBase memerlukan PocketBase dan server Express yang berjalan terus-menerus. Deployment frontend statis di Vercel tidak didukung karena browser, dashboard API, dan MetaTrader harus dapat menjangkau server lokal.

Ikuti instruksi setup lokal di README. Untuk akses dari komputer lain di LAN, gunakan IP server, batasi port dengan firewall, dan jangan mengekspos PocketBase atau HTTP tanpa TLS ke internet.

Koneksi EA baru sengaja disetel AUTO dan menerima command AUTO awal. Tinjau risiko trading, simbol, lot, Magic Number, batas rugi, dan target sebelum menghubungkan akun.

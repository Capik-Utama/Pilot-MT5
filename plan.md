# MT5 Pilot — Rencana implementasi

## Ruang lingkup
Aplikasi dashboard web privat untuk pemilik, mengelola beberapa akun MT5 yang akan mengirim telemetry melalui EA, menampilkan status akun, dan mengantrikan perintah kontrol untuk diambil serta diakui oleh EA. Tidak ada koneksi langsung dari browser ke MT5 dan tidak menyimpan kata sandi broker. Sampai EA dipasang dan mengirim data, aplikasi harus memperlihatkan keadaan belum terhubung, bukan angka simulasi. Tombol kontrol harus nonaktif ketika akun belum online.

## Arsitektur implementasi
- **Frontend:** React/Vite yang sudah tersedia di `client/`. Satu halaman dashboard responsif menggunakan komponen panel akun, ringkasan konektivitas, status mode EA, timestamp pembaruan, indikator data basi, dan tombol tindakan per akun. Pembaruan UI melalui query berkala singkat agar cocok dengan backend dan database terkelola.
- **Backend:** Express/tRPC yang tersedia di `server/`. Prosedur aplikasi dibatasi ke identitas pemilik yang telah login; endpoint HTTP terpisah untuk EA menerima telemetry, menawarkan antrian perintah, dan menerima acknowledgement. Endpoint EA memakai token acak per akun, diverifikasi dengan hash yang disimpan di database. Token penuh tidak pernah dikirim ke frontend kecuali sekali ketika akun dibuat.
- **Persistensi:** MySQL/Drizzle bawaan. Tabel akun menyimpan label, identitas nonrahasia, hash token, penanda telemetry pertama, status EA, dan snapshot terbaru; tabel perintah menyimpan target akun, jenis tindakan, ID unik, waktu, status, hasil, dan kedaluwarsa. Tabel event perintah mencatat transisi status secara append-only melalui aplikasi. Perubahan skema dibuat sebagai migrasi aditif. Tidak ada password trading yang disimpan.
- **Alur kontrol:** UI mengirim perintah terikat pada akun spesifik; tindakan penutupan meminta konfirmasi. Perintah memiliki ID unik dan tenggat, tidak dieksekusi oleh server. EA mengambil perintah melalui polling HTTP dan mengirim acknowledgement untuk status diterima/selesai/gagal. Dashboard menyajikan siklus antrean, pengiriman, konfirmasi, kegagalan, dan kedaluwarsa. Pengiriman perintah bukan bukti bahwa broker telah mengeksekusinya.
- **Real-time:** EA mengirim heartbeat/telemetry secara periodik dan menarik perintah melalui HTTP; browser membaca snapshot dan status terbaru secara periodik. Status online diturunkan dari heartbeat yang segar, sedangkan keterlambatan ditandai sebagai basi/offline. Latensi total bergantung pada interval EA, jaringan, server, dan broker sehingga tidak dijanjikan sebagai eksekusi seketika.
- **Privasi:** Manus OAuth yang disediakan starter menjadi login aplikasi. Prosedur dashboard harus menolak identitas selain pemilik yang dikonfigurasi, gagal tertutup jika identitas pemilik belum diatur, dan menyembunyikan kontrol sampai sesi sah. Visibilitas proyek harus tetap owner-only sebelum dipakai; visibilitas proyek adalah pengaturan platform terpisah dari login aplikasi.

## Target deployment via Vercel
- Vercel saat ini menerima commit GitHub, tetapi respons domain yang diperiksa adalah JavaScript (`application/javascript`) alih-alih HTML halaman dashboard; check sukses saja belum membuktikan situs siap diakses.
- Vite menghasilkan UI sebagai aset statis ke direktori root `public/` pada perintah build khusus Vercel. Direktori itu menjadi output CDN Vercel; `express.static()` tidak dipakai untuk menyajikan UI di Vercel.
- Root `index.ts` baru mengekspor Express app sebagai default tanpa membuka port. `server/_core/app.ts` berbagi registrasi middleware dan API; `server/_core/index.ts` tetap menjalankan listener untuk development/Docker.
- `vercel.json` menetapkan `buildCommand` dan `outputDirectory`. Endpoint HTTP EA, OAuth, tRPC, dan health berjalan melalui satu Express Function; tidak menambahkan rewrite catch-all yang dapat menimpa endpoint API/platform.
- Vercel memerlukan environment variable runtime yang sesuai untuk database MySQL, Manus OAuth/sesi, dan `OWNER_OPEN_ID`; file `.env`, URL database, token, atau key tidak masuk Git. Manus managed `DATABASE_URL` tidak diasumsikan dapat dijangkau Vercel; ketersediaan jaringan/TLS, migrasi skema, region, dan backup perlu dipastikan sebelum trafik produksi.
- Jangan mempromosikan build produksi sebelum halaman root menyajikan `text/html`, API health aktif, akses owner-only teruji, login OAuth sesuai host Vercel, dan database eksternal siap. Vercel connector/OAuth belum terotorisasi pada sesi ini; branch Preview dapat memberi bukti build tanpa menggantikan pemeriksaan variabel rahasia/privasi produksi.

## Struktur proyek
- `client/src/pages/Home.tsx`: layar dashboard, keadaan kosong, daftar akun, dan dialog konfirmasi/perintah.
- `client/src/index.css`: sistem warna terminal gelap, tipografi monospasi, status warna, dan responsivitas.
- `index.ts` (baru): default export Express app untuk serverless Function Vercel; tidak memanggil `listen()`.
- `server/_core/app.ts` (baru): konfigurasi middleware dan route Express yang dipakai bersama.
- `server/routers.ts`: API owner untuk membaca akun, membuat koneksi/token, dan membuat perintah.
- `server/mt5.ts` (modul baru): validasi skema input, hashing token, autentikasi EA, operasi akun/telemetry/perintah/ack.
- `server/_core/index.ts`: listener development/Docker yang memanggil route bersama dan memilih Vite/static lokal.
- `server/db.ts` serta `drizzle/schema.ts` dan `drizzle/`: persistensi dan migrasi database.
- `shared/`: skema dan tipe umum yang dibutuhkan frontend/server.
- `client/public/manus-routes.json`: deklarasi rute halaman web.
- `vercel.json` (baru): build frontend dan deklarasi output statis Vercel.
- `docs/deploy-vercel.md` (baru): prasyarat, environment variable, dan langkah setup/validasi Vercel.
- `docs/mt5-ea-api.md`: kontrak HTTP untuk pembuatan EA MQL5 berikutnya.
- `plan.md` dan `TODO.md`: keputusan desain/implementasi serta status outcome.

## Desain
Tiga arah langka yang dipertimbangkan (probabilitas sampel dari ekor distribusi): **Terminal Presisi (0,03)**, terminal padat dan teknis dengan latar gelap, angka monospasi, dan aksen cyan; **Kokpit Taktis (0,07)**, panel modular dengan aksen amber; **Ledger Tenang (0,05)**, buku besar finansial terang dan lega. Blueprint memilih **Terminal Presisi**.

- **Gerakan desain:** estetika terminal trading kontemporer yang presisi, hemat ornamen, dan mengutamakan data operasional.
- **Prinsip inti:** status terbaca sekilas; angka memiliki hierarki jelas; tindakan risiko dibedakan; tidak pernah memalsukan konektivitas atau hasil order.
- **Filosofi warna:** dasar biru-hitam memberi kontras tenang; cyan sebagai identitas koneksi aktif dan fokus; hijau/merah hanya untuk status sukses/risiko; abu-abu untuk data belum tersedia.
- **Paradigma tata letak:** pita status terminal di bagian atas, ringkasan metrik horizontal, lalu daftar akun sebagai panel operasional lebar dengan area tindakan yang jelas.
- **Elemen khas:** garis koneksi seperti oscilloscope; badge status berbentuk LED kecil; panel perintah dengan garis tepi berwarna sesuai konsekuensi.
- **Interaksi:** kontrol selalu menjelaskan akun target; aksi tutup posisi meminta konfirmasi; aksi tidak dapat diklik pada akun offline; status setiap perintah tetap terlihat.
- **Animasi:** transisi halus 120–180 ms untuk perubahan status dan panel; pulse ringan hanya saat heartbeat aktif; tanpa animasi berkedip atau mengganggu angka.
- **Tipografi:** IBM Plex Mono sebagai font utama untuk data dan label, dengan fallback monospace sistem; ukuran heading ringkas dan angka metrik besar.
- **Esensi merek:** panel kendali pribadi untuk memantau EA MT5 dengan visibilitas status dan perintah yang dapat ditelusuri; sifat: presisi, tenang, tegas.
- **Suara merek:** ringkas, faktual, tanpa klaim eksekusi yang belum dikonfirmasi. Contoh: “EA terhubung · pembaruan 0,8 dtk lalu.” dan “Perintah diterima EA — menunggu hasil.”
- **Wordmark/logo:** wordmark “MT5 / PILOT” dengan tanda lintasan sinyal dua garis yang bertemu pada titik koneksi.
- **Warna merek:** cyan elektrik `#22D3EE` di atas dasar terminal `#08111F`.

## Batasan penting
Aplikasi ini menyediakan antarmuka dan backend koordinasi perintah; aplikasi tidak mengakses terminal MT5 secara langsung. Eksekusi nyata baru dapat dilakukan EA setelah EA dibuat, dikonfigurasi di MT5, token akun dipasang, WebRequest diizinkan di MT5, dan pengguna menguji alurnya pada akun demo terlebih dahulu. Tidak ada jaminan latency sub-detik atau eksekusi tepat sekali pada kegagalan jaringan; EA perlu deduplikasi ID perintah dan melaporkan hasil aktual.

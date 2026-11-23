# TODO Migrasi Pilot-MT5 ke Manus

## [ ] Autentikasi email/password lokal, Manus OAuth, dan role akses

- Halaman login menyediakan email+password dan tombol Manus OAuth; kedua jalur memakai cookie/sesi aplikasi yang sama dan role/scope tetap diperiksa server-side.
- Owner dapat membuat akun staff/read-only langsung dengan email+password, mengatur ulang password pengguna, serta menyetel password lokalnya sendiri; tidak ada sign-up publik.
- Password minimal 12 karakter disimpan hanya sebagai hash scrypt bersalt; tidak pernah dikirim kembali ke browser, dicatat di log, atau disimpan plaintext. Login menampilkan pesan generik dan membatasi percobaan berulang.
- Owner, staff, dan read-only dapat login dengan email+password tanpa memiliki akun Manus. Manus OAuth tetap tersedia dan dapat memakai akses yang sama bila email terverifikasi cocok.
- Owner awal tetap diamankan oleh bootstrap Manus OAuth yang sudah ada; setelah owner menyetel password lokal, Manus tidak wajib untuk login berikutnya.
- Owner dapat mencabut atau mengubah role sesuai kontrol yang tersedia di aplikasi.
- Read-only dapat melihat dashboard/log semua akun owner tetapi tidak dapat membuat EA, mengubah konfigurasi, menghapus akun, mengelola pengguna, atau mengirim command; staff hanya dapat melihat/mengelola log pada akun yang ditugaskan.
- Staff hanya dapat menjalankan command pada akun yang ditugaskan; staff tidak dapat mengubah konfigurasi, pengguna, atau akun koneksi.
- Pengguna/password lama Supabase tidak dianggap termigrasi; data akses lama perlu diprovisi ulang.

## [ ] Dashboard telemetry dan manajemen akun EA

- Dashboard menampilkan telemetry MT5 yang benar-benar diterima dari EA, termasuk identitas broker/login/server, saldo, equity, currency, profit harian, floating profit, floating maksimum/drawdown per sisi, posisi terbuka, mode/status EA, koneksi, heartbeat, dan latency.
- Tidak menampilkan saldo atau transaksi sintetis sebagai data nyata.
- Owner dapat membuat koneksi EA dengan token acak berentropi tinggi; token mentah hanya ditampilkan sekali, sedangkan server hanya menyimpan hash dan token hint.
- Owner dapat mencari/filter akun, menyegarkan dashboard, mengubah label, mengubah preferensi UI yang didukung, mengatur interval refresh lokal, mengedit konfigurasi EA, mengatur interval telemetry dan polling command per akun dari kartu, serta menghapus koneksi dengan konfirmasi.
- Data kosong/offline ditampilkan secara jelas ketika akun belum menerima telemetry atau heartbeat kedaluwarsa.

## [ ] Kontrol dan audit antrean trading

- Aksi Auto, Manual, BUY, SELL, Reset, Close Buy, Close Sell, dan Close All memakai akun yang dipilih; command hanya dapat dikirim sesuai role, assignment staff, dan status online.
- Command memiliki status queued, delivered, accepted, succeeded, failed, atau expired; masa berlaku, acknowledgement, hasil ringkas, dan event audit disimpan.
- Command close hanya menargetkan simbol chart/Magic Number Fast-Grid dan mengalihkan EA ke Manual sesuai perilaku EA yang didokumentasikan.
- Koneksi remote baru tanpa mode tersimpan memulai dalam mode MANUAL; AUTO hanya aktif setelah perintah eksplisit dari dashboard/chart. Pada setiap OnInit/restart, EA mengambil mode terakhir dari server sebelum telemetry pertama; jika mode server tidak bisa dibaca, EA tetap MANUAL dan tidak menimpa mode tersimpan dengan telemetry default. Jika poll startup memuat perintah AUTO/MANUAL/Close yang masih antre, perintah eksplisit tersebut diproses lebih dahulu daripada mode lama yang tersimpan.
- Mode AUTO yang sebelumnya diakui server tetap AUTO setelah EA diinisialisasi ulang. Perintah MANUAL atau Close eksplisit tetap memindahkan EA ke MANUAL; Close tidak memulihkan AUTO secara otomatis.
- Dashboard menunjukkan status proses dan tidak menyatakan order berhasil hanya karena perintah telah masuk antrean.
- Selama pengembangan/pengujian Manus, tidak menghubungkan EA ke broker live atau mengirim order nyata.

## [ ] API MT5 aman tanpa Supabase

- EA mengirim telemetry, mengambil polling command/config, dan mengirim acknowledgement melalui endpoint HTTPS pada host Manus; source EA dan panduan setup menggunakan URL tersebut sebagai input yang dapat dikonfigurasi.
- Token EA diverifikasi dengan hash; semua endpoint EA memvalidasi payload, mengisolasi akun berdasar token, tidak membocorkan rahasia, dan menerapkan timeout/expiry/idempotensi serta transisi status yang sah.
- Endpoint dashboard memverifikasi Manus OAuth dan role/scoping di server; tidak mempercayai role yang dikirim browser.
- Perintah dashboard ditolak jika akun tidak online, role/scope tidak cocok, atau ada command aktif yang bertentangan.

## [ ] Database dan pemindahan logika backend

- Semua tabel aplikasi tersimpan di database MySQL terkelola Manus dengan migrasi Drizzle yang berulang aman dan terdokumentasi.
- Logika dashboard dan EA dari Supabase Edge Function dipindahkan ke Express/TypeScript; fitur tidak bergantung pada Supabase client, SDK, JWT, Edge Functions, RLS, atau Realtime.
- Data baru bertahan di database Manus setelah aplikasi dimulai ulang/publish ulang; pengujian tidak memasukkan record keuangan fiktif.
- Data/akun lama dari Supabase tidak dimigrasikan tanpa backup/export dan sumber akses yang sah; status keterbatasan dinyatakan di dokumentasi.

## [ ] Build, publikasi, dan panduan operasi Manus

- Frontend dan API menggunakan satu proyek Manus; endpoint API same-origin dan health `/api/health` mengembalikan sukses tanpa login.
- Tidak ada ketergantungan runtime pada GitHub, Vercel, Supabase, Appwrite, server VPS pengguna, atau alamat proyek lama; tidak menyimpan service secret di bundle browser.
- Proyek lolos pemeriksaan TypeScript, build dan tes yang tersedia; publikasi dilakukan melalui Manus setelah perubahan tersimpan sebagai checkpoint Manus.
- Deployment awal menggunakan hosting Manus on-demand/Autoscale; tidak mengaktifkan always-on atau auto-publish tanpa persetujuan terpisah.
- Dokumentasi menjelaskan login/role, pembuatan token dan setup EA, URL HTTPS Manus yang dipakai, allow-list WebRequest MT5, perilaku koneksi, biaya pemakaian yang perlu dipantau, backup data, dan kewajiban compile/update EA sebelum mengalihkan koneksi.

## [ ] Pemulihan ketika pemeriksaan akses tidak merespons

- Jika pemeriksaan role `/api/mt5/dashboard/session` tidak mendapat jawaban dalam 15 detik, dashboard membatalkan request, menghentikan loading, dan menampilkan pesan pemulihan dalam bahasa Indonesia.
- Pengguna dapat mencoba ulang pemeriksaan akses atau keluar; layar “MEMERIKSA AKSES MT5 PILOT” tidak boleh menggantung tanpa batas.

## [ ] Pemeriksaan akses stabil setelah Manus OAuth

- Setelah sesi Manus valid, pemeriksaan role hanya berjalan saat identitas sesi berubah atau pengguna memilih coba lagi; render dashboard biasa tidak boleh mengulang pemeriksaan dan mengosongkan role.
- Setelah role sah diterima, header, menu, konten akun, dan navigasi dashboard harus tetap tampil agar owner dapat membuka menu dan menambah EA.

## [ ] Refresh adaptif kartu beranda dan angka Running/Profit

- Jika daftar kartu EA kosong, halaman memeriksa ulang daftar setiap 5 detik.
- Jika kartu menampilkan EA yang sudah mengirim telemetry, angka Running dan Profit diperbarui melalui polling ringan setiap 500 ms, tanpa memuat ulang detail kartu, command, atau log pada frekuensi itu.
- Angka mengikuti telemetry nyata EA dan tetap menampilkan placeholder sampai telemetry diterima; tidak membuat data sintetis.
- Parameter EA dan kartu per akun menyediakan pengiriman telemetry default 500 ms serta polling command default 1000 ms; nilai server disimpan per akun dan disinkronkan ke EA. Perubahan input EA eksplisit dikirim ke Pilot; pengaturan kartu juga diterapkan pada polling berikutnya.
- Setelah mengganti source `.mq5`, pengguna harus compile ulang dan mengganti `.ex5` di terminal MT5 agar cadence baru berlaku. Runtime nyata dapat lebih lambat daripada interval target karena jadwal terminal dan latensi WebRequest.
- Jika telemetry dan polling perintah sama-sama jatuh tempo, telemetry dikirim lebih dulu. Pada 500 ms, WebRequest sinkron dapat menunda perintah kontrol sampai 3 detik saat request telemetry lambat; volume telemetry per EA kira-kira dua kali cadence 1 detik, sehingga biaya API/database perlu dipantau.

# Panduan operasi MT5 Pilot

## Batas migrasi

Arsitektur target saat ini adalah frontend statis Vercel dan Express API pada VPS. Kode aplikasi masih menggunakan MySQL melalui Drizzle. Migrasi ke Supabase/PostgreSQL VPS belum dilakukan; migration lama di `supabase/migrations` belum direkonsiliasi dengan model aktif aplikasi.

Jangan mengisi connection string PostgreSQL atau menjalankan migrasi sampai driver, schema, query, autentikasi, dan strategi data disiapkan pada fase migrasi tersendiri. Database Supabase VPS yang masih kosong tidak otomatis menerima daftar akun MT5, konfigurasi, atau histori yang mungkin berasal dari sumber lain. Dashboard hanya menampilkan metrik setelah telemetry EA diterima.

## Login dan role

1. Masuk melalui tombol login Manus dengan akun yang emailnya sama dengan nilai `PILOT_OWNER_EMAIL` yang telah disimpan sebagai secret proyek. Identitas cocok pertama kali akan menjadi owner; klaim owner tidak dibuka untuk pengunjung lain.
2. Jika akun Manus lain mendapat penolakan akses, owner dapat menambahkan email OAuth orang tersebut dari **Kelola pengguna**. Read-only dapat melihat dashboard dan log semua akun. Staff hanya mendapat akun yang dipilih dan hanya dapat menjalankan command pada akun itu.
3. Cabut akses melalui **Kelola pengguna** bila dibutuhkan. Pengguna harus memakai akun Manus dengan email yang sama persis setelah normalisasi huruf besar/kecil.

## Menghubungkan Fast-Grid EA

1. Kompilasi `ea/Fast-Grid-Pilot.mq5` di MetaEditor ke `.ex5` setelah meninjau source. Periksa tab Errors sebelum memasang EA.
2. Login owner ke MT5 Pilot dan buat koneksi. Salin token yang ditampilkan satu kali; server menyimpan hash token, bukan token mentah. Jika token hilang, cabut koneksi lama lalu buat koneksi baru.
3. Pada parameter EA, set `PilotApiBaseUrl` persis ke alamat API yang ditampilkan pada dialog koneksi (`https://<host-api>/api/mt5`) dan isi `EAConnectionToken` dengan token tersebut. Interval default EA adalah `InputPengirimanInfoKePilotMs=500` dan `InputPengecekanPerintahPilotMs=1000`; jangan menambahkan `?route=` atau mengirim token ke orang lain.
4. Di MetaTrader, buka **Tools → Options → Expert Advisors**, aktifkan izin WebRequest, dan masukkan hanya origin HTTPS API yang ditampilkan aplikasi (contoh bentuk: `https://<host-api>`), bukan path `/api/mt5`.
5. Gunakan akun demo dahulu. Periksa login/server MT5, simbol, mode Beli/Jual, lot, batas kerugian, target, Magic Number, dan semua parameter risiko.

Koneksi EA remote baru dimulai dalam mode **MANUAL**. Setelah **AUTO** diaktifkan secara eksplisit dari chart/dashboard dan tersimpan di server, EA membaca mode tersebut lagi sebelum telemetry pertama setiap kali di-restart/re-attach. Perintah AUTO/MANUAL/Close yang sudah antre saat startup diproses lebih dahulu daripada mode lama di server; jika poll pertama gagal atau mode tidak bisa dipastikan, EA bertahan **MANUAL** dan tidak menulis state default ke server. Bila server saat ini menyimpan MANUAL (misalnya pernah tertimpa oleh EA versi lama), tekan AUTO sekali lagi. Perintah MANUAL dan perintah Close eksplisit tetap memindahkan EA ke MANUAL demi mencegah entry ulang otomatis setelah penutupan. AUTO dapat melanjutkan pembukaan posisi setelah restart; uji di akun demo dahulu. Selama migrasi dan validasi Manus, EA tidak dipasang ke akun broker live dan tidak ada order nyata yang dikirim.

## Polling, status, dan keamanan

- Default telemetry EA adalah 500 ms, polling perintah 1000 ms, dan Running/Profit kartu diperbarui setiap 500 ms setelah telemetry tersedia. Waktu aktual dapat lebih lambat karena jadwal terminal, latensi jaringan, serta WebRequest sinkron.
- Owner dapat mengubah kedua interval per akun melalui pengaturan pada kartu EA; EA juga menyediakan input yang sama. Akun baru mengambil input EA sebagai nilai awal; akun lama mempertahankan nilai server. Setelah input pertama tercatat, perubahan input EA berikutnya dikirim ke server. Perubahan terakhir dari EA atau kartu menjadi konfigurasi tersimpan dan diterapkan pada polling berikutnya.
- Pada interval default, satu EA yang selalu aktif dapat menghasilkan sekitar 172.800 request telemetry dan 86.400 polling perintah per hari (259.200 request gabungan); dashboard terbuka juga meminta metrik sekitar dua kali per detik. Angka aktual dapat lebih rendah karena latensi/request sinkron. Pantau pemakaian API, database, dan tagihan Manus.
- Jika telemetry dan polling perintah sama-sama jatuh tempo, EA mengirim telemetry lebih dulu. Karena WebRequest sinkron dengan timeout 3 detik, perintah remote seperti MANUAL/Close dapat tertunda sampai request telemetry selesai; prioritas ini dipilih untuk akun demo.
- Pada startup, perintah mode eksplisit AUTO/MANUAL/Close yang sudah antre diproses sebelum telemetry dan mendahului mode tersimpan yang lama. Perintah baru tetap bergantung pada interval polling dan latensi jaringan; remote MANUAL/Close bukan tombol emergency stop instan.
- Setelah mengubah source `.mq5`, compile ulang di MetaEditor dan ganti file `.ex5` yang sedang dipakai terminal MT5. Server Manus tidak dapat memperbarui EA yang sudah berjalan di komputer pengguna.
- Status online memakai heartbeat maksimal 20 detik. API tidak menerima command bila EA offline atau heartbeat kedaluwarsa.
- Command berjalan melalui queued → delivered → accepted → succeeded/failed; antrean kedaluwarsa setelah batas waktu yang ditetapkan server. Kartu menampilkan status, tetapi “queued” bukan bukti order selesai.
- Token EA dirahasiakan, disimpan sebagai hash di server, dan setiap token hanya memberi akses ke akun yang terikat padanya. Jangan menaruh token atau rahasia server di screenshot/log.
- Menghapus koneksi mencabut token pada server dan menghapus histori command/audit milik akun tersebut. Lepas juga EA dari chart MT5 secara manual; API tidak dapat menghentikan terminal MT5 dari jarak jauh.

## Operasi hosting dan database

Frontend statis dipublikasikan oleh Vercel. Express API berjalan terus-menerus pada VPS dan harus berada di belakang reverse proxy HTTPS; health check tanpa autentikasi tersedia di `/api/health`. Konfigurasikan CORS dengan origin frontend yang tepat. Host API dan port database internal tidak boleh dibuka langsung tanpa kebutuhan dan perlindungan yang sesuai.

Database aplikasi masih memakai MySQL sesuai schema aktif. Migrasi ke Supabase/PostgreSQL VPS ditunda dan perlu dilakukan sebagai perubahan terpisah setelah schema dan driver aplikasi direkonsiliasi. Jangan menjalankan `pnpm db:migrate` atau `pnpm db:push` untuk menyiapkan deployment frontend/API ini. Simpan backup sebelum fase migrasi dan validasi pada lingkungan non-live.

## Pemecahan masalah

- **Login berhasil tetapi akses ditolak:** cek `PILOT_OWNER_EMAIL` untuk owner pertama; pengguna lain harus diundang dengan email Manus yang benar.
- **Tidak ada telemetry:** periksa `PilotApiBaseUrl`, token, izin WebRequest untuk origin API VPS, koneksi internet terminal, CORS/reverse proxy, dan status EA. Token yang dicabut tidak dapat dipakai lagi.
- **EA offline:** heartbeat melewati 20 detik atau EA belum mengirim telemetry. Jangan mengirim command trading sampai status online dan identitas akun benar.
- **Command kedaluwarsa:** cek koneksi MT5, WebRequest/allow-list dan Journal MT5. Jangan kirim ulang BUY/SELL sebelum memastikan tidak ada posisi/order yang sudah berubah.
- **Konfigurasi belum terkonfirmasi:** tunggu telemetry EA yang mencerminkan konfigurasi baru dan cek log aktivitas sebelum mengulang.

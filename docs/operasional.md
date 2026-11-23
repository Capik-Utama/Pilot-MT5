# Panduan operasi MT5 Pilot

## Batas migrasi

Aplikasi memakai Manus OAuth, API Express same-origin, serta MySQL terkelola Manus. GitHub, Vercel, Supabase, Appwrite dan VPS pengguna tidak dipakai sebagai layanan runtime. Proyek Manus menggunakan penyimpanan/checkpoint internal Manus.

Database Manus baru tidak membawa isi project Supabase lama. User/password Supabase, daftar akun MT5, konfigurasi dan histori lama tidak otomatis termigrasi. Jangan menganggap nilai kosong/`—` sebagai data nyata; dashboard hanya menampilkan metrik setelah telemetry EA diterima.

## Login dan role

1. Masuk melalui tombol login Manus dengan akun yang emailnya sama dengan nilai `PILOT_OWNER_EMAIL` yang telah disimpan sebagai secret proyek. Identitas cocok pertama kali akan menjadi owner; klaim owner tidak dibuka untuk pengunjung lain.
2. Jika akun Manus lain mendapat penolakan akses, owner dapat menambahkan email OAuth orang tersebut dari **Kelola pengguna**. Read-only dapat melihat dashboard dan log semua akun. Staff hanya mendapat akun yang dipilih dan hanya dapat menjalankan command pada akun itu.
3. Cabut akses melalui **Kelola pengguna** bila dibutuhkan. Pengguna harus memakai akun Manus dengan email yang sama persis setelah normalisasi huruf besar/kecil.

## Menghubungkan Fast-Grid EA

1. Kompilasi `ea/Fast-Grid-Pilot.mq5` di MetaEditor ke `.ex5` setelah meninjau source. Periksa tab Errors sebelum memasang EA.
2. Login owner ke MT5 Pilot dan buat koneksi. Salin token yang ditampilkan satu kali; server menyimpan hash token, bukan token mentah. Jika token hilang, cabut koneksi lama lalu buat koneksi baru.
3. Pada parameter EA, set `PilotApiBaseUrl` persis ke alamat yang ditampilkan di dialog koneksi (`https://<host-manus>/api/mt5`) dan isi `EAConnectionToken` dengan token tersebut. Interval default EA adalah `InputPengirimanInfoKePilotMs=500` dan `InputPengecekanPerintahPilotMs=1000`; jangan menambahkan `?route=` atau mengirim token ke orang lain.
4. Di MetaTrader, buka **Tools → Options → Expert Advisors**, aktifkan izin WebRequest, dan masukkan hanya origin HTTPS yang ditampilkan aplikasi (contoh bentuk: `https://<host-manus>`), bukan path `/api/mt5`.
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

## Operasi Manus

Server/API dan frontend diterbitkan sebagai satu aplikasi Manus dengan MySQL terkelola; health check publik aplikasi berada di `/api/health`. Publikasi memakai checkpoint Manus, bukan Vercel/GitHub deploy. Auto-publish dan always-on tidak diaktifkan otomatis; Autoscale/on-demand dapat mengalami cold start setelah tidak aktif. Pantau penggunaan hosting dan database pada dashboard billing Manus.

Migrasi proyek database baru memakai `pnpm db:migrate` dari daftar migration yang sudah tercatat. Database development dan production proyek Manus adalah database yang sama; jangan memasukkan test trade/saldo palsu atau menjalankan skrip destruktif untuk validasi. Backup/export data belum dikonfigurasi sebagai bagian migrasi ini; siapkan dan uji prosedur backup sebelum pemakaian operasional.

## Pemecahan masalah

- **Login berhasil tetapi akses ditolak:** cek `PILOT_OWNER_EMAIL` untuk owner pertama; pengguna lain harus diundang dengan email Manus yang benar.
- **Tidak ada telemetry:** periksa `PilotApiBaseUrl`, token, izin WebRequest untuk origin Manus, koneksi internet terminal, dan status EA. Token yang dicabut tidak dapat dipakai lagi.
- **EA offline:** heartbeat melewati 20 detik atau EA belum mengirim telemetry. Jangan mengirim command trading sampai status online dan identitas akun benar.
- **Command kedaluwarsa:** cek koneksi MT5, WebRequest/allow-list dan Journal MT5. Jangan kirim ulang BUY/SELL sebelum memastikan tidak ada posisi/order yang sudah berubah.
- **Konfigurasi belum terkonfirmasi:** tunggu telemetry EA yang mencerminkan konfigurasi baru dan cek log aktivitas sebelum mengulang.

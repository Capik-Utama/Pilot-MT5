# TODO — MT5 Pilot

## Tahap sekarang: beranda saja
- [x] Beranda statis berbahasa Indonesia tersedia di `/`; halaman menjelaskan tujuan proyek dan memberi gambaran fitur berikutnya tanpa membuat klaim data akun atau koneksi EA yang belum ada.
- [x] Beranda tidak meminta autentikasi atau memanggil API dashboard, sehingga tampilan awal tidak bergantung pada database, OAuth, atau konfigurasi server.
- [x] Vercel menggunakan build Vite statis untuk tahap ini agar halaman utama disajikan sebagai HTML, bukan melewati fungsi Express yang sebelumnya menghasilkan error.

## Pekerjaan tahap berikutnya — belum diaktifkan pada beranda

### 1. Privasi pemilik dan keamanan koneksi
- [ ] “untuk saya pribadi. tidak akan saya kasih ke orang lain.” Aplikasi hanya dapat digunakan pemilik; layar serta kontrol mengharuskan autentikasi pemilik. Identitas pemilik yang belum dikonfigurasi harus gagal tertutup. Koneksi EA memerlukan autentikasi token per akun; token tersimpan sebagai hash dan token broker/password trading tidak diminta atau disimpan. Tetapkan visibilitas proyek owner-only sebelum fitur privat ini dipakai.

### 2. Pemantauan beberapa akun dan status koneksi
- [ ] “memantau beberapa akun MT5 yang terkoneksi ke EA.” Tampilkan beberapa akun dalam satu dashboard dengan identitas dan kondisi koneksi masing-masing. “yang di tampilkan adalah: saldo, equity, max DD buy, max DD sell, Running.” Tampilkan kelima nilai/status tersebut dari telemetry EA, termasuk waktu pembaruan terakhir, kesehatan/latensi koneksi, serta penanda visual saat data basi atau akun offline. Jangan tampilkan angka contoh seolah-olah berasal dari akun nyata.

### 3. Kontrol EA per akun dan pelacakan hasil
- [ ] “saya juga ingin bisa mengontrol EA” dan “beberapa tombol. di antaranya: Auto, Manual, close buy, close sell, close all.” Sediakan kontrol Auto dan Manual serta aksi Close Buy, Close Sell, dan Close All yang ditargetkan ke akun tertentu. Aksi penutupan memerlukan konfirmasi; kontrol dinonaktifkan saat akun offline. Tunjukkan status perintah dikirim, diterima EA, berhasil, gagal, atau kedaluwarsa agar pemilik dapat mengetahui hasilnya dan mengurangi pengiriman ganda. Simpan jejak audit perintah. Pengiriman perintah bukan bukti bahwa broker telah mengeksekusinya.

### 4. Integrasi dua arah dan pembaruan cepat
- [ ] “sangat realtime. karna saya juga akan kontrol dari tombol-tombol itu.” UI menerima pembaruan akun dan status perintah secara berkala dengan cepat; EA dapat mengirim telemetry/heartbeat, menarik perintah dashboard, dan mengirim acknowledgement dengan hasil. Tandai umur data dan status offline dengan jelas. Jelaskan bahwa latensi aktual tergantung interval EA, koneksi, server, dan broker. Aplikasi tidak boleh mengaku sudah terhubung sebelum EA benar-benar mengirim data.

### 5. Autentikasi, backend, dan deployment fitur
- [ ] Beranda statis tetap dapat dibuka tanpa backend. Sebelum mengaktifkan halaman dashboard, pilih hosting backend yang sesuai, verifikasi database MySQL, migrasi skema, Manus OAuth/callback, `OWNER_OPEN_ID`, dan perlindungan owner-only. Jangan masukkan secret/env file ke Git. Uji endpoint API dan akses pemilik secara terpisah dari build beranda.

### 6. Tampilan desktop dan mobile
- [ ] “untuk saya pribadi” dan tombol digunakan untuk pemantauan serta kontrol langsung. Antarmuka fitur harus mudah dibaca dan digunakan di desktop maupun mobile, dengan target akun yang jelas, keadaan kosong saat belum ada koneksi, status mode EA, dan umpan balik visual perintah.

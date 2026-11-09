# Integrasi Pilot-MT5 ↔ Fast-Grid

EA berkomunikasi dengan Express API lokal; PocketBase menyimpan token koneksi sebagai hash SHA-256. EA tidak mengirim password, investor password, atau kredensial broker.

## Batas keselamatan

- EA dapat dipasang pada akun yang dipilih. Dashboard tidak mengklasifikasikan akun atau mencegah pemasangan pada jenis akun lain; periksa terminal sebelum memasang.
- Koneksi baru disetel AUTO dan memiliki command AUTO awal. EA dapat segera membuka posisi ketika tersambung. Gunakan MANUAL bila entry otomatis tidak diinginkan.
- Mode tersimpan dipulihkan dari server saat polling. MANUAL menghentikan entry/layer baru; stop loss dan trailing yang sudah aktif tetap berjalan.
- Saldo minimum untuk AUTO default `1000` dalam mata uang deposit akun. Nilai dapat diubah dari input EA atau editor parameter di kartu dashboard. Jika saldo di bawah ambang, AUTO ditolak/dinonaktifkan pada EA dan tombol dashboard; posisi yang sudah terbuka tidak ditutup otomatis.
- Close Buy, Close Sell, dan Close All beralih ke MANUAL dahulu serta hanya menargetkan simbol chart dan Magic Number Fast-Grid yang dikonfigurasi.
- API menolak command jika EA offline. Command memiliki masa berlaku dan acknowledgement menunjukkan hasil dari EA.
- WebRequest MQL5 sinkron dan tidak berjalan di Strategy Tester. Pantau tab Experts/Journal dan riwayat broker.

## Mengaktifkan

1. Jalankan PocketBase lokal dan server app sesuai panduan di README, lalu buka dashboard lokal.
2. Masuk dengan akun owner PocketBase. Pendaftaran publik ditutup; owner membuat pengguna tambahan.
3. Pilih **Tambah EA**, lalu simpan token yang ditampilkan satu kali.
4. Compile `ea/Fast-Grid-Pilot.mq5`. Isi `PilotApiUrl` dengan URL API di dialog koneksi dan `EAConnectionToken` dengan token tadi.
5. Di MetaTrader → Tools → Options → Expert Advisors, izinkan WebRequest ke origin dashboard, misalnya `http://localhost:3000`.
6. Cocokkan nama akun, login, server, saldo, dan equity dengan terminal sebelum membiarkan EA berjalan.

Jika MT5 berjalan di komputer lain, gunakan alamat LAN komputer server pada `PilotApiUrl`, jalankan PocketBase agar dapat dijangkau di LAN, dan atur firewall. Jangan mengekspos port PocketBase ke internet.

## Telemetri dan API

Dashboard menampilkan nama akun broker, login/server, saldo/equity, drawdown, profit/floating, mode, dan heartbeat. Status online berarti heartbeat diterima kurang dari 20 detik lalu.

Base URL: `http://localhost:3000/api/pilot`.

- `POST ?route=/telemetry` menyimpan telemetry dan konfigurasi EA.
- `GET ?route=/commands/next` mengambil command atau parameter konfigurasi berikutnya.
- `POST ?route=/commands/{id}/ack` mengirim acknowledgement.

Request EA memakai `Authorization: Bearer <EAConnectionToken>`. Dashboard memakai token auth PocketBase; kedua jenis token hanya divalidasi server-side.

## Referensi

- [MQL5 WebRequest](https://www.mql5.com/en/docs/network/webrequest)
- [MQL5 Account Properties](https://www.mql5.com/en/docs/constants/environment_state/accountinformation)
- [PocketBase documentation](https://pocketbase.io/docs/)

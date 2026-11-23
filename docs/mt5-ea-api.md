# Integrasi Pilot-MT5 ↔ Fast-Grid

EA berkomunikasi langsung dengan Express API melalui HTTPS. Token koneksi disimpan sebagai hash SHA-256 di database aplikasi; kode aktif masih memakai MySQL dan migrasi Supabase/PostgreSQL VPS ditunda. EA tidak mengirim password, investor password, atau kredensial broker.

## Batas keselamatan

- EA dapat dipasang pada akun yang dipilih. Dashboard tidak mengklasifikasikan akun atau mencegah pemasangan pada jenis akun lain; periksa terminal sebelum memasang.
- Koneksi baru disetel MANUAL. EA tidak boleh membuka posisi otomatis sampai owner mengaktifkan AUTO secara eksplisit. Uji terlebih dahulu dengan akun demo.
- Mode tersimpan dipulihkan dari server saat polling. MANUAL menghentikan entry/layer baru; stop loss dan trailing yang sudah aktif tetap berjalan.
- Saldo minimum untuk AUTO default `1000` dalam mata uang deposit akun. Nilai dapat diubah dari input EA atau editor parameter di kartu dashboard. Jika saldo di bawah ambang, AUTO ditolak/dinonaktifkan pada EA dan tombol dashboard; posisi yang sudah terbuka tidak ditutup otomatis.
- Close Buy, Close Sell, dan Close All beralih ke MANUAL dahulu serta hanya menargetkan simbol chart dan Magic Number Fast-Grid yang dikonfigurasi.
- API menolak command jika EA offline. Command memiliki masa berlaku dan acknowledgement menunjukkan hasil dari EA.
- WebRequest MQL5 sinkron dan tidak berjalan di Strategy Tester. Pantau tab Experts/Journal dan riwayat broker.

## Mengaktifkan

1. Pastikan frontend Vercel dan Express API VPS sudah dikonfigurasi; buka dashboard dari domain frontend.
2. Masuk dengan akun yang disediakan owner melalui login aplikasi atau Manus OAuth. Pendaftaran publik ditutup; owner mengatur akses pengguna dari dashboard.
3. Pilih **Tambah EA**, lalu simpan token yang ditampilkan satu kali.
4. Compile `ea/Fast-Grid-Pilot.mq5`. Isi `PilotApiUrl` dengan URL API di dialog koneksi dan `EAConnectionToken` dengan token tadi.
5. Di MetaTrader → Tools → Options → Expert Advisors, izinkan WebRequest ke origin HTTPS API VPS (misalnya `https://api.example.com`), bukan URL frontend atau path `/api/mt5`.
6. Cocokkan nama akun, login, server, saldo, dan equity dengan terminal sebelum membiarkan EA berjalan.

Jika MT5 berjalan di komputer lain, gunakan alamat HTTPS publik API VPS pada `PilotApiUrl`. Pastikan reverse proxy TLS, firewall, dan allow-list WebRequest sudah benar; jangan mengekspos database ke internet.

## Telemetri dan API

Dashboard menampilkan nama akun broker, login/server, saldo/equity, drawdown, profit/floating, mode, dan heartbeat. Status online berarti heartbeat diterima kurang dari 20 detik lalu.

Base URL produksi: `https://<host-api>/api/mt5`.

- `POST /telemetry` menyimpan telemetry dan konfigurasi EA.
- `GET /commands/next` mengambil command atau parameter konfigurasi berikutnya.
- `POST /commands/{id}/ack` mengirim acknowledgement.

Request EA memakai `Authorization: Bearer <EAConnectionToken>`. Dashboard memakai sesi aplikasi dan Bearer token ke Express API; token tetap divalidasi server-side.

## Referensi

- [MQL5 WebRequest](https://www.mql5.com/en/docs/network/webrequest)
- [MQL5 Account Properties](https://www.mql5.com/en/docs/constants/environment_state/accountinformation)

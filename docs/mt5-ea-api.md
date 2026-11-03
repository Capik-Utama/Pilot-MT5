# Integrasi Pilot-MT5 ↔ Fast-Grid

Dokumen ini menjelaskan koneksi EA `ea/Fast-Grid-Pilot.mq5` dengan dashboard Supabase. Source EA tidak mengirim password, investor password, atau kredensial broker. Token koneksi dashboard disimpan sebagai hash SHA-256 di Supabase dan tidak dapat dilihat kembali setelah dibuat.

## Batas keselamatan

- EA dapat dipasang pada akun MT5 yang Anda pilih. Dashboard tidak mengklasifikasikan jenis akun atau mencegah pemasangan pada akun selain yang Anda maksud. Pastikan terminal yang dipilih adalah akun real yang benar.
- WebRequest remote tidak dijalankan dalam Strategy Tester.
- Mode trading dipulihkan dari server saat polling. Koneksi baru sengaja disetel AUTO dan menerima perintah AUTO ketika EA tersambung; hal ini dapat langsung membuka posisi pada akun real.
- Tombol MANUAL menghentikan entry/layer otomatis. Pengelolaan risiko yang sudah ada, seperti stop loss dan trailing, tetap berjalan.
- Perintah Close Buy, Close Sell, atau Close All mengalihkan EA ke MANUAL terlebih dahulu agar strategi tidak segera membuka ulang posisi pada tick berikutnya.
- Close hanya menargetkan posisi pada simbol chart aktif (`_Symbol`) dengan Magic Number `MagicBeli` atau `MagicJual`. Order EA lain tidak ikut ditutup.
- Backend menolak perintah jika EA tidak online. Perintah antrean memiliki masa berlaku dan acknowledgement menunjukkan hasil yang diterima dari EA.
- WebRequest MQL5 bersifat sinkron, sehingga respons jaringan lambat dapat menunda pemrosesan EA. Awasi tab Experts/Journal dan hasil transaksi broker.

## Langkah mengaktifkan

1. Buka `https://pilot-mt5.vercel.app/` dan masuk memakai akun owner atau akun yang telah dibuat owner. Signup publik tidak tersedia.
2. Pilih **Tambah EA**, beri label koneksi, lalu simpan token yang ditampilkan satu kali. Jangan bagikan token.
3. Pastikan Anda memilih terminal dan login akun real yang benar. Periksa lot, batas rugi, target, simbol dan Magic Number di input EA sebelum menghubungkan.
4. Buka MetaTrader 5, pasang `Fast-Grid-Pilot.mq5` pada chart simbol yang hendak dipantau, dan isi input `EAConnectionToken`.
5. Di **Tools → Options → Expert Advisors**, aktifkan izin WebRequest dan tambahkan `https://qqdsultliybypiuvihli.supabase.co` ke daftar URL yang diizinkan.
6. Perhatikan bahwa koneksi baru akan mengirim perintah AUTO saat EA pertama kali terhubung. Gunakan tombol MANUAL sebelum membiarkan EA berjalan jika Anda belum siap mengizinkan entry.
7. Setelah heartbeat online muncul, cocokkan nama akun, login, server dan nilai saldo/equity di dashboard dengan terminal MT5. Periksa transaksi yang terjadi di Experts/Journal serta riwayat broker.

## Telemetri

- **Nama akun**: nama akun dari server broker (`ACCOUNT_NAME`); dashboard juga menampilkan login MT5 dan server bila tersedia.
- **Saldo / Equity**: nilai akun broker dalam mata uang deposit.
- **Max DD Buy / Max DD Sell**: kerugian floating terbesar per sisi yang diamati sejak EA dipasang/dijalankan. Nilai ini di-reset ketika EA dimulai ulang; bukan persentase atau drawdown historis akun.
- **Running**: status AUTO aktif dan EA tidak terkunci oleh target harian. EA dapat tetap online saat mode MANUAL.
- **Profit hari ini**: hasil bersih strategi Fast-Grid sejak reset harian server MT5, termasuk profit, komisi, swap dan floating profit/swap posisi Fast-Grid yang masih terbuka.
- **Floating**: P/L berjalan posisi Fast-Grid yang terbuka saat itu, ditampilkan terpisah.
- **Online**: heartbeat terakhir diterima kurang dari 20 detik lalu.

## Alur API

Edge Function: `https://qqdsultliybypiuvihli.supabase.co/functions/v1/mt5-api`.

EA mengirim `POST ?route=/telemetry`, melakukan polling `GET ?route=/commands/next`, lalu mengirim acknowledgement ke `POST ?route=/commands/{id}/ack`. Dashboard mengirim tindakan melalui sesi pengguna terautentikasi. Function memvalidasi token EA atau JWT pengguna sebelum mengakses tabel yang dilindungi RLS.

## Referensi teknis

- [MQL5 WebRequest](https://www.mql5.com/en/docs/network/webrequest): allow-list URL, pemanggilan sinkron, dan batasan Strategy Tester.
- [MQL5 Account Properties](https://www.mql5.com/en/docs/constants/environment_state/accountinformation): pembacaan metadata terminal dan akun.
- [Supabase Securing Edge Functions](https://supabase.com/docs/guides/functions/auth): validasi autentikasi pada function.

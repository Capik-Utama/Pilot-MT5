# Pilot-MT5 ↔ Fast-Grid (uji demo)

Dokumen ini menjelaskan koneksi source EA `ea/Fast-Grid-Pilot.mq5` dengan dashboard Supabase. Source EA tidak mengirim password, investor password, atau kredensial broker. Token koneksi dashboard hanya disimpan sebagai hash SHA-256 di Supabase dan tidak dapat dilihat ulang setelah dibuat.

## Batas keselamatan

- Versi ini menolak inisialisasi jika akun bukan akun **DEMO**. Pengecualian hanya Strategy Tester; WebRequest remote dinonaktifkan saat pengujian Strategy Tester.
- EA mulai pada mode **Manual** setiap kali dipasang ulang. Mode Auto harus dipilih secara eksplisit.
- Tombol **Manual** menghentikan entry/layer otomatis. Pengelolaan risiko yang sudah ada (stop loss, target, trailing) tetap berjalan.
- Setiap perintah **Close Buy**, **Close Sell**, atau **Close All** mengalihkan EA ke Manual terlebih dahulu agar strategi tidak membuka ulang posisi pada tick berikutnya.
- Close hanya menargetkan posisi pada simbol chart aktif (`_Symbol`) dengan Magic Number `MagicBeli` atau `MagicJual`. Order EA lain tidak ikut ditutup.
- Backend menolak perintah jika telemetry menunjukkan bukan akun demo atau EA tidak online. Perintah antrean kedaluwarsa setelah 45 detik dan hanya satu perintah aktif per akun.
- WebRequest MQL5 bersifat sinkron, sehingga respons jaringan lambat dapat menunda pemrosesan EA. Uji dahulu di akun demo dan amati tab Experts/Journal serta hasil transaksi.

## Langkah mengaktifkan

1. Buka `https://pilot-mt5.vercel.app/`, buat akun/masuk dengan Supabase Auth. Jika verifikasi email aktif, konfirmasi email sebelum login.
2. Pilih **Tambah koneksi**, beri label yang mudah dikenali, lalu simpan token yang ditampilkan satu kali. Jangan kirim token ke orang lain atau ke chat.
3. Buka MetaTrader 5 pada **akun demo**, pasang `Fast-Grid-Pilot.mq5` pada chart simbol yang hendak dipantau, dan biarkan mode awal `Manual`.
4. Pada input EA, isi `EAConnectionToken` dengan token tadi. Biarkan URL dan publishable key bawaan kecuali Anda memang memindahkan proyek Supabase.
5. Di MT5 buka **Tools → Options → Expert Advisors**, aktifkan izin WebRequest dan tambahkan origin berikut ke daftar URL yang diizinkan: `https://qqdsultliybypiuvihli.supabase.co`.
6. Pastikan AutoTrading/Algo Trading MT5 diizinkan untuk EA. Dashboard akan menunjukkan online setelah heartbeat diterima; biasanya beberapa detik.
7. Uji **Manual** dahulu. Jika ingin mencoba strategi di akun demo, tekan **Auto** dari dashboard atau panel chart. Uji tombol close hanya dengan posisi demo yang memang siap ditutup.

## Telemetri

- **Nama akun**: nama akun dari server broker (`ACCOUNT_NAME`); dashboard juga menampilkan login MT5 dan server bila tersedia.
- **Saldo / Equity**: nilai akun broker dalam mata uang deposit.
- **Max DD Buy / Max DD Sell**: kerugian floating terbesar per sisi yang diamati sejak EA dipasang/dijalankan, dalam mata uang deposit. Nilai ini di-reset ketika EA dimulai ulang; bukan persentase dan bukan drawdown historis akun.
- **Running**: status Auto aktif dan EA tidak terkunci oleh target harian. EA dapat tetap online saat mode Manual.
- **Profit hari ini**: hasil bersih strategi Fast-Grid sejak reset harian server MT5—profit, komisi, swap deal plus floating profit/swap posisi Fast-Grid yang masih terbuka.
- **Floating**: P/L berjalan posisi Fast-Grid yang terbuka saat itu, terpisah agar maknanya jelas.
- **Online**: heartbeat terakhir diterima kurang dari 20 detik lalu.

## Alur API

Edge Function: `https://qqdsultliybypiuvihli.supabase.co/functions/v1/mt5-api`.
EA mengirim `POST ?route=/telemetry`, melakukan polling `GET ?route=/commands/next` tiap sekitar 1,5 detik, lalu acknowledgement ke `POST ?route=/commands/{id}/ack`. Dashboard mengirim tindakan hanya lewat sesi Supabase pengguna terautentikasi. Function memvalidasi token EA atau JWT pengguna sendiri sebelum mengakses tabel yang RLS-nya aktif dan tidak dapat dibaca oleh role anon/authenticated.

## Referensi teknis resmi

- [MQL5 WebRequest](https://www.mql5.com/en/docs/network/webrequest): allow-list URL, pemanggilan sinkron, dan batasan Strategy Tester.
- [MQL5 Account Properties](https://www.mql5.com/en/docs/constants/environment_state/accountinformation): konstanta `ACCOUNT_TRADE_MODE_DEMO`.
- [Supabase Securing Edge Functions](https://supabase.com/docs/guides/functions/auth): validasi autentikasi pada function.

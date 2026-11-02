# TODO — MT5 Pilot

## Selesai untuk tahap demo

- [x] Dashboard Supabase Auth dipublikasikan di Vercel.
- [x] Schema Supabase dan Edge Function `mt5-api` aktif.
- [x] Akses tabel langsung dari publishable key ditolak; endpoint anonim API ditolak 401.
- [x] Source Fast-Grid dimodifikasi dengan telemetry, antrean kontrol, acknowledgement, default Manual, dan validasi token koneksi EA.
- [x] TypeScript check, build Vite, pemeriksaan sintaks TypeScript Edge Function, dan uji tampilan browser berhasil.

## Langkah pengguna

- [ ] Daftar/masuk di https://pilot-mt5.vercel.app/ dan buat koneksi untuk mengambil token.
- [ ] Compile `ea/Fast-Grid-Pilot.mq5` di MetaEditor; MetaEditor tidak tersedia di sandbox.
- [ ] Pasang di akun MT5 yang dipilih, tempel token EA, dan izinkan WebRequest untuk origin Supabase.
- [ ] Pastikan heartbeat/status online muncul sebelum mencoba Auto atau tombol close.
- [ ] Uji tiap tombol dan hasil eksekusi melalui tab Experts/Journal MT5 serta history broker.

## Pengaturan dashboard dan akses pengguna

- [x] Menu sidebar menyediakan pengaturan delay refresh dalam detik dengan default 5 detik.
- [x] Menu sidebar menyediakan tema gelap (default), terang, biru-hitam, dan biru-putih.
- [x] Owner dapat mendaftarkan user lain dengan akses read-only.
- [x] User read-only melihat dashboard dan tombol yang sama seperti owner, tetapi semua tombol aksi/perubahan tidak dapat dijalankan; API dan Supabase juga menolak mutasi read-only.
- [x] Halaman login hanya menyediakan login, tanpa fitur buat akun; hanya owner dapat membuat akun pengguna.

Pendaftaran publik Supabase Auth ditutup; buat pengguna tambahan melalui pengaturan user owner. Data EA tetap dimiliki owner utama, dan user read-only mengakses scope data yang sama hanya untuk dibaca. EA memiliki validasi token koneksi EA; jangan menghapus validasi tersebut. Untuk akun real, pastikan pengaturan risiko dan izin trading sudah ditinjau sebelum menjalankan source ini.

# TODO — MT5 Pilot

## Selesai untuk tahap demo

- [x] Dashboard Supabase Auth dipublikasikan di Vercel.
- [x] Schema Supabase dan Edge Function `mt5-api` aktif.
- [x] Akses tabel langsung dari publishable key ditolak; endpoint anonim API ditolak 401.
- [x] Source Fast-Grid dimodifikasi dengan telemetry, antrean kontrol, acknowledgement, default Manual, dan guard akun demo.
- [x] TypeScript check, build Vite, pemeriksaan sintaks TypeScript Edge Function, dan uji tampilan browser berhasil.

## Langkah pengguna

- [ ] Daftar/masuk di https://pilot-mt5.vercel.app/ dan buat koneksi untuk mengambil token.
- [ ] Compile `ea/Fast-Grid-Pilot.mq5` di MetaEditor; MetaEditor tidak tersedia di sandbox.
- [ ] Pasang hanya di akun demo, tempel token EA, dan izinkan WebRequest untuk origin Supabase.
- [ ] Pastikan heartbeat/status online muncul sebelum mencoba Auto atau tombol close.
- [ ] Uji tiap tombol dan hasil eksekusi melalui tab Experts/Journal MT5 serta history broker.

Pendaftaran Supabase Auth terbuka selama demo. Data masing-masing login tetap dipisahkan berdasarkan owner ID. EA memiliki guard akun demo; jangan menghapus guard tersebut atau menjalankan source ini pada akun real.

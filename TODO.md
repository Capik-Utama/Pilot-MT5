# TODO — MT5 Pilot

## Siap untuk uji demo

- [x] Dashboard dengan Supabase Auth, token akun EA satu kali, telemetry, heartbeat, dan kontrol per akun.
- [x] Supabase tables privat dengan RLS aktif dan akses tabel browser dicabut.
- [x] Edge Function memvalidasi sesi dashboard atau token EA sebelum akses database.
- [x] Fast-Grid EA dimodifikasi: mode awal Manual, hard-lock akun demo, telemetri, polling, acknowledgement, dan deduplikasi perintah.
- [x] Pemeriksaan TypeScript, build Vite, dan smoke test endpoint anonim berhasil.

## Langkah tersisa sebelum aktivasi pengguna

- [ ] Merge/publish branch fitur agar dashboard tersedia di domain Vercel.
- [ ] Masuk/buat akun Supabase Auth, buat koneksi, lalu simpan token EA.
- [ ] Compile `ea/Fast-Grid-Pilot.mq5` di MetaEditor; MetaEditor tidak tersedia di sandbox.
- [ ] Tambahkan origin Supabase ke allow-list WebRequest MT5.
- [ ] Uji telemetry dan tombol hanya di akun demo; tinjau tab Experts/Journal dan hasil broker.
- [ ] Periksa timeout jaringan dan acknowledgement sebelum mengandalkan kontrol jarak jauh.

EA source menjaga guard demo aktif. Jangan pasang di akun real.

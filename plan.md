# Rencana Migrasi Pilot-MT5 ke Manus

## Tujuan dan batasan

Migrasikan dashboard dan API Pilot-MT5 agar dibangun, disimpan, dijalankan, memakai database, dan diterbitkan dari Manus. Manus menjadi satu-satunya platform runtime. Repo publik dipakai hanya sebagai sumber kode untuk proses import awal; proyek tidak ditautkan ke GitHub. Hasil akhir tidak memerlukan Vercel, Supabase, atau Appwrite. Dashboard tetap privat di tingkat aplikasi dan API EA tersedia melalui HTTPS pada URL publik Manus.

Project Manus sudah dibuat dengan server dan database MySQL terkelola aktif. Source aplikasi terbaru ada di commit `950ba18` (`Add post-stop-loss cooldown setting`, 3 Nov 2026). Database baru akan kosong; kredensial Supabase dan data akun lama tidak tersedia untuk dipindahkan. Tidak akan dibuat data saldo/transaksi sintetis atau mengklaim data lama telah dimigrasikan.

## Pendekatan implementasi

1. Pertahankan dashboard React/Vite yang sudah ada, termasuk layout, pencarian dan filter akun, metrik, log aktivitas, editor konfigurasi, kontrol akses, preferensi tema, serta interval refresh. Hilangkan Supabase JS, Supabase Realtime, publish key, URL Supabase, dan pemanggilan Edge Function dari browser. Dashboard menggunakan API same-origin Manus.
2. Pindahkan logika di `supabase/functions/mt5-api/index.ts` ke endpoint Express pada server Manus. Implementasi mencakup autentikasi pengguna, daftar dan pembuatan akun koneksi EA, telemetry, polling dan acknowledgement, konfigurasi remote, interval polling, antrean perintah, audit log, pengelolaan pengguna, serta validasi akses owner/read-only/staff per akun. Gunakan transaksi MySQL untuk perubahan berurutan seperti enqueue, status command, dan event audit.
3. Buat skema Drizzle/MySQL dan migrasi untuk pengguna/role, sesi, akun EA dan hash token, penugasan akun staff, telemetry, konfigurasi, command, serta event audit. Terapkan token EA sebagai hash SHA-256, expiry command 45 detik, online window, validasi payload, scope per owner, serta transisi status/idempotensi yang sudah digunakan EA.
4. Pertahankan Manus OAuth sebagai opsi login dan tambahkan login email/password lokal untuk owner, staff, serta read-only. Owner memprovisi pengguna lokal (email+password) dan role/scope aplikasi tetap diverifikasi server-side; tidak ada pendaftaran publik. Simpan password hanya sebagai hash scrypt tersalted. Owner awal tetap diprovisi melalui alur Manus OAuth yang sudah ada dan, setelah menyetel password lokal, dapat login tanpa Manus; staff/read-only dapat memakai email/password tanpa akun Manus. Manus OAuth tetap tersedia bagi akun yang email terverifikasinya cocok dengan akses yang diprovisi. Password/ID Supabase lama tidak dapat dipakai tanpa ekspor/migrasi terpisah.
5. Perbarui source EA dan dokumentasi integrasi agar endpoint dasar menunjuk ke API HTTPS terbitan Manus, bukan `functions/v1/mt5-api` milik Supabase. Pertahankan payload kompatibel dan dokumentasikan URL WebRequest yang harus diizinkan di terminal MT5. Tidak menghubungkan atau menguji EA pada akun broker live selama migrasi.
6. Tambahkan health endpoint `/api/health`, periksa tipe TypeScript, tes aplikasi, migrasi schema, dan build container. Setelah proyek siap, simpan checkpoint Manus dan terbitkan melalui Manus. Tidak mengaktifkan auto-publish atau hosting always-on tambahan tanpa persetujuan terpisah.

## Perubahan perilaku dan risiko yang perlu diketahui

Login mendukung email/password lokal dan Manus OAuth. Owner membuat/mengatur kredensial; tidak ada pendaftaran bebas. Owner yang sudah diprovisi melalui Manus dapat menyetel password lokal satu kali, setelah itu login Manus tidak wajib. Staff/read-only dapat dibuat dengan email/password tanpa akun Manus; pengguna yang memiliki akun Manus tetap dapat memakai OAuth dengan email terverifikasi yang cocok. Sesi keduanya melewati pemeriksaan role dan scope yang sama di server. Password dan sesi Supabase lama tidak otomatis kompatibel.

EA mengirim telemetry dengan default 500 ms dan polling command default 1000 ms; owner dapat mengubah kedua interval pada input EA atau kartu akun Pilot. Kartu Running/Profit juga diperbarui setiap 500 ms ketika kartu tersedia. Saat telemetry dan polling jatuh tempo bersamaan, telemetry tetap diprioritaskan; WebRequest sinkron dengan timeout 3 detik dapat menunda command. Interval 500 ms menggandakan jumlah telemetry dibanding 1 detik dan menambah beban API/database serta biaya; waktu aktual tetap dipengaruhi latensi jaringan dan jadwal terminal. Deployment menggunakan Autoscale/on-demand; jangan menambah keep-alive buatan. Uji performa dan penggunaan sebelum mempertimbangkan always-on.

EA asal repo dapat memulai mode AUTO dan menjalankan trading. Versi Manus memulai koneksi remote baru dalam MANUAL, lalu menyimpan mode yang diakui server: setelah AUTO dinyalakan eksplisit, setiap OnInit/restart harus membaca mode server sebelum telemetry dan memulihkan AUTO. Perintah AUTO/MANUAL/Close yang sudah antre saat startup didahulukan daripada mode lama di server. Jika pembacaan mode atau penerapan override gagal, tetap MANUAL dan jangan menimpa state server dengan telemetry default; perintah MANUAL dan Close eksplisit tetap beralih ke MANUAL. Resume AUTO setelah restart dapat kembali membuka trade sesuai logika EA, jadi uji di akun demo dahulu. Selama pembangunan tidak akan ada token EA aktif atau order nyata.

## Struktur proyek tujuan

- `client/src/pages/Home.tsx`, `client/src/index.css`, dan `client/src/contexts/ThemeContext.tsx`: dashboard MT5, tema asal, dan request API same-origin.
- `client/src/const.ts` serta `client/src/_core/hooks/useAuth.ts`: Manus OAuth browser flow dan sesi aplikasi.
- `server/mt5-api.ts`: endpoint dashboard, role/scope, telemetry dan command EA pada `/api/mt5`.
- `server/_core/oauth.ts`, `server/_core/sdk.ts`, dan `server/_core/cookies.ts`: callback, validasi sesi Manus OAuth, serta cookie Preview/local.
- `server/db.ts`, `drizzle/schema.ts`, dan `drizzle/`: koneksi MySQL, schema dan migrasi aplikasi.
- `ea/Fast-Grid-Pilot.mq5`: source EA dengan base URL Manus yang dapat dikonfigurasi.
- `docs/`: instruksi deployment Manus dan setup EA tanpa Supabase/Vercel.
- `supabase/` tidak digunakan oleh runtime Manus dan tidak menjadi dependensi deployment.

## Desain yang dipertahankan

Gunakan visual terminal finansial gelap yang sudah ada pada dashboard repo; tidak melakukan redesign besar.

- **Gerakan desain:** dashboard trading bergaya terminal operasional kontemporer.
- **Prinsip:** angka penting terbaca cepat; telemetry live dan status command mudah dibedakan; kontrol berisiko selalu jelas; layout tetap usable di layar kecil.
- **Warna:** navy/charcoal sebagai dasar untuk fokus rendah gangguan; cyan untuk koneksi/live; hijau untuk keadaan sehat; amber untuk peringatan/drawdown; merah hanya untuk rugi atau aksi berbahaya.
- **Layout:** daftar akun berbentuk kartu operasional dengan metrik, status, aksi, dan rincian konfigurasi; sidebar dan modal yang sudah digunakan dipertahankan.
- **Elemen khas:** LED online/offline, garis aksen akun aktif, label status ringkas dan angka telemetry monospaced.
- **Interaksi:** refresh memberi status yang terlihat; tindakan per akun dibatasi role; tindakan close/auto memakai penjelasan dan konfirmasi yang sesuai risiko.
- **Animasi:** singkat dan fungsional untuk spinner, toast, serta perubahan koneksi; tidak memakai animasi dekoratif berulang.
- **Tipografi:** pertahankan sans-serif UI yang sekarang, gunakan angka tabular/monospaced untuk saldo, equity dan latency.
- **Esensi brand:** panel privat untuk operator Fast-Grid yang butuh keterlihatan telemetry dan kontrol; presisi, tenang, waspada.
- **Suara:** instruksi singkat dan faktual; contoh “EA online — telemetry diterima 2 dtk lalu.” dan “Mode AUTO dapat membuka posisi. Periksa akun dan batas risiko.”
- **Wordmark dan warna utama:** gunakan logo MT5 Pilot yang sudah ada; cyan terminal sebagai warna identitas.

## Alur pengerjaan

Setelah rencana disetujui, buat `TODO.md` dengan kriteria hasil per bagian, pindahkan source dashboard, port API Supabase ke Express/MySQL, jalankan diagnostik serta tes yang tersedia, lalu tinjau alur dengan pemeriksaan read-only. Setelah itu simpan checkpoint Manus dan publish. Data/password Supabase lama, domain khusus, dan pengujian ke akun broker real berada di luar langkah awal ini.

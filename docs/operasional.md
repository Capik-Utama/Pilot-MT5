# Panduan operasi MT5 Pilot

## Arsitektur dan batas data

Frontend statis Vercel memanggil Express API HTTPS di VPS. Supabase self-hosted pada VPS menyediakan Auth dan PostgreSQL; database baru kosong dan tidak ada data lama yang diimpor. Tidak ada provisioning atau migrasi yang sudah dijalankan. Jangan menganggap akun, saldo, histori, password, atau sesi dari sumber lama telah tersedia.

## Login dan role

Autentikasi identitas menggunakan Supabase Auth. API Express memeriksa role dan scope pada operasi aplikasi. User Auth harus memiliki profile `public.users` dengan UUID sama persis dengan `auth.users.id`; migration fresh tidak membuat profil otomatis. Role aplikasi harus berasal dari proses tepercaya dan tidak boleh dipercaya dari browser.

## Menghubungkan Fast-Grid EA

1. Kompilasi `ea/Fast-Grid-Pilot.mq5` di MetaEditor ke `.ex5` setelah meninjau source.
2. Login dan buat koneksi melalui aplikasi; salin token yang hanya ditampilkan satu kali.
3. Atur `PilotApiBaseUrl` ke endpoint HTTPS API dan isi token EA.
4. Izinkan hanya origin HTTPS API pada WebRequest MT5.
5. Uji pada akun demo; periksa simbol, mode, lot, batas risiko dan konfigurasi sebelum mempertimbangkan akun live.

Koneksi EA remote baru dimulai MANUAL. AUTO hanya dapat dipulihkan setelah telemetry saldo terbaru lolos pemeriksaan minimum. Saldo Minimum memakai nilai mentah dalam unit akun yang sama dengan Basket SL dan Daily Target; misalnya input `200000000` dibandingkan langsung dengan saldo `200000000`, sedangkan konversi hanya untuk tampilan. Key input lama `MinimumAutoBalanceUSD` dipertahankan demi kompatibilitas, tetapi tidak lagi berarti USD ekuivalen. Mata uang selain USD, USC, atau IDC, serta metadata cent USD yang bertentangan, memblokir AUTO sampai unit saldo dapat dipastikan. Jika saldo turun di bawah batas selama AUTO aktif, EA beralih ke MANUAL; posisi terbuka tidak ditutup oleh guard ini dan stop loss/trailing tetap berjalan. Uji dahulu di akun demo. Selama perubahan ini tidak ada order nyata yang dikirim.

## Environment dan keamanan

`DATABASE_URL`, kredensial PostgreSQL, serta key/service secrets Supabase server-only disimpan hanya di Express VPS. Runtime menggunakan login database khusus yang diberi membership role NOLOGIN `pilot_api`; jangan gunakan akun postgres/admin atau service-role. `CORS_FRONTEND_ORIGIN` adalah origin frontend Vercel secara persis. Vercel hanya menerima `VITE_API_BASE_URL` dan, bila browser Auth langsung diperlukan, `VITE_SUPABASE_URL` serta anon/publishable `VITE_SUPABASE_ANON_KEY`. Semua `VITE_` bersifat publik; dilarang memasukkan password DB atau service-role/secret key.

Policy RLS pada migration memberi `pilot_api` hak penuh ke tabel aplikasi sehingga login tersebut harus eksklusif untuk API terpercaya. Jangan berikan role ini ke browser. Database tidak boleh dibuka langsung ke internet.

## Provisioning/migrasi database (belum dilakukan)

Tinjau `supabase/migrations/20261123150000_pilot_mt5_postgres_fresh.sql` dan rencanakan provisioning sesuai [panduan deployment](deploy-vercel.md). Migrasi belum dijalankan; jangan jalankan `db:migrate`, `db:push`, atau SQL pada server tanpa persetujuan eksplisit. Setup role login runtime, keanggotaan `pilot_api`, kredensial, dan backup ditangani administrator VPS sesuai kebijakan setempat—migration tidak menghardcode username/password. Migrasi tidak mengimpor data dan tidak membuat trigger profile Auth.

## Polling dan trading

- Default telemetry 500 ms dan polling perintah 1000 ms; WebRequest sinkron/latensi dapat menambah waktu.
- Status online bergantung heartbeat dan command queued bukan bukti order selesai.
- Jangan gunakan remote MANUAL/Close sebagai emergency stop instan.
- Setelah mengubah source `.mq5`, compile ulang dan ganti `.ex5` pada terminal MT5.
- Jangan kirim BUY/SELL ulang sebelum memeriksa apakah posisi/order sudah berubah.

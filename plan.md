# MT5 Pilot — rencana dan batas integrasi

## Tahap saat ini

Proyek memiliki dashboard untuk source EA Fast-Grid: login Supabase Auth, pembuatan token koneksi satu kali, ringkasan data telemetry, status heartbeat, serta antrean tombol Manual/Auto/Close Buy/Close Sell/Close All. Untuk masa demo, pendaftaran Supabase Auth terbuka; setiap login hanya mengakses data dengan `owner_id` miliknya sendiri. Frontend dipublikasikan sebagai aplikasi statis Vite di Vercel; data dan kontrol melewati Supabase Edge Function `mt5-api`. Source yang sudah diadaptasi berada di `ea/Fast-Grid-Pilot.mq5`.

Akun awal dan data demo tidak dibuat otomatis. Dashboard menampilkan nilai kosong/offline hingga EA mengirim heartbeat asli. EA menyertakan validasi token koneksi EA dan mode awal Manual; tombol close beralih ke Manual, membatasi penutupan pada simbol chart dan Magic Number Fast-Grid. Fitur kontrol masih harus dikompilasi dan diuji di MetaTrader milik pengguna.

## Arsitektur

- **Frontend:** React/Vite pada `client/`, menggunakan Supabase Auth untuk sign up/login. Akses data dashboard melalui API Edge Function dengan JWT pengguna; browser tidak mendapat service-role key.
- **Database:** tiga tabel Supabase (`mt5_accounts`, `mt5_commands`, `mt5_command_events`) dengan RLS aktif, akses `anon` dan `authenticated` dicabut, serta CRUD di server melalui service role. Token EA 256-bit dibuat acak, hanya ditampilkan satu kali, dan disimpan sebagai hash SHA-256.
- **Edge Function:** `supabase/functions/mt5-api/index.ts` memvalidasi sesi pengguna untuk panggilan dashboard dan hash token EA untuk telemetry/poll/ack. `verify_jwt` platform dimatikan karena fungsi menerima dua bentuk autentikasi; validasi keduanya tetap dilakukan eksplisit pada kode fungsi. Perintah hanya diantrekan saat EA online dan heartbeat masih berlaku.
- **MT5:** `WebRequest()` melalui HTTPS mengirim telemetry dan melakukan polling perintah. EA memvalidasi token koneksi sebelum remote control. ID perintah disimpan di terminal untuk mengurangi replay bila respons jaringan hilang; pada kondisi ambigu EA menahan eksekusi ulang dan melaporkan status gagal agar pemilik memeriksa terminal secara manual.

## Arti nilai dashboard

- Balance dan equity: nilai akun broker dalam mata uang deposit.
- Max DD Buy/Sell: floating loss terbesar pada masing-masing sisi sejak EA dimulai, bukan persentase atau drawdown historis.
- Running: Auto aktif dan EA tidak terkunci target harian. Online/offline menunjukkan heartbeat tersendiri.
- Profit hari ini: hasil bersih Fast-Grid sejak reset hari server MT5, termasuk deal, komisi, swap, dan floating P/L posisi terbuka. Floating ditampilkan terpisah.
- Status online: heartbeat kurang dari 20 detik. Antrean kontrol berlaku 45 detik; acknowledgement tidak menjamin eksekusi sampai hasil broker diterima EA.

## Operasi dan keselamatan

Kontrol trading bukan pengganti pengawasan MT5/broker. WebRequest bersifat sinkron; kegagalan jaringan dapat menunda siklus EA. Pengujian harus dimulai di akun MT5, periksa tab Experts/Journal dan hasil transaksi, serta jangan mengirim perintah tanpa memastikan risiko dan akun tujuan. Manual menghentikan entry otomatis tetapi pengaman SL/trailing asli tetap bekerja.

## Artefak proyek

- `client/src/pages/Home.tsx`, `client/src/index.css`: dashboard autentikasi dan metrik.
- `client/src/lib/supabase.ts`: URL dan publishable key Supabase untuk browser.
- `supabase/migrations/20261102150000_mt5_pilot.sql`: schema tabel, indeks, RLS, dan hak akses.
- `supabase/functions/mt5-api/index.ts`: API dashboard, telemetry, polling perintah, dan acknowledgement.
- `ea/Fast-Grid-Pilot.mq5`: EA Fast-Grid bertelemetri dan kontrol akun demo maupun real.
- `docs/mt5-ea-api.md`: langkah instalasi, allow-list WebRequest, semantik nilai, serta referensi resmi.

# MT5 Pilot — rencana dan batas integrasi

## Tahap saat ini

Proyek memiliki dashboard untuk source EA Fast-Grid: login Supabase Auth, pembuatan token koneksi satu kali, ringkasan data telemetry, status heartbeat, serta antrean tombol Manual/Auto/Close Buy/Close Sell/Close All. Pendaftaran publik ditutup; owner membuat pengguna `read_only` dari menu sidebar, sedangkan role dan otorisasi diperiksa di Supabase Edge Function dan database. Frontend dipublikasikan sebagai aplikasi statis Vite di Vercel; data dan kontrol melewati Supabase Edge Function `mt5-api`. Source yang sudah diadaptasi berada di `ea/Fast-Grid-Pilot.mq5`.

Akun awal dan data demo tidak dibuat otomatis. Dashboard menampilkan nilai kosong/offline hingga EA mengirim heartbeat asli. EA menyertakan validasi token koneksi EA dan mode awal Manual; tombol close beralih ke Manual, membatasi penutupan pada simbol chart dan Magic Number Fast-Grid. Fitur kontrol masih harus dikompilasi dan diuji di MetaTrader milik pengguna.

## Arsitektur

- **Frontend:** React/Vite pada `client/`, menggunakan Supabase Auth untuk login; pendaftaran publik tidak ditampilkan dan juga diblokir oleh trigger database. Refresh fallback (default 5 detik) dan salah satu dari empat tema disimpan lokal per browser.
- **Database:** tabel Supabase EA tetap dimiliki oleh owner utama. `pilot_user_access` mengikat pengguna read-only ke owner; RLS Realtime memberi SELECT hanya untuk scope owner tersebut, sementara metadata role tidak dapat dibaca langsung dari browser.
- **Edge Function:** `supabase/functions/mt5-api/index.ts` memvalidasi sesi dan role untuk setiap permintaan dashboard. Role owner saja dapat membuat/mengubah akun, mengubah konfigurasi, menjalankan perintah, atau membuat pengguna baru; role read-only hanya dapat membaca data owner. Admin API Supabase membuat pengguna dengan metadata provisioning yang tidak dapat disetel lewat signup publik.
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
- `supabase/migrations/20261102200000_pilot_read_only_users.sql`: role owner/read-only, sharing Realtime scoped, serta pencegahan signup mandiri.
- `supabase/functions/mt5-api/index.ts`: API dashboard, telemetry, polling perintah, dan acknowledgement.
- `ea/Fast-Grid-Pilot.mq5`: EA Fast-Grid bertelemetri dan kontrol akun demo maupun real.
- `docs/mt5-ea-api.md`: langkah instalasi, allow-list WebRequest, semantik nilai, serta referensi resmi.

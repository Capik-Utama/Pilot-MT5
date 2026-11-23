# Akses pengguna dan preferensi dashboard

Owner mengelola akun aplikasi dari sidebar. Owner dapat memberi role read-only atau staff dan menugaskan akun yang boleh diakses staff. Read-only hanya dapat melihat dashboard; staff dapat mengirim command pada akun yang ditugaskan. API Express memeriksa role dan kepemilikan sebelum setiap operasi data. Data pengguna dan akses saat ini menggunakan schema MySQL aktif.

Signup publik tidak tersedia. Owner mengatur akun tambahan dan kredensial melalui fitur pengelolaan pengguna. Pengguna masuk melalui login aplikasi atau Manus OAuth. Frontend mengakses API VPS; database dan seluruh operasi data tetap di server. Jangan menaruh secret atau connection string database di Vercel.

Preferensi tema dan tampilan dashboard disimpan per browser. EA mengirim telemetry secara default setiap 500 ms dan memeriksa command setiap 1000 ms; WebRequest MT5 bersifat sinkron, sehingga jaringan lambat menambah jeda dan menghasilkan request yang tinggi. Perubahan interval EA per akun tersedia dari pengaturan pada kartu EA.

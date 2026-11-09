# Akses pengguna dan preferensi dashboard

Owner lokal dibuat oleh `pnpm pocketbase:setup`. Owner dapat membuat akun `read_only` atau `staff` dari sidebar. Read-only hanya dapat melihat dashboard; staff dapat mengirim command ke akun yang ditugaskan. API Express memeriksa role dan kepemilikan sebelum setiap operasi data.

Signup publik tidak tersedia. Owner membuat akun tambahan dengan username dan password sementara; kredensial itu disampaikan secara aman. Pengguna login melalui PocketBase Auth dan seluruh collection data hanya dapat diakses melalui server dengan kredensial superuser yang disimpan di `.env`.

Delay refresh disimpan di browser (`pilot-refresh-seconds`), default 1 detik dengan rentang 1–60 detik. Dashboard menggunakan polling berkala. Telemetry EA dikirim tiap 1 detik; WebRequest bersifat sinkron sehingga jaringan lokal yang lambat tetap dapat menambah jeda. Tema disimpan per browser di `pilot-theme`.

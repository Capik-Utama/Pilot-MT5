# Akses pengguna dan preferensi dashboard

Akun MT5 tetap dimiliki oleh owner yang sudah ada di Supabase. Owner dapat membuat akun tambahan dari menu sidebar. Akun tersebut memperoleh role `read_only`, terhubung ke owner yang sama, dan hanya dapat membaca data dashboard. Semua aksi EA dan perubahan parameter dinonaktifkan di tampilan serta ditolak lagi oleh Edge Function. Kebijakan RLS Realtime memberi akses baca hanya pada baris milik owner terkait.

Form pembuatan akun mengembalikan kata sandi sementara acak satu kali untuk disampaikan owner dengan aman. Akun dibuat terkonfirmasi melalui Supabase Admin API. Signup publik di halaman login sudah dihapus dan pembuatan user Auth baru dibatasi oleh trigger pada `auth.users`; trigger hanya menerima marker provisioning `app_metadata` yang diberikan endpoint owner.

Delay refresh berkala disimpan di browser (`pilot-refresh-seconds`) dengan default 5 detik dan rentang 1–60 detik. Perubahan Realtime tetap memperbarui dashboard segera, sehingga delay hanya mengatur polling fallback. Tema disimpan per browser di `pilot-theme`, dengan opsi gelap, terang, biru-hitam, dan biru-putih.

## Referensi

Supabase menjelaskan kontrol server-side untuk membatasi pembuatan user Auth melalui mekanisme Before User Created Hook. Implementasi proyek menggunakan trigger PostgreSQL pada `auth.users` untuk menegakkan kebijakan signup tertutup dan provisioning Admin API owner.

[1]: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook "Supabase Auth Before User Created Hook"

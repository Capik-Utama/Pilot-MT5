# TODO Migrasi Pilot-MT5 — Supabase VPS + Express + Vercel

## [x] Auth Supabase dan kontrol akses berbasis UUID

- Browser menggunakan Supabase Auth email/password, memproses sesi dan sign-out melalui klien Supabase; dashboard mengirim access token sebagai Bearer ke Express.
- Express memverifikasi token melalui Supabase Auth, memerlukan email terverifikasi, serta menyinkronkan profil UUID tanpa menyalin kredensial.
- Owner hanya di-bootstrap jika email terverifikasi cocok dengan `PILOT_OWNER_EMAIL`; anggota tidak memperoleh akses hanya karena email cocok. Role dan scope akun dicek di server.
- Invite/revoke pengguna menggunakan Supabase Auth Admin API; password tidak disimpan/hash pada tabel Pilot.
- OAuth Manus dan password-auth lokal ditutup dengan HTTP 410; tidak ada pemulihan otomatis kredensial/data lama.

## [x] Schema fresh PostgreSQL dan koneksi Express

- Model Drizzle dan SQL fresh migration memakai PostgreSQL, UUID Supabase Auth, FK, unique/check constraints, role access dan RLS.
- Express mengakses DB lewat driver `pg`/Drizzle dan koneksi runtime `DATABASE_URL`; kredensial privileged tidak berada pada frontend.
- Migration membuat schema kosong tanpa seed/import data lama. SQL belum diterapkan.
- Role grup `pilot_api` NOLOGIN dan persyaratan dedicated runtime membership didokumentasikan; provisioning belum dijalankan.

## [x] Frontend Vercel dan API VPS

- Vercel tetap membangun frontend statis; request `/api/*` menuju Express API pada origin publik yang diatur `VITE_API_BASE_URL`.
- CORS Express memakai daftar origin frontend eksplisit `CORS_FRONTEND_ORIGIN`.
- Auth browser hanya memakai URL dan key anon/publishable; Supabase secret/service-role, password DB dan `DATABASE_URL` hanya di VPS.
- UI login/email invitation diselaraskan dengan Supabase Auth; fitur panel EA dan perilaku UI yang ada dipertahankan.

## [x] Validasi lokal

- `pnpm check`, `pnpm test`, dan `pnpm build` berhasil. Build menampilkan peringatan non-blocking terkait script runtime config yang tidak dapat di-bundle sebagai modul dan ukuran chunk JavaScript di atas 500 kB.
- `git diff --check` bersih.

## [ ] Provisioning/deployment terpisah — tidak dilakukan dalam tugas ini

- Buat database Auth/role runtime dan terapkan migration hanya setelah tinjauan/otorisasi terpisah; jangan import data lama.
- Set konfigurasi SMTP, redirect allowlist Supabase, secret API/VPS, origin Vercel dan CORS.
- Deploy API/Vercel, lalu validasi login dan koneksi EA pada lingkungan demo. Tidak ada migration SQL, perubahan database, atau deployment yang dilakukan sebagai bagian perubahan ini.

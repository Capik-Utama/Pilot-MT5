# Deployment lokal

Arsitektur PocketBase memerlukan PocketBase dan server Express yang berjalan terus-menerus. Deployment frontend statis di Vercel tidak didukung karena browser, dashboard API, dan MetaTrader harus dapat menjangkau server lokal.

Ikuti instruksi setup lokal di README. Untuk akses dari komputer lain di LAN, gunakan IP server, batasi port dengan firewall, dan jangan mengekspos PocketBase atau HTTP tanpa TLS ke internet.

Koneksi EA baru sengaja disetel AUTO dan menerima command AUTO awal. Tinjau risiko trading, simbol, lot, Magic Number, batas rugi, dan target sebelum menghubungkan akun.

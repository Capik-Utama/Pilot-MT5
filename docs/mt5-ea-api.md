# Protokol EA MT5 Pilot

Dokumen ini menjelaskan endpoint server untuk EA MQL5 yang akan dibuat pada tahap integrasi berikutnya. EA mengirim request HTTPS ke origin aplikasi; jangan menaruh kredensial trading broker pada aplikasi web.

## Autentikasi koneksi
Saat akun dashboard dibuat, token koneksi 256-bit hanya ditampilkan satu kali. EA mengirimkannya sebagai `Authorization: Bearer <token>`. Server menyimpan hash SHA-256 token, bukan token mentah. Jangan kirim token ke log atau browser lain. Jika token hilang, buat akun koneksi baru dan gunakan token yang baru.

## Telemetry dan heartbeat
`POST /api/mt5/telemetry` dengan `Content-Type: application/json` dan token Bearer. Contoh payload:

```json
{
  "balance": 10000.25,
  "equity": 10025.1,
  "maxDdBuyPct": 2.4,
  "maxDdSellPct": 0.8,
  "running": true,
  "eaMode": "auto",
  "currency": "USD",
  "latencyMs": 112
}
```

`maxDdBuyPct` dan `maxDdSellPct` dikirim sebagai persentase (misalnya `2.4` berarti 2,4%). Aplikasi menampilkan `—` sampai menerima telemetry nyata pertama. Definisi periode/puncak drawdown perlu disamakan dengan logika strategi EA. `latencyMs` adalah estimasi RTT WebRequest yang diukur EA, opsional. Dashboard menandai EA offline jika tidak ada heartbeat selama 15 detik.

## Poll perintah
EA melakukan `GET /api/mt5/commands/next` dengan token yang sama. `204 No Content` berarti belum ada perintah. `200` berisi satu perintah:

```json
{"commandId":"32karakterheksadesimal","action":"close_all","expiresAt":"2026-11-01T15:00:00.000Z"}
```

Tindakan yang didukung: `auto`, `manual`, `close_buy`, `close_sell`, dan `close_all`. Perintah harus diambil dan diakui sebelum masa berlaku 45 detik. Setelah status `accepted`, EA harus mengirim hasil final; masa antre tidak lagi berlaku dan dashboard menahan kontrol berikutnya untuk mencegah aksi tumpang tindih.

EA perlu memeriksa kedaluwarsa, mendeduplikasi `commandId` secara persisten, dan tidak mengulangi eksekusi hanya karena respons jaringan hilang. Polling HTTP bersifat at-least-once sampai acknowledgement; broker dan database tidak dapat menyediakan transaksi exactly-once lintas jaringan.

## Acknowledgement
EA mengirim `POST /api/mt5/commands/{commandId}/ack` dengan token Bearer dan salah satu status:

```json
{"status":"accepted","message":"Perintah diterima EA"}
```

Lalu setelah hasil broker diketahui, kirim `succeeded` atau `failed`, misalnya:

```json
{"status":"succeeded","message":"Posisi BUY ditutup; 2 posisi diproses"}
```

Respons dikonfirmasi dashboard sebagai berhasil/gagal hanya setelah EA mengirim hasil terminal. `accepted` artinya EA mengakui perintah, bukan berarti transaksi sudah dieksekusi. EA harus mengirim kegagalan jika order ditolak atau ada kesalahan broker. Perubahan queued/delivered/accepted/succeeded/failed dicatat sebagai event audit append-only.

## Keamanan dan operasi
Gunakan HTTPS. Di MetaTrader 5, pemilik perlu menambahkan origin aplikasi ke daftar URL yang diizinkan untuk fungsi WebRequest. Polling awal yang disarankan sekitar 1 detik dan heartbeat 1–2 detik; angka ini dapat disetel sesuai beban koneksi dan batas broker. Uji seluruh perintah pada akun demo terlebih dahulu. Jangan mengeksekusi aksi pada akun live sebelum hasil acknowledgement dan perilaku ketika terputus diuji.

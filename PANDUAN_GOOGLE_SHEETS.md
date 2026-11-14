# Panduan Database Pengguna dengan Google Sheets

Neon Rush menyimpan akun dan progres pemain (uang, reputasi, mobil, upgrade, tampilan, rekor) ke **Google Sheets** lewat **Google Apps Script Web App**. Gratis, tanpa server sendiri.

```
Browser (game)  ──POST JSON──▶  Apps Script Web App  ──▶  Google Sheet "Users"
```

Waktu yang dibutuhkan: ±10 menit.

---

## Langkah 1 — Buat Google Sheet

1. Buka **https://sheets.new** (login dengan akun Google kamu).
2. Ganti nama spreadsheet (pojok kiri atas) menjadi misalnya **`Neon Rush DB`**.
3. Tidak perlu membuat kolom apa pun — skrip akan membuatnya otomatis.

## Langkah 2 — Pasang Apps Script

1. Di Google Sheet tadi, klik menu **Ekstensi → Apps Script** (*Extensions → Apps Script*).
2. Tab baru terbuka berisi file `Code.gs` dengan fungsi kosong `myFunction`.
3. **Hapus semua isinya**, lalu buka file `google-apps-script/Code.gs` dari folder game ini, salin **seluruh** isinya, dan tempel ke editor.
4. Klik ikon **💾 Simpan** (atau `Ctrl + S`).
5. (Opsional) Ganti nama proyek di kiri atas dari "Untitled project" menjadi **`Neon Rush API`**.

## Langkah 3 — Jalankan `setup` sekali (membuat sheet & header)

1. Di toolbar editor, pada dropdown fungsi pilih **`setup`**.
2. Klik **▶ Run / Jalankan**.
3. Muncul jendela **"Authorization required"** → klik **Review permissions / Tinjau izin**.
4. Pilih akun Google kamu.
5. Jika muncul *"Google hasn't verified this app"*: klik **Advanced / Lanjutan** → **Go to Neon Rush API (unsafe)**. Ini normal karena skrip ini buatanmu sendiri.
6. Klik **Allow / Izinkan**.
7. Kembali ke Google Sheet: sekarang ada sheet baru bernama **`Users`** dengan header:

| username | passhash | salt | token | money | rep | wins | races | car | data | created_at | last_login | updated_at |
|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Langkah 4 — Deploy sebagai Web App

1. Di editor Apps Script, klik tombol biru **Deploy → New deployment** (*Terapkan → Deployment baru*).
2. Klik ikon ⚙️ di samping "Select type" → pilih **Web app**.
3. Isi:
   - **Description**: `Neon Rush v1`
   - **Execute as / Jalankan sebagai**: **Me (email kamu)**
   - **Who has access / Yang memiliki akses**: **Anyone / Siapa saja**  ← *wajib, agar game bisa mengakses tanpa login Google*
4. Klik **Deploy**. (Jika diminta izin lagi, ulangi langkah izin seperti di Langkah 3.)
5. Salin **Web app URL** — bentuknya seperti:
   `https://script.google.com/macros/s/AKfycb.................../exec`

> Pastikan URL berakhiran **`/exec`**, bukan `/dev`.

## Langkah 5 — Tes URL

Tempel URL tadi ke tab browser baru. Jika benar, akan tampil:

```json
{"ok":true,"msg":"Neon Rush API aktif. Gunakan POST dari game."}
```

## Langkah 6 — Sambungkan ke game

1. Buka file **`js/config.js`** di folder game dengan Notepad / VS Code.
2. Tempel URL ke `SHEETS_URL`:

```js
SHEETS_URL: "https://script.google.com/macros/s/AKfycb.................../exec",
```

3. Simpan, lalu muat ulang (refresh) game.
4. Di layar login sekarang tertulis **Database: Google Sheets (online)**.
5. Klik tab **DAFTAR**, buat akun → cek Google Sheet: baris baru muncul di sheet `Users`. 🎉

Setiap kali pemain membeli mobil, upgrade, mengecat, atau menyelesaikan balapan, progres otomatis tersimpan (kolom `money`, `rep`, `wins`, `races`, `car`, dan `data` ikut diperbarui). Papan peringkat di game diambil dari sheet ini.

---

## Mengubah skrip setelah di-deploy

Jika kamu mengedit `Code.gs`, perubahan **tidak otomatis aktif**. Lakukan:

**Deploy → Manage deployments → ✏️ (Edit) → Version: New version → Deploy**

Dengan cara ini **URL tetap sama**. (Jika memilih *New deployment*, URL akan berubah dan harus ditempel ulang di `config.js`.)

## Isi kolom

| Kolom | Isi |
|---|---|
| `username` | Nama pemain (unik, tidak peka huruf besar/kecil) |
| `passhash` | Hash SHA-256 dari (salt + hash password dari browser). Password asli **tidak pernah** dikirim/disimpan |
| `salt` | Garam acak per pemain |
| `token` | Token sesi; berganti setiap login. Simpan data hanya diterima dengan token yang cocok |
| `money`, `rep`, `wins`, `races`, `car` | Ringkasan untuk papan peringkat (mudah dibaca di Sheet) |
| `data` | JSON lengkap progres: daftar mobil, upgrade, tampilan, event yang dimenangkan, rekor |
| `created_at`, `last_login`, `updated_at` | Waktu dibuat, login terakhir, simpan terakhir |

## Keamanan & batasan

- Biarkan Google Sheet tetap **privat** (jangan dibagikan publik). Web App berjalan sebagai akunmu, jadi pemain hanya bisa mengakses lewat aksi yang disediakan skrip (`register`, `login`, `save`, `leaderboard`).
- Ini cocok untuk game hobi/komunitas. Karena logika game berjalan di browser, pemain yang paham teknis tetap bisa memanipulasi uang/progresnya sendiri — jangan dipakai untuk hadiah uang sungguhan.
- Batas Google: satu sel maksimal 50.000 karakter (data progres biasanya < 5.000), dan Apps Script punya kuota harian gratis yang cukup untuk ratusan pemain aktif.
- Untuk reset password pemain: hapus barisnya (pemain mendaftar ulang), atau edit kolom lain secara manual.

## Pemecahan masalah

| Gejala | Solusi |
|---|---|
| "Balasan server bukan JSON" | Akses deploy belum **Anyone**, atau kamu memakai URL `/dev`. Deploy ulang (New version) dengan akses Anyone. |
| "Failed to fetch" / error CORS | Cek URL di `config.js` (harus `/exec`, tanpa spasi). Pastikan internet aktif. |
| "Sesi berakhir, silakan login ulang" | Akun yang sama login di perangkat lain (token berganti). Keluar lalu login lagi. |
| Perubahan `Code.gs` tidak berpengaruh | Lakukan *Manage deployments → New version*. |
| Sheet `Users` tidak muncul | Jalankan fungsi `setup` sekali dari editor. |
| Ingin kembali ke mode offline | Kosongkan `SHEETS_URL: ""` di `config.js`. |

## Pembaruan: desain livery & kolom data2..data8

Mulai versi dengan **Studio Desain**, data progres bisa lebih besar (berisi gambar livery). `Code.gs` kini memecah data ke kolom `data`, `data2` … `data8` (masing-masing ≤ 45.000 karakter).

Jika kamu sudah pernah men-deploy versi lama:
1. Tempel ulang isi `google-apps-script/Code.gs` yang baru ke editor Apps Script, simpan.
2. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy** (URL tetap sama).
3. Header kolom baru ditambahkan otomatis saat game pertama kali menyimpan/login. Data lama tetap aman.

# Panduan Desain Mobil Sendiri

Ada **3 cara** mengubah tampilan mobil, dari yang paling mudah sampai paling lanjut:

| Cara | Untuk siapa | Yang disiapkan |
|---|---|---|
| A. Studio Desain di dalam game | Semua pemain | Tidak perlu apa-apa |
| B. Impor gambar livery (PNG/JPG) | Yang suka desain di Photoshop/Canva/Krita | 1 file gambar 2048×256 px |
| C. Model 3D sendiri (.glb) | Desainer 3D (Blender, dll.) | 1 file model `.glb` |

---

## A. Studio Desain (di dalam game)

1. Masuk **Garasi → tab TAMPILAN → 🎨 BUKA STUDIO DESAIN**.
2. Gambar di kanvas panjang. **Sisi KANAN kanvas = DEPAN mobil.** Area gelap di luar garis putus-putus tidak akan tampil di bodi (kaca, ban, dan lengkung roda otomatis dikecualikan).
3. Alat yang tersedia:
   - **Kuas** & **Penghapus** — gambar bebas.
   - **Garis**, **Kotak**, **Elips** — bisa "Diisi" atau "Garis tepi".
   - **Teks** — ketik di kolom *Teks*, pilih font, lalu klik di kanvas.
   - **Stiker** — bintang, petir, lidah api, nomor balap, garis ganda, kotak catur, sayap, hati.
   - **Isi Penuh** — mewarnai seluruh sisi bodi (latar).
   - **Gambar** — tempel logo/foto dari file (lihat bagian B).
   - Warna, ukuran, transparansi, **Urungkan** (Ctrl+Z), **Hapus Semua**.
4. Pratinjau 3D di atas panel berubah **langsung** saat kamu menggambar. Seret layar untuk memutar mobil.
5. Centang **"Tulisan terbaca di kedua sisi"** agar teks tidak terbalik di sisi kiri mobil. (Matikan kalau desainmu berarah, misalnya lidah api yang harus mengarah ke belakang di kedua sisi.)
6. Klik **PASANG DI MOBIL** (biaya $1.500). Desain tersimpan bersama akun (lokal maupun Google Sheets) dan langsung terlihat saat mengemudi.
7. **Lepas Desain** untuk kembali ke cat biasa. **⬇ Simpan PNG** untuk mengunduh desainmu.

Catatan: warna dasar bodi tetap mengikuti **Warna Cat**. Bagian kanvas yang transparan (tidak digambar) akan memperlihatkan warna cat tersebut.

---

## B. Desain di aplikasi lain lalu impor (PNG / JPG)

### Spesifikasi file

| Hal | Ketentuan |
|---|---|
| Format | **PNG** (paling disarankan, mendukung latar transparan), **JPG/JPEG**, atau **WEBP** |
| Ukuran gambar | **2048 × 256 piksel** (rasio **8:1**). Ukuran lain tetap bisa, tapi akan ditarik/diregangkan ke 8:1 |
| Ukuran file | Maksimal **8 MB** saat diimpor (game otomatis mengecilkannya, hasil simpanan ±5–60 KB) |
| Arah | **Kanan = depan mobil**, kiri = belakang |
| Latar | Transparan (PNG) = warna cat terlihat. Latar putih/hitam di JPG = ikut tercetak di bodi |
| Warna | RGB biasa (sRGB). Tidak perlu CMYK |

### Langkah

1. Di Studio Desain klik **⬇ Template** → kamu mendapat file `template-livery-<mobil>.png` (2048×256) berisi garis siluet mobil, posisi lengkung roda, dan penanda DEPAN/BELAKANG. Template berbeda per mobil karena bentuk bodinya berbeda.
2. Buka template di Photoshop / Canva / Krita / GIMP / Photopea (gratis, di browser). Buat layer baru di atasnya dan desain di **dalam garis putus-putus**.
3. **Sembunyikan/hapus layer template**, lalu ekspor sebagai **PNG 2048×256**.
4. Di Studio Desain klik **📁 Impor Gambar** → pilih file → klik **Penuhi Kanvas** (untuk livery penuh), atau seret kotak di kanvas untuk menempel gambar sebagai logo/stiker.
5. Tambahkan detail lain jika mau, lalu **PASANG DI MOBIL**.

### Tips agar hasilnya bagus
- Bodi mobil di game hanya setinggi ±0,5 m di layar, jadi pakai **garis tebal, warna kontras, dan teks besar**. Detail sangat kecil akan hilang.
- Hindari meletakkan tulisan penting di **lengkung roda** (dua lingkaran di bawah template) dan di ujung kiri/kanan yang melengkung.
- Gradasi halus & foto besar membuat file lebih berat; game akan menurunkan kualitas otomatis bila perlu.
- Gunakan hanya gambar/logo milikmu sendiri atau yang lisensinya mengizinkan.

---

## C. Model 3D sendiri (.glb) — tingkat lanjut

Mengganti **seluruh bentuk mobil** dengan model 3D buatanmu.

### Spesifikasi model

| Hal | Ketentuan |
|---|---|
| Format | **.glb** (glTF 2.0 biner, tekstur di dalam file). Dari Blender: *File → Export → glTF 2.0 → Format: glTF Binary (.glb)* |
| Ukuran file | Disarankan **≤ 10 MB** per mobil |
| Jumlah poligon | Disarankan **≤ 50.000 segitiga** (makin sedikit makin lancar) |
| Tekstur | PNG/JPG di dalam .glb, maksimal **2048×2048 px**, ukuran kelipatan 2 (512, 1024, 2048) |
| Sumbu | **Y ke atas**, **depan mobil menghadap +Z** (Blender: centang *+Y Up* saat ekspor; jika mobil terbalik arah, atur `rotateY: 180` di config) |
| Skala | Bebas — game otomatis menyesuaikan panjang model dengan panjang mobil aslinya (±4–5 m). Atur `scale` untuk memperbesar/memperkecil |
| Warna cat | Beri nama material bodi **`Paint`** (atau mengandung kata *paint/body/cat*) agar ikut warna cat yang dipilih di garasi |
| Roda (opsional) | Pisahkan 4 roda sebagai objek bernama **`wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR`** dengan titik pusat (origin) di tengah roda dan poros roda searah sumbu X → roda akan berputar & roda depan ikut berbelok |

### Langkah

1. Simpan file ke folder **`models/`**, misalnya `models/mobilku.glb`.
2. Buka `js/config.js` dan isi `CUSTOM_MODELS`. Kunci = id mobil yang mau diganti tampilannya (statistik/performa tetap milik mobil itu):

```js
CUSTOM_MODELS: {
  pixel:   { url: "models/mobilku.glb", rotateY: 0, scale: 1 },
  spectre: { url: "models/supercarku.glb", rotateY: 180, scale: 1.05 },
},
```

   Id mobil: `pixel`, `vespera`, `rondo`, `kitsune`, `bravado`, `hayate`, `orion`, `spectre`, `nebula`.
3. Jalankan game lewat **`jalankan-game.bat`** (browser memblokir pemuatan file model jika `index.html` dibuka langsung dengan klik dua kali).
4. Mobil tersebut di dealer, garasi, jalan, dan balapan akan memakai model barumu.

Catatan: pada model 3D sendiri, fitur spoiler/body kit/vinyl/livery dari garasi tidak ditempel (karena bentuknya sudah dari model). Warna cat tetap berlaku untuk material bernama `Paint`.

### Sumber & hak cipta
- Buat sendiri (Blender gratis), atau pakai model berlisensi **CC0 / CC-BY** (cantumkan kredit jika CC-BY).
- **Jangan** memakai model hasil ekstrak dari game komersial atau model merek mobil asli tanpa izin — itu melanggar hak cipta/merek.

# NEON RUSH — Balap Jalanan Malam (Web Browser)

Game balap 3D di browser dengan gaya permainan *street racing* malam hari: jelajah kota bebas, event balap, tuning performa, modifikasi tampilan, uang & reputasi. Semua visual, nama mobil, merek, kota, dan musik **dibuat orisinal oleh kode** — tidak memakai aset dari game lain.

## Cara menjalankan

**Paling mudah (Windows):** klik dua kali **`jalankan-game.bat`** → browser terbuka di `http://localhost:8080`.
Biarkan jendela "Neon Rush Server" tetap terbuka selama bermain.

Alternatif:
- Klik dua kali `index.html` (bisa langsung jalan dari file; butuh internet untuk memuat Three.js & font).
- Upload seluruh folder ke hosting statis gratis: **GitHub Pages**, **Netlify Drop** (seret folder ke app.netlify.com/drop), atau **Vercel**. Pemain cukup membuka link-nya.

Browser yang disarankan: Chrome / Edge / Firefox terbaru. Bisa juga di HP (kontrol sentuh muncul otomatis; grafis otomatis "Rendah").

## Database pengguna

- **Tanpa pengaturan**: akun & progres disimpan di browser (mode lokal), atau main sebagai Tamu.
- **Online dengan Google Sheets**: ikuti **[PANDUAN_GOOGLE_SHEETS.md](PANDUAN_GOOGLE_SHEETS.md)** lalu tempel URL Web App ke `js/config.js`.

## Fitur gameplay

| Fitur | Keterangan |
|---|---|
| Kota terbuka "Neopolis" | 8×8 blok, gedung kaca & beton, papan neon, lampu jalan, pohon, taman, lalu lintas (lajur kiri) |
| Terowongan Bukit Kabut | Jalan lintas dari sisi timur kota menembus bukit (terowongan 200 m berdinding keramik & lampu kuning) |
| Bandara Neopolis | Landasan pacu 700 m, terminal, menara kontrol, hanggar, pesawat parkir — bisa dijelajahi dengan mobil |
| Landmark kota | **Asus Store Malang** (fasad berlubang + spanduk biru), **Asus Service Center Malang** dua blok di utaranya, **Mall** bundar bergaris merah-putih tepat di seberang Service Center, dan **Stasiun Malang** di selatan kota (pelataran parkir, peron, menara jam) dengan **kereta** yang lewat & berhenti di peron. Semua muncul di peta, bisa dipilih untuk GPS |
| Jalan Kajoetangan Heritage | Jalan berbatu andesit dengan trotoar pola wajik, gapura, deretan toko & cafe bergaya kolonial (meja payung, kanopi bergaris), lampu jalan klasik, bangku & pohon peneduh, serta **Grand Citihub Hotel** (balkon putih bertanaman, fasad terakota, rangka magenta, carport) |
| Toko Calosa | Gedung gelap modern 2 lantai, etalase kaca lantai atas, plafon kayu berlampu, tangga lebar dengan spanduk merah, motor parkir, pagar bilah hitam, papan reklame |
| Lampu lalu lintas | Di setiap simpang 3/4 arah; mobil lalu lintas berhenti saat merah. Lalu lintas lebih ramai dan selalu berada di sekitar pemain |
| Keluar Game | Menu jeda: **Simpan & ke Menu Awal** (kembali ke layar login) atau **Keluar Game** (simpan, matikan suara & server lokal, tutup tab). Suara otomatis berhenti saat tab ditutup/diminimalkan |
| Lalu lintas udara | Pesawat lepas landas → memutar di atas kota → mendarat → taksi kembali; pesawat jelajah, helikopter, balon udara |
| Grafis realistis | Pilihan suasana **Senja / Siang / Malam**, bayangan matahari, pantulan cat clearcoat, bloom cahaya, blur kecepatan, pegunungan di cakrawala |
| 4 mode balap | **Sirkuit** (multi-putaran), **Sprint** (A→B), **Drift** (skor + pengali rantai), **Drag** (transmisi manual, start & oper gigi sempurna) |
| 14 event, 4 tier | Termasuk **Sprint Terowongan Kabut** dan **Drag Landasan Pacu**. Event baru terbuka dengan **REP**; Grand Final butuh 2500 REP |
| AI lawan | Mengikuti lintasan, mengerem sebelum tikungan, pindah lajur, pakai nitro, *rubber band* ringan |
| Jalur balap tertutup | Cabang jalan yang tidak dipakai otomatis diblokir barikade |
| 9 mobil orisinal | Kelas D → S (Kogane Pixel, Vespera GT-1, … Nebula X-9), beli di **Dealer**, jual kembali |
| 7 upgrade performa | Mesin, Turbo, Nitro, Ban, Suspensi, Bobot, Transmisi — 3 level masing-masing |
| Modifikasi tampilan | Cat (16 + warna bebas), finishing (glossy/metalik/mutiara/doff/krom), velg, neon bawah, spoiler, body kit, vinyl, kaca film |
| Studio Desain | Gambar livery sendiri di garasi (kuas, garis, bentuk, teks, stiker, impor PNG/JPG) dengan pratinjau 3D langsung; bisa juga memakai model 3D .glb sendiri. Lihat **[PANDUAN_DESAIN_MOBIL.md](PANDUAN_DESAIN_MOBIL.md)** |
| HUD | Speedometer + RPM, gigi, lampu shift, nitro, minimap berputar, GPS, posisi, waktu putaran |
| Audio | Musik prosedural 6 lagu (synthwave, DnB, house, breaks, chill), suara mesin sintetis, ban decit, nitro, blow-off turbo, tabrakan, klakson |
| Lainnya | Papan peringkat, gamepad, kontrol sentuh, 3 mode kamera, pengaturan kualitas grafis |

## Kontrol

| Tombol | Fungsi |
|---|---|
| `W` / `↑` | Gas |
| `S` / `↓` | Rem / mundur |
| `A` `D` / `←` `→` | Setir |
| `Spasi` | Rem tangan (drift) |
| `Shift` / `N` | Nitro |
| `E` / `Q` | Naik / turun gigi (manual & Drag) · `E` juga masuk event/garasi |
| `C` | Ganti kamera |
| `R` | Kembalikan mobil ke jalan |
| `M` | Peta & daftar event |
| `T` | Lagu berikutnya |
| `Esc` / `P` | Menu |

### Tips drift
Masuk tikungan dengan kecepatan sedang → **tekan Spasi sebentar** (rem tangan) sambil membelok → lepas Spasi, **tahan gas** dan atur sudut dengan setir (setir berlawanan untuk keluar dari drift). Drift panjang menaikkan pengali skor; menabrak dinding menghanguskan rantai skor.

### Grafis & performa
Menu **Pengaturan → Waktu / Suasana** (Senja, Siang, Malam) dan **Kualitas Grafis**. Kualitas *Rendah* mematikan bayangan & efek bloom/blur agar lancar di laptop lama/HP.

## Musik & hak cipta

- Musik bawaan **dikarang oleh kode secara real-time** (Web Audio API) — bebas hak cipta.
- Ingin menambah lagu? Pakai hanya musik gratis/bebas royalti (Pixabay Music, Free Music Archive CC, Incompetech CC BY, YouTube Audio Library). Lihat `music/BACA-SAYA.txt`.
- **Catatan merek:** papan nama "ASUS Store/Service Center" dan nama mall ditulis dengan huruf biasa (bukan file logo resmi) atas permintaan, dan bisa diganti di `LANDMARKS` dalam `js/config.js`. "ASUS" dan nama mall asli adalah merek dagang pemiliknya — jika game dipublikasikan atau dijual, minta izin dulu atau ganti dengan nama karangan.
- Semua nama mobil, merek mobil, karakter, dan event adalah karangan. Model mobil, gedung, dan tekstur dibuat secara prosedural oleh kode.
- Pustaka pihak ketiga: **Three.js r128** (lisensi MIT) dari CDN cdnjs + modul efek Three.js (MIT) dari jsDelivr; font **Orbitron** & **Rajdhani** (SIL Open Font License) dari Google Fonts.

## Struktur folder

```
neon-rush/
├─ index.html               halaman game
├─ css/style.css            tampilan UI
├─ js/config.js             ← PENGATURAN (URL Google Sheets, musik tambahan, uang awal)
├─ js/utils.js              utilitas, SHA-256, penggabung geometri, tekstur kanvas
├─ js/data.js               mobil, part, gaya, event, hadiah (ubah di sini untuk balancing)
├─ js/db.js                 penyimpanan: Google Sheets / localStorage
├─ js/audio.js              musik prosedural & efek suara
├─ js/world.js              pembuat kota, suasana waktu, langit, tabrakan, barikade, penanda event
├─ js/airport.js            jalan lintas, terowongan, bukit, bandara, pesawat/heli/balon
├─ js/landmarks.js          Asus Store, Service Center, Mall, Stasiun + rel & kereta
├─ js/post.js               efek pasca-proses (bloom, blur kecepatan, grading warna)
├─ js/car.js                model mobil 3D & fisika
├─ js/traffic.js            lalu lintas, partikel asap/percikan, tabrakan antar-mobil
├─ js/race.js               lintasan, AI, aturan balapan & hadiah
├─ js/showroom.js           garasi 3D
├─ js/designer.js          Studio Desain livery
├─ js/ui.js                 semua layar & HUD
├─ js/main.js               loop utama, input, kamera
├─ google-apps-script/Code.gs   backend Google Sheets
├─ PANDUAN_GOOGLE_SHEETS.md     langkah demi langkah database
├─ jalankan-game.bat / jalankan-server.ps1   server lokal Windows
└─ music/                   (opsional) lagu gratis milikmu
```

## Kustomisasi cepat

- **Uang awal**: `START_MONEY` di `js/config.js`.
- **Tambah mobil**: salin satu objek di `DATA.CARS` (`js/data.js`), ubah `id`, nama, statistik, dan `shape` (bentuk bodi).
- **Tambah event**: tambahkan ke `DATA.EVENTS`; `route` adalah daftar simpang `[i, j]` (0–8) yang harus segaris.
- **Kesulitan AI**: ubah `skill` dan `up` per tier di `DATA.TIER`.

/* =========================================================================
   NEON RUSH — KONFIGURASI
   Ubah file ini untuk menyambungkan game ke Google Sheets dan musik sendiri.
   ========================================================================= */
window.GAME_CONFIG = {
  // 1) Tempel URL Web App Google Apps Script di sini (lihat PANDUAN_GOOGLE_SHEETS.md)
  //    Contoh: "https://script.google.com/macros/s/AKfycbx..../exec"
  //    Jika dikosongkan, akun & progres disimpan di browser (mode lokal).
  SHEETS_URL: "",

  // 2) (Opsional) Musik sendiri dari sumber GRATIS / bebas royalti.
  //    Letakkan file .mp3 di folder "music/" lalu daftarkan di sini.
  //    Game sudah punya musik prosedural bawaan (dibuat oleh kode, 100% bebas hak cipta),
  //    jadi daftar ini boleh kosong.
  //    Contoh:
  //    { title: "Judul Lagu", artist: "Nama Artis", url: "music/lagu1.mp3", license: "Pixabay Content License" },
  MUSIC_TRACKS: [
  ],

  // 3) Uang awal pemain baru
  START_MONEY: 5000,

  // 5) (Opsional, lanjutan) Model mobil 3D buatan sendiri (.glb).
  //    Taruh file di folder "models/" lalu daftarkan di sini, kunci = id mobil di game:
  //    pixel, vespera, rondo, kitsune, bravado, hayate, orion, spectre, nebula.
  //    Lihat PANDUAN_DESAIN_MOBIL.md. Hanya berfungsi bila game dijalankan lewat jalankan-game.bat.
  //    Contoh:
  //    CUSTOM_MODELS: {
  //      pixel: { url: "models/mobilku.glb", rotateY: 0, scale: 1 },
  //    },
  CUSTOM_MODELS: {
  },

  // 4) Nama tempat/landmark di kota (tulisan di papan nama gedung).
  //    PENTING: "ASUS" dan nama mall asli adalah merek dagang milik pemiliknya.
  //    Jika game dipublikasikan/dijual, pastikan sudah mendapat izin, atau ganti
  //    dengan nama karangan sendiri di sini.
  LANDMARKS: {
    STORE_BRAND: "ASUS",
    STORE: "ASUS STORE MALANG",
    SERVICE: "ASUS SERVICE CENTER",
    SERVICE_CITY: "MALANG",
    MALL: "CYBER MALL",
    STATION: "STASIUN MALANG",
    CALOSA: "calosa",
    STREET: "KAJOETANGAN HERITAGE",
    HOTEL: "GRAND CITIHUB HOTEL",
    HOTEL_SUB: "@KAJOETANGAN",
  },
};

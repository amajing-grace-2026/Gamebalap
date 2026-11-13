/* =========================================================================
   LANDMARK KOTA: Asus Store Malang, Asus Service Center Malang,
   Mall (seberang Service Center), Stasiun Kereta + rel + kereta berjalan.
   Semua bangunan dibuat prosedural oleh kode. Nama bisa diubah di config.js.
   ========================================================================= */
const Landmarks = {
  // blok yang dikosongkan dari gedung acak (cx,cz)
  RES: {
    '3,4': 'store', '3,6': 'service', '4,6': 'mall', '4,3': 'calosa',
    // Jalan Kayutangan (jalan x=200, z 100..500): blok di kedua sisinya
    '1,1': 'kayu', '1,2': 'kayu', '1,3': 'kayu', '1,4': 'kayu', '2,1': 'kayu', '2,2': 'kayu', '2,3': 'kayu', '2,4': 'kayu',
  },
  KAYU: { x: 200, z0: 100, z1: 500 },
  // jalan kayutangan tidak memakai marka putus-putus biasa
  isHeritageRoad(horiz, line, seg) { return !horiz && line === 2 && seg >= 1 && seg <= 4; },
  ST: { gap: [388, 412], plaza: { x0: 300, x1: 500, z0: -110, z1: -12 }, trackZ: -128, bld: { x0: 300, x1: 380, z0: -108, z1: -92 } },
  pois: [],
  reserved(cx, cz) { return this.RES[cx + ',' + cz] || null; },
  N() {
    const L = (window.GAME_CONFIG && GAME_CONFIG.LANDMARKS) || {};
    return {
      brand: L.STORE_BRAND || 'ASUS', store: L.STORE || 'ASUS STORE MALANG', service: L.SERVICE || 'ASUS SERVICE CENTER',
      city: L.SERVICE_CITY || 'MALANG', mall: L.MALL || 'CYBER MALL', station: L.STATION || 'STASIUN MALANG',
      calosa: L.CALOSA || 'calosa', street: L.STREET || 'KAJOETANGAN HERITAGE',
      hotel: L.HOTEL || 'GRAND CITIHUB HOTEL', hotelSub: L.HOTEL_SUB || '@KAJOETANGAN',
    };
  },

  build(scene, T, quality) {
    this.scene = scene; this.T = T;
    this.night = World.timeKey === 'night';
    this.lit = this.night ? 1 : World.timeKey === 'dusk' ? 0.75 : 0.35; // terang interior/papan
    this.shadow = quality !== 'low';
    const nm = this.N();
    this.fill = [0, 1, 2, 3].map(() => new GeoBatch());
    this.roofB = new GeoBatch();
    this._store(nm);
    this._service(nm);
    this._mall(nm);
    this._station(nm);
    this._calosa(nm);
    this._kayutangan(nm);
    // gedung pengisi sisa blok
    this.fill.forEach((b, i) => { if (b.count) this._mesh(new THREE.Mesh(b.build(), World.buildingMats[i]), true); });
    if (this.roofB.count) this._mesh(new THREE.Mesh(this.roofB.build(), new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.9 })), true);
    this.pois = [
      { id: 'store', label: nm.store, x: 390, z: 432, color: '#2f7bff', icon: 'A' },
      { id: 'service', label: nm.service + ' ' + nm.city, x: 390, z: 646, color: '#00c8ff', icon: 'S' },
      { id: 'mall', label: nm.mall, x: 410, z: 650, color: '#ff5a4a', icon: 'M', above: true },
      { id: 'station', label: nm.station, x: 400, z: -40, color: '#ffd400', icon: 'K' },
      { id: 'calosa', label: 'CALOSA Laptop & Gadget', x: 410, z: 350, color: '#d8d8d8', icon: 'C' },
      { id: 'kayu', label: 'Jalan ' + nm.street, x: 200, z: 340, color: '#c98a4a', icon: 'J' },
      { id: 'hotel', label: nm.hotel, x: 212, z: 232, color: '#e0359a', icon: 'H' },
    ];
  },

  // ---------------- helper
  _mesh(m, cast) { if (this.shadow) { m.castShadow = !!cast; m.receiveShadow = true; } this.scene.add(m); return m; },
  _box(w, h, d, mat, x, y, z, cast = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    return this._mesh(m, cast);
  },
  // gedung biasa memakai material fasad kota
  _filler(x0, z0, x1, z1, h, v) {
    this.fill[v].box((x0 + x1) / 2, 0.3 + h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, { faces: 'XxZz', tileW: 16, tileH: 28 });
    this.roofB.box((x0 + x1) / 2, 0.3 + h + 0.01, (z0 + z1) / 2, x1 - x0, 0.02, z1 - z0, { faces: 'Y' });
  },
  // bidang bergambar: face = arah normal ('+x','-x','+z','-z')
  _panel(tex, w, h, x, y, z, face, opts = {}) {
    const mat = opts.basic
      ? new THREE.MeshBasicMaterial({ map: tex, transparent: !!opts.alpha, alphaTest: opts.alpha ? 0.3 : 0, color: new THREE.Color(opts.k || 1, opts.k || 1, opts.k || 1), side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: opts.emi == null ? this.lit * 0.7 : opts.emi, roughness: opts.rough || 0.5, metalness: 0.05, transparent: !!opts.alpha, alphaTest: opts.alpha ? 0.3 : 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[face];
    this.scene.add(m);
    return m;
  },
  _text(w, h, draw) {
    const c = Tex.canvas(w, h);
    draw(c.getContext('2d'), w, h);
    return Tex.make(c);
  },
  _glass(op) {
    return new THREE.MeshStandardMaterial({ color: 0x1a2a3a, roughness: 0.04, metalness: 0.9, envMap: World.envMap, envMapIntensity: 1.4, transparent: true, opacity: op || 0.35, depthWrite: false });
  },
  _perfTex() {
    return Tex.get('perf', () => {
      const c = Tex.canvas(128, 128);
      const g = c.getContext('2d');
      g.fillStyle = '#ecebe6'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#6b6b70';
      for (let y = 4; y < 128; y += 8) for (let x = 4; x < 128; x += 8) { g.beginPath(); g.arc(x + ((y / 8) % 2) * 4, y, 1.3, 0, Math.PI * 2); g.fill(); }
      return Tex.make(c, true);
    });
  },

  // ======================= ASUS STORE MALANG =======================
  _store(nm) {
    // blok (3,4): x 312..388, z 412..488. Muka toko menghadap jalan x=400 (+x)
    const x0 = 362, xf = 384, z0 = 418, z1 = 446, zc = (z0 + z1) / 2, W = z1 - z0;
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ef, roughness: 0.6 });
    const perf = this._perfTex().clone(); perf.needsUpdate = true; perf.repeat.set(W / 2.5, 14.3 / 2.5);
    const perfMat = new THREE.MeshStandardMaterial({ map: perf, roughness: 0.7 });
    // lantai dasar (lebih mundur) + fasad atas berlubang (sisi +x)
    this._box(xf - 3 - x0, 5, W, white, (x0 + xf - 3) / 2, 2.8, zc);
    this._box(xf - x0, 14.3, W, [perfMat, white, white, white, white, white], (x0 + xf) / 2, 12.45, zc);
    // interior bercahaya di balik kaca
    const inter = this._text(1024, 192, (g, w, h) => {
      g.fillStyle = '#e9edf2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#cfd6de'; g.fillRect(0, h * 0.72, w, h * 0.28);
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c9a77a'; g.fillRect(w * 0.42, h * 0.55, w * 0.16, h * 0.3); // meja kasir kayu
      g.fillStyle = '#9b7b55'; g.fillRect(w * 0.42, h * 0.55, w * 0.16, 6);
      g.fillStyle = '#1b1f2a'; g.font = 'bold 54px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(nm.brand, w * 0.5, h * 0.32);
      for (let i = 0; i < 6; i++) { // rak laptop
        const x = (i < 3 ? 0.05 + i * 0.11 : 0.62 + (i - 3) * 0.11) * w;
        g.fillStyle = '#ffffff'; g.fillRect(x, h * 0.6, w * 0.09, h * 0.16);
        g.fillStyle = '#2a2f3a'; g.fillRect(x + 8, h * 0.45, w * 0.09 - 16, h * 0.15);
        g.fillStyle = ['#6aa8ff', '#ff6ad5', '#7cf3ff'][i % 3]; g.fillRect(x + 11, h * 0.47, w * 0.09 - 22, h * 0.11);
      }
      g.fillStyle = '#2f5bd8'; [[0.35, 0.22], [0.66, 0.2], [0.9, 0.3]].forEach(([x, y]) => { g.beginPath(); g.arc(x * w, y * h, 14, 0, Math.PI * 2); g.fill(); });
    });
    this._panel(inter, W - 1, 4.5, xf - 2.98, 2.6, zc, '+x', { emi: 0.35 + this.lit * 0.6, rough: 0.9 });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 4.6), this._glass(0.28));
    glass.position.set(xf - 0.4, 2.65, zc); glass.rotation.y = Math.PI / 2; this.scene.add(glass);
    [z0 + 0.5, zc - 4, z1 - 0.5].forEach((z) => this._box(0.9, 5, 0.9, white, xf - 0.4, 2.8, z));
    this._box(0.08, 0.15, W - 1, new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 }), xf - 0.4, 0.35, zc);
    // spanduk biru besar
    const banner = this._text(1024, 560, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0, '#1a1f6e'); gr.addColorStop(0.55, '#33268a'); gr.addColorStop(1, '#141047');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.6})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 76px Arial Black, Arial'; g.fillText(nm.brand, w / 2, 70);
      g.font = 'bold 50px Arial'; g.fillText('LAPTOP • GAMING • AI PC', w / 2, 160);
      // siluet laptop
      for (let i = 0; i < 5; i++) {
        const cx = w * (0.26 + i * 0.12), cy = 300 + (i % 2) * 14;
        g.fillStyle = '#c9cede'; g.beginPath(); g.moveTo(cx - 70, cy + 40); g.lineTo(cx + 70, cy + 40); g.lineTo(cx + 84, cy + 54); g.lineTo(cx - 84, cy + 54); g.closePath(); g.fill();
        const sg = g.createLinearGradient(cx - 60, cy - 50, cx + 60, cy + 30);
        sg.addColorStop(0, ['#ff5ab4', '#5ab4ff', '#ffb35a', '#9a5aff', '#5affc8'][i]); sg.addColorStop(1, '#1b1b3a');
        g.fillStyle = '#20222c'; g.fillRect(cx - 66, cy - 56, 132, 94);
        g.fillStyle = sg; g.fillRect(cx - 60, cy - 50, 120, 82);
      }
      g.fillStyle = '#fff'; g.font = 'bold 44px Arial'; g.fillText('SOLUSI AI PALING LENGKAP', w / 2, 430);
      g.font = 'bold 40px Arial'; g.fillText(nm.store, w * 0.68, 505);
      g.strokeStyle = '#cfd6ff'; g.lineWidth = 4; g.beginPath(); g.arc(120, 490, 44, 0, Math.PI * 2); g.stroke();
      g.font = 'bold 34px Arial'; g.fillText('AI', 120, 492);
    });
    this._panel(banner, W - 8, (W - 8) * 0.547, xf + 0.06, 11.8, zc, '+x', { emi: 0.25 + this.lit * 0.55 });
    // huruf merek di puncak fasad (efek timbul)
    const logo = this._text(1024, 160, (g, w, h) => {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic bold 130px Arial Black, Arial';
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillText(nm.brand, w / 2 + 6, h / 2 + 6);
      g.fillStyle = '#f7f7f5'; g.fillText(nm.brand, w / 2, h / 2);
    });
    this._panel(logo, 15, 2.3, xf + 0.12, 18.2, zc, '+x', { alpha: true, emi: 0.2 });
    // papan nama toko di atas kaca (menyala)
    const name = this._text(1024, 96, (g, w, h) => {
      g.fillStyle = '#0d1a5c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = 'bold 60px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(nm.store, w / 2, h / 2 + 2);
    });
    this._panel(name, 14, 1.3, xf + 0.08, 5.45, zc, '+x', { emi: 0.4 + this.lit * 0.8 });
    // gedung pengisi di sisa blok
    this._filler(318, 418, 356, 482, 32, 1);
    this._filler(362, 452, 384, 482, 18, 2);
  },

  // ======================= ASUS SERVICE CENTER MALANG =======================
  _service(nm) {
    // blok (3,6): x 312..388, z 612..688, menghadap +x
    const x0 = 358, xf = 384, z0 = 630, z1 = 662, zc = (z0 + z1) / 2, W = z1 - z0;
    const clad = new THREE.MeshStandardMaterial({ color: 0x2c3442, roughness: 0.45, metalness: 0.5, envMap: World.envMap, envMapIntensity: 0.6 });
    const light = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.6 });
    this._box(xf - 2 - x0, 4.8, W, light, (x0 + xf - 2) / 2, 2.7, zc);
    this._box(xf - x0, 9, W, clad, (x0 + xf) / 2, 9.6, zc);
    // jendela pita lantai 2
    const band = new THREE.Mesh(new THREE.PlaneGeometry(W - 3, 3.2), this._glass(0.85));
    band.position.set(xf + 0.03, 9.4, zc); band.rotation.y = Math.PI / 2; this.scene.add(band);
    const inter = this._text(1024, 192, (g, w, h) => {
      g.fillStyle = '#f1f4f7'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d5dbe2'; g.fillRect(0, h * 0.74, w, h * 0.26);
      for (let i = 0; i < 4; i++) { // loket servis
        const x = w * (0.08 + i * 0.22);
        g.fillStyle = '#1f6fd8'; g.fillRect(x, h * 0.5, w * 0.17, h * 0.26);
        g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.textAlign = 'center'; g.fillText('LOKET ' + (i + 1), x + w * 0.085, h * 0.64);
        g.fillStyle = '#2a2f3a'; g.fillRect(x + w * 0.06, h * 0.4, w * 0.05, h * 0.1);
      }
      g.fillStyle = '#10151d'; g.fillRect(w * 0.38, h * 0.08, w * 0.24, h * 0.24);
      g.fillStyle = '#ff3355'; g.font = 'bold 34px Arial'; g.fillText('ANTRIAN  A-012', w * 0.5, h * 0.22);
      g.fillStyle = '#7a8594';
      for (let i = 0; i < 10; i++) g.fillRect(w * (0.05 + i * 0.095), h * 0.86, w * 0.07, h * 0.05); // kursi tunggu
    });
    this._panel(inter, W - 1, 4.3, xf - 1.98, 2.55, zc, '+x', { emi: 0.35 + this.lit * 0.6, rough: 0.9 });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - 1, 4.4), this._glass(0.25));
    glass.position.set(xf - 0.3, 2.55, zc); glass.rotation.y = Math.PI / 2; this.scene.add(glass);
    [z0 + 0.5, zc, z1 - 0.5].forEach((z) => this._box(0.7, 4.8, 0.7, light, xf - 0.3, 2.7, z));
    const sign = this._text(1024, 160, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#0a1a4a'); gr.addColorStop(1, '#0d2e7a');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff'; g.font = 'bold 66px Arial'; g.fillText(nm.service, w / 2, 58);
      g.fillStyle = '#5fe0ff'; g.font = 'bold 46px Arial'; g.fillText(nm.city, w / 2, 122);
    });
    this._panel(sign, W - 4, (W - 4) * 0.156, xf + 0.06, 6.4, zc, '+x', { emi: 0.45 + this.lit * 0.9 });
    const top = this._text(1024, 160, (g, w, h) => {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'italic bold 120px Arial Black, Arial';
      g.fillStyle = '#ffffff'; g.shadowColor = '#4ab8ff'; g.shadowBlur = 18; g.fillText(nm.brand, w / 2, h / 2);
    });
    this._panel(top, 12, 1.9, xf + 0.08, 12.9, zc, '+x', { alpha: true, basic: true, k: this.night ? 2 : 1.2 });
    // tiang papan nama di trotoar
    this._box(0.3, 6, 0.3, clad, 386.5, 3.3, z0 - 2);
    this._panel(sign, 4, 0.7, 386.5, 6.3, z0 - 2, '+x', { emi: 0.5 + this.lit * 0.8 });
    this._filler(318, 618, 354, 682, 26, 3);
    this._filler(358, 618, 384, 626, 14, 0);
    this._filler(358, 666, 384, 682, 20, 2);
  },

  // ======================= MALL (seberang Service Center) =======================
  _mall(nm) {
    // blok (4,6): x 412..488, z 612..688, menghadap jalan x=400 (-x)
    const cx = 452, cz = 650, R = 30, H = 28;
    const tex = this._mallTex();
    const mapT = tex.map.clone(), emiT = tex.emi.clone();
    [mapT, emiT].forEach((t) => { t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.repeat.set(22, 1); });
    const drumMat = new THREE.MeshStandardMaterial({ map: mapT, emissiveMap: emiT, emissive: 0xffffff, emissiveIntensity: 0.4 + this.lit * 0.8, roughness: 0.55, metalness: 0.15, envMap: World.envMap, envMapIntensity: 0.5 });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64), [drumMat, new THREE.MeshStandardMaterial({ color: 0x5a5352 }), new THREE.MeshStandardMaterial({ color: 0x5a5352 })]);
    drum.position.set(cx, H / 2 + 0.3, cz);
    this._mesh(drum, true);
    // sayap belakang bergaris
    const wingT = tex.map.clone(), wingE = tex.emi.clone();
    [wingT, wingE].forEach((t) => { t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.repeat.set(5, 1); });
    const wingMat = new THREE.MeshStandardMaterial({ map: wingT, emissiveMap: wingE, emissive: 0xffffff, emissiveIntensity: 0.3 + this.lit * 0.6, roughness: 0.6 });
    this._box(26, 24, 66, wingMat, 471, 12.3, 650);
    // mahkota merah + rangka baja di puncak
    const red = new THREE.MeshStandardMaterial({ color: 0xa8372c, roughness: 0.55 });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.6, R + 1.2, 4.5, 64, 1, true), red);
    crown.material.side = THREE.DoubleSide;
    crown.position.set(cx, H + 0.3 - 1.5, cz);
    this._mesh(crown, true);
    const truss = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.9, R + 1.9, 3.2, 64, 2, true), new THREE.MeshBasicMaterial({ color: 0x5a3a2a, wireframe: true }));
    truss.position.set(cx, H + 2.4, cz);
    this.scene.add(truss);
    // tulisan nama mall melengkung (menghadap -x)
    const arc = 1.9;
    const signT = this._text(2048, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 190px Arial';
      g.shadowColor = '#9ad8ff'; g.shadowBlur = 24;
      g.fillStyle = '#f2f8ff';
      g.fillText(nm.mall.split('').join(' '), w / 2, h / 2 + 6);
      g.shadowBlur = 0;
      g.strokeStyle = '#2f8cff'; g.lineWidth = 10;
      g.beginPath(); g.ellipse(w * 0.17, h / 2, 120, 90, -0.4, 0.5, 4.6); g.stroke();
    });
    const sk = this.night ? 2.2 : World.timeKey === 'dusk' ? 1.6 : 1.05;
    const signM = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 2.1, R + 2.1, 5, 48, 1, true, -Math.PI / 2 - arc / 2, arc),
      new THREE.MeshBasicMaterial({ map: signT, transparent: true, alphaTest: 0.25, side: THREE.FrontSide, color: new THREE.Color(sk, sk, sk) }),
    );
    signM.position.set(cx, H + 5.2, cz);
    this.scene.add(signM);
    // pilar abu-abu di sisi depan
    const grey = new THREE.MeshStandardMaterial({ color: 0x8c9198, roughness: 0.6, metalness: 0.2, envMap: World.envMap, envMapIntensity: 0.3 });
    for (let k = -4; k <= 4; k++) {
      const a = Math.PI + k * 0.26;
      const p = this._box(1.8, 22, 1.8, grey, cx + Math.cos(a) * (R + 0.6), 14.5, cz + Math.sin(a) * (R + 0.6));
      p.rotation.y = -a;
    }
    // kanopi rangka ruang (space frame) penuh lampu di pintu masuk
    this._spaceFrame(414, 434, cz - 20, cz + 20, 9.5, 11.5);
    // tembok batu + pagar tanaman + lampu bola + palem
    const stone = new THREE.MeshStandardMaterial({ map: this._stoneTex(), roughness: 1 });
    const hedge = new THREE.MeshStandardMaterial({ color: 0x2f5a26, roughness: 1, flatShading: true });
    [[614, cz - 12], [cz + 12, 686]].forEach(([a, b]) => {
      this._box(2.4, 1.3, b - a, stone, 414.6, 0.95, (a + b) / 2);
      this._box(2, 0.9, b - a - 0.4, hedge, 414.6, 2, (a + b) / 2);
    });
    const globeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 1.9) });
    [[414.5, cz - 13], [414.5, cz + 13], [414.5, 620], [414.5, 680]].forEach(([x, z]) => {
      this._box(0.18, 3.6, 0.18, grey, x, 2.1, z);
      const gl = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), globeM); gl.position.set(x, 4.1, z); this.scene.add(gl);
    });
    [[417, 618], [417, 628], [417, 672], [417, 682], [486, 616]].forEach(([x, z], i) => this._palm(x, z, 9 + (i % 3) * 2));
    // papan bioskop di sayap (pengganti logo asli)
    const cin = this._text(512, 256, (g, w, h) => {
      g.fillStyle = '#8a1c1c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffd0a0'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#fff'; g.font = 'bold 96px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ff6a6a'; g.shadowBlur = 16; g.fillText('BIOSKOP', w / 2, h / 2);
    });
    this._panel(cin, 9, 4.5, 457.9, 20, 622, '-x', { basic: true, k: this.night ? 2 : 1.2 });
    // tulisan nama mall di bagian bawah depan (terlihat dari sudut pandang mobil)
    const lowT = this._text(1024, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7a1f18'); gr.addColorStop(1, '#4a120e');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 92px Arial';
      g.shadowColor = '#9ad8ff'; g.shadowBlur = 18; g.fillStyle = '#f4faff';
      g.fillText(nm.mall.split('').join(' '), w / 2, h / 2 + 4);
    });
    const lowM = new THREE.MeshStandardMaterial({ map: lowT, emissiveMap: lowT, emissive: 0xffffff, emissiveIntensity: 0.5 + this.lit * 0.9, roughness: 0.5 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 2.2, 48, 1, true, -Math.PI / 2 - 0.62, 1.24), lowM);
    band.position.set(cx, 6.8, cz);
    this.scene.add(band);
    // papan nama monumen di atas pagar tanaman, sejajar mata pengemudi
    const mon = this._text(1024, 160, (g, w, h) => {
      g.fillStyle = '#1b1d22'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#b23b2e'; g.lineWidth = 10; g.strokeRect(6, 6, w - 12, h - 12);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 104px Arial';
      g.shadowColor = '#5ab8ff'; g.shadowBlur = 20; g.fillStyle = '#ffffff';
      g.fillText(nm.mall, w / 2, h / 2 + 4);
    });
    [cz - 25, cz + 25].forEach((z) => {
      this._box(0.6, 3.4, 13, stone, 413.6, 1.7, z);
      this._panel(mon, 12.4, 1.95, 413.28, 2.45, z, '-x', { emi: 0.5 + this.lit * 0.9 });
    });
    // lampu ungu di kaca
    const purple = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.5, 2.2) });
    for (let k = -3; k <= 3; k += 2) {
      const a = Math.PI + k * 0.13;
      const b = this._box(3.2, 2.4, 0.2, purple, cx + Math.cos(a) * (R + 0.05), 20.3, cz + Math.sin(a) * (R + 0.05), false);
      b.rotation.y = -a + Math.PI / 2;
    }
  },
  _mallTex() {
    const H = 28, ppm = 512 / H;
    const c = Tex.canvas(64, 512), e = Tex.canvas(64, 512);
    const g = c.getContext('2d'), ge = e.getContext('2d');
    ge.fillStyle = '#000'; ge.fillRect(0, 0, 64, 512);
    const yOf = (m) => 512 - m * ppm; // meter dari bawah → y kanvas
    // lantai dasar: kaca toko
    g.fillStyle = '#26394c'; g.fillRect(0, yOf(5), 64, 5 * ppm);
    ge.fillStyle = '#ffe2b0'; ge.fillRect(4, yOf(4.6), 56, 3.6 * ppm);
    g.fillStyle = '#d8c9a8'; g.fillRect(4, yOf(4.6), 56, 3.6 * ppm);
    // garis merah-putih
    for (let m = 5, i = 0; m < 18; m += 1.3, i++) {
      g.fillStyle = i % 2 ? '#ece6dc' : '#b23b2e';
      g.fillRect(0, yOf(m + 1.3), 64, 1.3 * ppm + 1);
    }
    // pita kaca biru
    g.fillStyle = '#1d2f4a'; g.fillRect(0, yOf(22), 64, 4 * ppm);
    g.fillStyle = '#3a5a86'; g.fillRect(6, yOf(21.6), 52, 3.2 * ppm);
    ge.fillStyle = '#3a1a5a'; ge.fillRect(6, yOf(21.6), 52, 3.2 * ppm);
    // mahkota
    g.fillStyle = '#a8372c'; g.fillRect(0, 0, 64, yOf(22));
    g.fillStyle = '#e8e2d8'; g.fillRect(0, yOf(22.6), 64, 0.6 * ppm);
    // sambungan panel
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 2, 512);
    return { map: Tex.make(c, true), emi: Tex.make(e, true) };
  },
  _stoneTex() {
    return Tex.get('stone', () => {
      const c = Tex.canvas(128, 64);
      const g = c.getContext('2d');
      g.fillStyle = '#5d5a55'; g.fillRect(0, 0, 128, 64);
      for (let i = 0; i < 40; i++) {
        const v = 70 + Math.random() * 50;
        g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
        g.fillRect(Math.random() * 128, Math.random() * 64, 12 + Math.random() * 20, 8 + Math.random() * 10);
      }
      return Tex.make(c, true);
    });
  },
  _spaceFrame(x0, x1, z0, z1, yLow, yHigh) {
    const pts = [], lights = [];
    const step = 2.5, depth = 1.2;
    const yAt = (x) => U.lerp(yLow, yHigh, (x - x0) / (x1 - x0));
    for (let x = x0; x <= x1 + 0.01; x += step) {
      for (let z = z0; z <= z1 + 0.01; z += step) {
        const y = yAt(x);
        if (x + step <= x1 + 0.01) pts.push(x, y, z, x + step, yAt(x + step), z);
        if (z + step <= z1 + 0.01) pts.push(x, y, z, x, y, z + step);
        if (x + step <= x1 + 0.01 && z + step <= z1 + 0.01) {
          const bx = x + step / 2, bz = z + step / 2, by = yAt(bx) - depth;
          [[x, z], [x + step, z], [x, z + step], [x + step, z + step]].forEach(([tx, tz]) => pts.push(bx, by, bz, tx, yAt(tx), tz));
          lights.push(bx, by - 0.1, bz);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x8a6a3a })));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
    const k = this.night ? 3 : 1.8;
    this.scene.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: new THREE.Color(k, k * 0.95, k * 0.85), size: 0.7, map: Tex.get('dot', () => Tex.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    const rgeo = new THREE.PlaneGeometry(Math.hypot(x1 - x0, yHigh - yLow) + 2, z1 - z0 + 2).rotateX(-Math.PI / 2);
    const roof = new THREE.Mesh(rgeo, new THREE.MeshStandardMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
    roof.rotation.z = Math.atan2(yHigh - yLow, x1 - x0);
    roof.position.set((x0 + x1) / 2, (yLow + yHigh) / 2 + 0.05, (z0 + z1) / 2);
    this.scene.add(roof);
    const col = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.6, roughness: 0.4 });
    [[x0 + 1, z0 + 1], [x0 + 1, z1 - 1], [x0 + 1, (z0 + z1) / 2 - 6], [x0 + 1, (z0 + z1) / 2 + 6]].forEach(([x, z]) => this._box(0.35, yAt(x) - 0.3, 0.35, col, x, (yAt(x) + 0.3) / 2, z));
  },
  _palm(x, z, h) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, h, 7), new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 1 }));
    trunk.position.y = h / 2; g.add(trunk);
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f6a2a, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
    for (let k = 0; k < 10; k++) {
      const piv = new THREE.Group();
      piv.position.y = h;
      piv.rotation.y = (k / 10) * Math.PI * 2;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 3.6, 1, 3), leaf);
      const pos = f.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, -((y + 1.8) ** 2) * 0.12); } // melengkung
      f.geometry.computeVertexNormals();
      f.rotation.x = -Math.PI / 2 + 0.35;
      f.position.z = 1.7;
      piv.add(f);
      g.add(piv);
    }
    g.position.set(x, 0.3, z);
    g.traverse((o) => { if (o.isMesh && this.shadow) o.castShadow = true; });
    this.scene.add(g);
  },

  // ======================= STASIUN KERETA =======================
  _station(nm) {
    const S = this.ST, P = S.plaza, B = S.bld, tz = S.trackZ;
    // pelataran parkir (aspal) + dinding
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0 + 4), World.asphaltMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set((P.x0 + P.x1) / 2, 0.004, (P.z0 + P.z1) / 2 - 2);
    plaza.receiveShadow = true;
    const uv = plaza.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 25, uv.getY(i) * 13);
    this.scene.add(plaza);
    World.addWall(P.x0 - 3, P.z0 - 3, P.x0, P.z1);
    World.addWall(P.x1, P.z0 - 3, P.x1 + 3, P.z1);
    World.addWall(P.x0, P.z0 - 3, P.x1, P.z0);
    World.addWall(B.x0, B.z0, B.x1, B.z1);
    const conc = new THREE.MeshStandardMaterial({ color: 0xbdb7ae, roughness: 0.9 });
    this._box(3, 1.4, P.z1 - P.z0, conc, P.x0 - 1.5, 0.7, (P.z0 + P.z1) / 2);
    this._box(3, 1.4, P.z1 - P.z0, conc, P.x1 + 1.5, 0.7, (P.z0 + P.z1) / 2);
    // marka parkir
    const mk = new GeoBatch();
    for (let x = 310; x < 380; x += 3) mk.flat(x, 0.03, -60, 0.15, 6);
    for (let x = 420; x < 492; x += 3) mk.flat(x, 0.03, -60, 0.15, 6);
    for (let x = 310; x < 380; x += 3) mk.flat(x, 0.03, -30, 0.15, 6);
    for (let x = 420; x < 492; x += 3) mk.flat(x, 0.03, -30, 0.15, 6);
    this.scene.add(new THREE.Mesh(mk.build(), new THREE.MeshBasicMaterial({ color: World.T.marks, polygonOffset: true, polygonOffsetFactor: -1 })));
    // gedung stasiun: dinding putih berjendela lengkung, atap genteng, menara jam
    const wallT = this._text(512, 128, (g, w, h) => {
      g.fillStyle = '#f1ede4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d9d2c4'; g.fillRect(0, h - 14, w, 14);
      for (let i = 0; i < 8; i++) {
        const x = 18 + i * 62;
        g.fillStyle = '#3a4656';
        g.beginPath(); g.moveTo(x, h - 22); g.lineTo(x, 46); g.arc(x + 17, 46, 17, Math.PI, 0); g.lineTo(x + 34, h - 22); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,214,150,0.55)'; g.fillRect(x + 4, 54, 26, h - 80);
        g.strokeStyle = '#f1ede4'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 17, 30); g.lineTo(x + 17, h - 22); g.stroke();
      }
    });
    const wallE = this._text(512, 128, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) { g.fillStyle = '#ffcf8a'; g.fillRect(18 + i * 62 + 4, 54, 26, h - 80); }
    });
    const wallMat = new THREE.MeshStandardMaterial({ map: wallT, emissiveMap: wallE, emissive: 0xffffff, emissiveIntensity: this.lit * 0.8, roughness: 0.8 });
    const plain = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.8 });
    const bw = B.x1 - B.x0, bd = B.z1 - B.z0, bh = 9;
    this._box(bw, bh, bd, [plain, plain, plain, plain, wallMat, plain], (B.x0 + B.x1) / 2, bh / 2 + 0.3, (B.z0 + B.z1) / 2);
    const tile = new THREE.MeshStandardMaterial({ color: 0xb4532f, roughness: 0.85, flatShading: true });
    const gable = new THREE.Shape();
    gable.moveTo(-bd / 2 - 1, 0); gable.lineTo(bd / 2 + 1, 0); gable.lineTo(0, 5); gable.closePath();
    const rg = new THREE.ExtrudeGeometry(gable, { depth: bw + 2, bevelEnabled: false });
    rg.rotateY(Math.PI / 2);
    const roof = new THREE.Mesh(rg, tile);
    roof.position.set(B.x0 - 1, bh + 0.3, (B.z0 + B.z1) / 2);
    this._mesh(roof, true);
    // menara jam
    const tx = 340, tzc = (B.z0 + B.z1) / 2;
    this._box(10, 19, 10, plain, tx, 9.8, tzc + 1);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(7.8, 6, 4), tile);
    cap.rotation.y = Math.PI / 4; cap.position.set(tx, 22.3, tzc + 1);
    this._mesh(cap, true);
    const clock = this._text(256, 256, (g, w) => {
      g.fillStyle = '#f8f6ee'; g.beginPath(); g.arc(128, 128, 120, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 8; g.stroke();
      g.fillStyle = '#2a2a2a';
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillRect(128 + Math.sin(a) * 100 - 4, 128 - Math.cos(a) * 100 - 4, 8, 8); }
      g.lineWidth = 9; g.beginPath(); g.moveTo(128, 128); g.lineTo(128, 52); g.stroke();
      g.lineWidth = 7; g.beginPath(); g.moveTo(128, 128); g.lineTo(186, 150); g.stroke();
    });
    this._panel(clock, 6, 6, tx, 15.5, tzc + 6.05, '+z', { emi: 0.3 + this.lit * 0.4, alpha: true });
    // papan nama stasiun
    const sign = this._text(1024, 160, (g, w, h) => {
      g.fillStyle = '#0d2b6b'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#fff'; g.font = 'bold 92px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(nm.station, w / 2, h / 2 + 4);
    });
    this._panel(sign, 26, 4, 362, 8, B.z1 + 0.08, '+z', { emi: 0.35 + this.lit * 0.7 });
    // serambi masuk
    const por = this._box(16, 0.5, 5, plain, 362, 5.3, B.z1 + 2.5);
    [354.5, 369.5].forEach((x) => this._box(0.8, 5, 0.8, plain, x, 2.8, B.z1 + 4.6));
    // peron + kanopi
    const pf = { x0: 230, x1: 570, z0: tz + 6, z1: -110 };
    this._box(pf.x1 - pf.x0, 0.9, pf.z1 - pf.z0, conc, (pf.x0 + pf.x1) / 2, 0.45, (pf.z0 + pf.z1) / 2);
    const yl = new THREE.Mesh(new THREE.PlaneGeometry(pf.x1 - pf.x0, 0.4), new THREE.MeshBasicMaterial({ color: 0xe0b400 }));
    yl.rotation.x = -Math.PI / 2; yl.position.set((pf.x0 + pf.x1) / 2, 0.92, pf.z0 + 0.8); this.scene.add(yl);
    const canopyM = new THREE.MeshStandardMaterial({ color: 0x5f6f62, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide });
    this._box(pf.x1 - pf.x0 - 20, 0.3, 15, canopyM, (pf.x0 + pf.x1) / 2, 6, (pf.z0 + pf.z1) / 2 - 0.5);
    const colM = new THREE.MeshStandardMaterial({ color: 0x3d4a40, metalness: 0.6, roughness: 0.4 });
    for (let x = pf.x0 + 15; x < pf.x1 - 10; x += 14) this._box(0.4, 5.1, 0.4, colM, x, 3.4, (pf.z0 + pf.z1) / 2);
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.8, 1.7) });
    for (let x = pf.x0 + 20; x < pf.x1 - 15; x += 14) this._box(2.4, 0.12, 0.3, lampM, x, 5.8, (pf.z0 + pf.z1) / 2, false);
    // pagar pembatas pelataran - peron
    const fenceM = new THREE.MeshStandardMaterial({ color: 0x2f3a35, metalness: 0.7, roughness: 0.4 });
    this._box(P.x1 - B.x1, 0.12, 0.12, fenceM, (B.x1 + P.x1) / 2, 1.9, P.z0 - 0.5);
    this._box(P.x1 - B.x1, 0.12, 0.12, fenceM, (B.x1 + P.x1) / 2, 1.0, P.z0 - 0.5);
    for (let x = B.x1; x <= P.x1; x += 3) this._box(0.12, 2, 0.12, fenceM, x, 1, P.z0 - 0.5, false);
    // lampu pelataran
    [[330, -40], [470, -40], [400, -80], [330, -80], [470, -80]].forEach(([x, z]) => {
      this._box(0.25, 8, 0.25, World.metalMat, x, 4, z);
      this._box(1.6, 0.25, 0.8, lampM, x, 8, z, false);
    });
    this._rails(tz);
    this.train = this._makeTrain();
    this.trainState = { x: -1400, v: 22, dwell: 0, stopped: false, horn: 0 };
  },

  _rails(tz) {
    const xa = -2400, xb = 3400;
    const ballast = new THREE.Mesh(new THREE.PlaneGeometry(xb - xa, 6), new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: 1 }));
    ballast.rotation.x = -Math.PI / 2; ballast.position.set((xa + xb) / 2, 0.03, tz); ballast.receiveShadow = true;
    this.scene.add(ballast);
    const sl = new GeoBatch();
    for (let x = -1800; x < 2800; x += 1.4) sl.box(x, 0.12, tz, 0.3, 0.16, 2.4, { faces: 'XxYZz' });
    this.scene.add(new THREE.Mesh(sl.build(), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 1 })));
    const railM = new THREE.MeshStandardMaterial({ color: 0x9a9ca2, metalness: 0.9, roughness: 0.3, envMap: World.envMap });
    [-0.55, 0.55].forEach((o) => this._box(xb - xa, 0.16, 0.1, railM, (xa + xb) / 2, 0.28, tz + o, false));
  },

  _makeTrain() {
    const g = new THREE.Group();
    const env = World.envMap;
    const winE = this._text(256, 64, (gg, w, h) => {
      gg.fillStyle = '#000'; gg.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) { gg.fillStyle = '#ffe6b8'; gg.fillRect(8 + i * 31, 18, 24, 22); }
    });
    const winM = this._text(256, 64, (gg, w, h) => {
      gg.fillStyle = '#e9ecef'; gg.fillRect(0, 0, w, h);
      gg.fillStyle = '#1d4fa0'; gg.fillRect(0, 46, w, 6);
      gg.fillStyle = '#f08a24'; gg.fillRect(0, 54, w, 4);
      for (let i = 0; i < 8; i++) { gg.fillStyle = '#26303c'; gg.fillRect(8 + i * 31, 18, 24, 22); }
    });
    const side = new THREE.MeshStandardMaterial({ map: winM, emissiveMap: winE, emissive: 0xffffff, emissiveIntensity: this.lit, roughness: 0.35, metalness: 0.4, envMap: env, envMapIntensity: 0.8 });
    const body = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.35, metalness: 0.4, envMap: env });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.7 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5, metalness: 0.5 });
    const L = 20, gap = 0.6;
    this.trainLen = 7 * (L + gap);
    for (let i = 0; i < 7; i++) {
      const car = new THREE.Group();
      const isLoco = i === 0;
      const bx = new THREE.Mesh(new THREE.BoxGeometry(L, 3.2, 2.9), [body, body, roofM, dark, side, side]);
      bx.position.y = 2.6;
      car.add(bx);
      const rf = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, L, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), roofM);
      rf.scale.set(1, 0.35, 1);
      rf.position.y = 4.2;
      car.add(rf);
      [-L * 0.32, L * 0.32].forEach((o) => {
        const bog = new THREE.Mesh(new THREE.BoxGeometry(3, 0.8, 2.2), dark);
        bog.position.set(o, 0.75, 0); car.add(bog);
      });
      if (isLoco) {
        const nose = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.9), new THREE.MeshStandardMaterial({ color: 0x1d4fa0, roughness: 0.4, metalness: 0.4, envMap: env }));
        nose.position.set(L / 2 + 0.6, 2.3, 0); car.add(nose);
        const ws = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 2.4), new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.05, metalness: 0.9, envMap: env }));
        ws.position.set(L / 2 + 0.05, 3.4, 0); car.add(ws);
        [-0.9, 0.9].forEach((z) => Airport._light(car, L / 2 + 1.75, 1.6, z, 0xfff4dc, 2.4, 3));
      } else {
        [-0.9, 0.9].forEach((z) => Airport._light(car, -L / 2 - 0.05, 1.4, z, 0xff2020, 0.8, 1.5));
      }
      car.position.x = -i * (L + gap);
      g.add(car);
    }
    g.traverse((o) => { if (o.isMesh && this.shadow) o.castShadow = true; });
    g.position.set(0, 0.3, this.ST.trackZ);
    this.scene.add(g);
    return g;
  },

  // ======================= CALOSA (toko laptop & gadget) =======================
  _calosa(nm) {
    // blok (4,3): x 412..488, z 312..388, menghadap jalan x=400 (-x)
    const dark = new THREE.MeshStandardMaterial({ color: 0x0a0a0b, roughness: 0.95 });
    const darker = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 });
    const paver = this._paverTex(); paver.repeat.set(10, 30);
    const fore = new THREE.Mesh(new THREE.PlaneGeometry(20, 70), new THREE.MeshStandardMaterial({ map: paver, roughness: 0.9 }));
    fore.rotation.x = -Math.PI / 2; fore.position.set(424, 0.31, 350); fore.receiveShadow = true; this.scene.add(fore);
    // lantai dasar gelap + lantai atas kaca + atap kantilever
    this._box(36, 5.5, 64, dark, 454, 3.05, 350);
    this._box(42, 0.6, 64, darker, 451, 5.8, 350);
    this._box(44, 1.4, 64, dark, 450, 11.8, 350);
    this._box(38, 5, 0.6, dark, 453, 8.6, 318.3);
    this._box(38, 5, 0.6, dark, 453, 8.6, 381.7);
    const inter = this._text(1024, 160, (g, w, h) => {
      g.fillStyle = '#2e333b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1d2026'; g.fillRect(0, 0, w, h * 0.28);
      for (let i = 0; i < 70; i++) { g.fillStyle = '#fff6dc'; g.beginPath(); g.arc(Math.random() * w, 8 + Math.random() * 26, 3, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 9; i++) { // rak laptop
        const x = 20 + i * 112;
        g.fillStyle = '#c62828'; g.fillRect(x, h * 0.62, 96, 8);
        g.fillStyle = '#2b2f3a'; for (let k = 0; k < 3; k++) g.fillRect(x + 4 + k * 31, h * 0.45, 26, 24);
        g.fillStyle = ['#6aa8ff', '#ff6ad5', '#7cf3ff'][i % 3]; for (let k = 0; k < 3; k++) g.fillRect(x + 7 + k * 31, h * 0.47, 20, 16);
        g.fillStyle = '#8d939c'; g.fillRect(x, h * 0.66, 96, h * 0.34);
      }
      g.fillStyle = 'rgba(200,30,30,0.85)'; g.fillRect(w * 0.05, h * 0.12, w * 0.2, h * 0.22);
      g.fillStyle = '#fff'; g.font = 'bold 26px Arial'; g.textAlign = 'center'; g.fillText('TECH FESTIVAL', w * 0.15, h * 0.26);
    });
    this._panel(inter, 60, 4.8, 436.4, 8.4, 350, '-x', { emi: 0.45 + this.lit * 0.7, rough: 0.9 });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(62, 5), this._glass(0.3));
    glass.position.set(434, 8.6, 350); glass.rotation.y = -Math.PI / 2; this.scene.add(glass);
    for (let z = 320; z <= 380; z += 12) this._box(0.12, 5, 0.12, darker, 433.95, 8.6, z, false);
    // plafon kayu dengan lampu sorot kecil
    const wood = this._text(256, 512, (g, w, h) => {
      g.fillStyle = '#8a5a34'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) { g.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`; g.fillRect(x, 0, 2, h); }
      g.fillStyle = '#fffbe8';
      for (let y = 20; y < h; y += 46) for (let x = 30; x < w; x += 70) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
    });
    const soffit = new THREE.Mesh(new THREE.PlaneGeometry(16, 64), new THREE.MeshStandardMaterial({ map: wood, emissiveMap: wood, emissive: 0xffffff, emissiveIntensity: 0.15 + this.lit * 0.25 }));
    soffit.rotation.x = Math.PI / 2; soffit.position.set(436, 11.08, 350); this.scene.add(soffit);
    // logo calosa (C + palang) — huruf biasa, bisa diganti di config
    const logo = this._text(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#f7f7f7'; g.lineWidth = 36; g.lineCap = 'round';
      g.beginPath(); g.arc(130, 128, 86, 0.55, Math.PI * 2 - 0.55); g.stroke();
      g.fillStyle = '#f7f7f7'; g.fillRect(110, 112, 140, 32);
      g.font = 'bold 150px Arial Rounded MT Bold, Arial'; g.textBaseline = 'middle';
      g.fillText(nm.calosa, 270, 136);
    });
    this._panel(logo, 22, 5.5, 433.8, 8.4, 362, '-x', { alpha: true, basic: true, k: this.night ? 1.8 : 1.15 });
    const logoD = this._text(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#111'; g.lineWidth = 36; g.beginPath(); g.arc(130, 128, 86, 0.55, Math.PI * 2 - 0.55); g.stroke();
      g.fillStyle = '#111'; g.fillRect(110, 112, 140, 32);
      g.font = 'bold 150px Arial'; g.textBaseline = 'middle'; g.fillText(nm.calosa, 270, 136);
    });
    this._panel(logoD, 9, 2.25, 436.2, 7.7, 350, '-x', { alpha: true, basic: true });
    // pintu parkir bawah & tulisan service center
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(22, 5), new THREE.MeshBasicMaterial({ color: 0x0b0b0d }));
    hole.position.set(435.95, 2.8, 362); hole.rotation.y = -Math.PI / 2; this.scene.add(hole);
    const sc = this._text(512, 96, (g, w, h) => {
      g.fillStyle = '#26272b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e8e8e8'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SERVICE CENTER', w / 2, h / 2 + 3);
    });
    this._panel(sc, 7, 1.3, 435.95, 4.3, 326, '-x', { emi: 0.3 + this.lit * 0.6 });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), this._glass(0.6));
    door.position.set(435.9, 1.9, 326); door.rotation.y = -Math.PI / 2; this.scene.add(door);
    // tangga lebar ke lantai 2 dengan spanduk merah
    const step = new THREE.MeshStandardMaterial({ color: 0x5a5854, roughness: 0.85 });
    for (let k = 0; k < 13; k++) this._box(1.15, 0.45 * (k + 1), 6, step, 421 + k * 1.1, 0.3 + 0.225 * (k + 1), 343);
    const ban = this._text(512, 96, (g, w, h) => {
      g.fillStyle = '#c3221c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) { g.fillStyle = ['#ffd400', '#ffffff', '#2a6bff'][i % 3]; g.beginPath(); g.arc(30 + i * 56, h / 2, 16, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#fff'; g.font = 'bold 30px Arial'; g.fillText('TECH FESTIVAL', 150, 60);
    });
    const slope = Math.atan2(5.8, 14.3);
    [339.8, 346.2].forEach((z) => {
      const b = this._panel(ban, 15.4, 1.1, 428.2, 3.7, z, z < 343 ? '-z' : '+z', { emi: 0.2 + this.lit * 0.3 });
      b.rotation.z = (z < 343 ? -1 : 1) * slope;
    });
    // pot tanaman, motor parkir, pagar bilah hitam, papan reklame
    const pot = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.8 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x2f6a2a, roughness: 0.9, flatShading: true });
    [[420, 338.5], [420, 347.5], [434, 338.5], [434, 347.5]].forEach(([x, z]) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 1, 10), pot); p.position.set(x, 0.8, z); this._mesh(p, true);
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), leaf); l.position.set(x, 1.9, z); l.scale.y = 1.4; this._mesh(l, true);
    });
    for (let k = 0; k < 7; k++) this._motor(423 + (k % 2) * 0.4, 320 + k * 2.3, k);
    const slat = new GeoBatch();
    for (let z = 372; z <= 386; z += 0.45) slat.box(413.8, 1.6, z, 0.12, 2.6, 0.22);
    this.scene.add(new THREE.Mesh(slat.build(), darker));
    this._box(0.4, 10, 0.4, darker, 415, 5.3, 386);
    const bb = this._text(1024, 512, (g, w, h) => {
      g.fillStyle = '#f7f7f7'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#cfcfcf'; g.lineWidth = 16; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#1e3f9a'; g.font = 'bold 260px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(nm.brand.toLowerCase(), w / 2, h / 2 + 10);
    });
    this._panel(bb, 9, 4.5, 414.75, 11.5, 386, '-x', { emi: 0.25 + this.lit * 0.6 });
    const pg = this._text(256, 128, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = '#222'; g.font = 'bold 44px Arial'; g.textAlign = 'center';
      g.fillText('PARKIR', w / 2, 56); g.fillText('GRATIS', w / 2, 106);
    });
    this._panel(pg, 1.2, 0.6, 413.65, 2.2, 378, '-x', { emi: 0.2 });
    this._filler(474, 318, 484, 382, 14, 3);
  },
  _motor(x, z, k) {
    const g = new THREE.Group();
    const col = new THREE.MeshStandardMaterial({ color: ['#c3221c', '#1d1d1d', '#f2f2f2', '#2a6bff', '#7cc45a'][k % 5], roughness: 0.4, metalness: 0.3 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x111111 });
    [-0.65, 0.65].forEach((o) => { const w = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 14), tire); w.position.set(o, 0.36, 0); g.add(w); });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 0.32), col); body.position.set(0, 0.62, 0); g.add(body);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.3), tire); seat.position.set(-0.15, 0.9, 0); g.add(seat);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.6), tire); bar.position.set(0.55, 1.05, 0); g.add(bar);
    g.rotation.y = Math.PI / 2 + 0.5; g.rotation.z = 0.08;
    g.position.set(x, 0.3, z);
    this.scene.add(g);
  },
  _paverTex() {
    const t = Tex.get('paver', () => {
      const c = Tex.canvas(64, 64);
      const g = c.getContext('2d');
      g.fillStyle = '#6e6c68'; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = '#4e4c49'; g.lineWidth = 2;
      for (let y = 0; y < 64; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); for (let x = (y / 16) % 2 ? 0 : 16; x < 64; x += 32) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); } }
      return Tex.make(c, true);
    });
    const c2 = t.clone(); c2.needsUpdate = true; return c2;
  },

  // ======================= JALAN KAYUTANGAN HERITAGE =======================
  _kayutangan(nm) {
    const K = this.KAYU, rnd = U.rng(1923);
    // jalan batu andesit
    const cob = this._text(128, 128, (g, w, h) => {
      g.fillStyle = '#4b4a48'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        for (let x = ((y / 16) % 2) * -12; x < w; x += 24) {
          const v = 70 + Math.random() * 35;
          g.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
          g.fillRect(x + 1.5, y + 1.5, 21, 13);
        }
      }
    });
    cob.wrapS = cob.wrapT = THREE.RepeatWrapping; cob.repeat.set(24 / 4, (K.z1 - K.z0) / 4);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(24, K.z1 - K.z0), new THREE.MeshStandardMaterial({ map: cob, bumpMap: cob, bumpScale: 0.04, roughness: World.T.wet ? 0.55 : 0.85, envMap: World.envMap, envMapIntensity: World.T.wet ? 0.5 : 0.15 }));
    road.rotation.x = -Math.PI / 2; road.position.set(K.x, 0.012, (K.z0 + K.z1) / 2); road.receiveShadow = true;
    this.scene.add(road);
    // trotoar berpola wajik (seperti di foto)
    const dia = this._text(128, 128, (g, w, h) => {
      g.fillStyle = '#c9c4ba'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#6b6862'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke();
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    });
    dia.wrapS = dia.wrapT = THREE.RepeatWrapping;
    const walkM = new THREE.MeshStandardMaterial({ map: dia, roughness: 0.85 });
    for (let cz = 1; cz <= 4; cz++) {
      [[181, 188], [212, 219]].forEach(([a, b]) => {
        const t = dia.clone(); t.needsUpdate = true; t.repeat.set((b - a) / 2.4, 76 / 2.4);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 76), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
        m.rotation.x = -Math.PI / 2; m.position.set((a + b) / 2, 0.305, cz * 100 + 50); m.receiveShadow = true;
        this.scene.add(m);
      });
    }
    void walkM;
    // deretan toko & cafe bergaya kolonial
    const names = ['KOPI KAJOE', 'TOKO ROTI 1930', 'CAFE NOSTALGIA', 'BATIK MALANG', 'WARUNG SOTO', 'GALERI SENI', 'ES KRIM JADOEL', 'DISTRO KAJOE',
      'KEDAI TEH', 'TOKO BUKU LAMA', 'APOTEK LAMA', 'ROTI & KUE', 'RUMAH MAKAN', 'KOPI SUSU', 'JAMU KAJOE', 'CAFE SENJA', 'KEDAI MIE', 'TOKO JAM', 'PANGKAS RAMBUT', 'BARBERSHOP'];
    let ni = 0;
    const shops = [];
    for (let cz = 1; cz <= 4; cz++) {
      [-1, 1].forEach((side) => {
        const front = side < 0 ? 181 : 219; // sisi barat menghadap +x, timur menghadap -x
        let z = cz * 100 + 16;
        const zEnd = cz * 100 + 84;
        if (side > 0 && cz === 2) { this._hotel(nm); z = 252; }
        while (z < zEnd - 6) {
          const w = Math.min(zEnd - z, 11 + Math.floor(rnd() * 8));
          shops.push({ side, front, z0: z, z1: z + w, name: names[ni++ % names.length], cafe: rnd() < 0.45, h: 7 + rnd() * 4, v: Math.floor(rnd() * 6) });
          z += w;
        }
        // gedung pengisi di belakang deretan toko
        const bx0 = side < 0 ? 116 : 238, bx1 = side < 0 ? 162 : 284;
        this._filler(bx0, cz * 100 + 16, bx1, cz * 100 + 84, 14 + rnd() * 20, Math.floor(rnd() * 4));
      });
    }
    shops.forEach((s) => this._shop(s, rnd));
    // lampu jalan klasik, bangku, pohon peneduh, pot bunga
    const iron = new GeoBatch(), lantern = new GeoBatch(true), wood = new GeoBatch(), leaves = new GeoBatch(true);
    const glowPos = [];
    for (let cz = 1; cz <= 4; cz++) {
      for (let z = cz * 100 + 20; z <= cz * 100 + 80; z += 15) {
        [186.6, 213.4].forEach((x) => {
          iron.box(x, 0.55, z, 0.5, 0.5, 0.5);
          iron.box(x, 2.4, z, 0.16, 4.2, 0.16);
          iron.box(x, 4.45, z, 0.1, 0.1, 1.5);
          [-0.7, 0.7].forEach((o) => {
            iron.box(x, 4.95, z + o, 0.42, 0.08, 0.42);
            lantern.box(x, 4.65, z + o, 0.32, 0.5, 0.32, { color: [1, 0.85, 0.55] });
            glowPos.push(x, 4.65, z + o);
          });
        });
        // bangku kayu & pohon di antara lampu
        [184, 216].forEach((x) => {
          const zb = z + 7.5;
          if (zb > cz * 100 + 82) return;
          wood.box(x, 0.75, zb, 0.6, 0.08, 2.2);
          wood.box(x + (x < 200 ? -0.28 : 0.28), 1.05, zb, 0.06, 0.5, 2.2);
          iron.box(x, 0.5, zb - 0.9, 0.5, 0.4, 0.06); iron.box(x, 0.5, zb + 0.9, 0.5, 0.4, 0.06);
          if ((z / 15) % 2 < 1) {
            const tx = x < 200 ? 182.5 : 217.5, tz = zb + 3.5;
            wood.box(tx, 2.3, tz, 0.45, 4, 0.45);
            const g = 0.22 + rnd() * 0.1;
            leaves.cone(tx, 5.2, tz, 3.4, -1.6, 8, [0.1, g, 0.07], [0.06, g - 0.05, 0.05]);
            leaves.cone(tx, 5.2, tz, 3.4, 3.2, 8, [0.12, g + 0.03, 0.08], [0.18, g + 0.15, 0.1]);
          }
        });
      }
    }
    this._mesh(new THREE.Mesh(iron.build(), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.6 })), true);
    const lk = this.night ? 2.2 : World.timeKey === 'dusk' ? 1.6 : 1;
    this.scene.add(new THREE.Mesh(lantern.build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(lk, lk, lk) })));
    this._mesh(new THREE.Mesh(wood.build(), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.9 })), true);
    this._mesh(new THREE.Mesh(leaves.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide })), true);
    if (World.T.pools > 0) {
      const pg = new GeoBatch(true);
      for (let i = 0; i < glowPos.length; i += 6) pg.flat(glowPos[i] + (glowPos[i] < 200 ? 2.5 : -2.5), 0.03, glowPos[i + 2] + 0.7, 9, 9, [1, 0.7, 0.4].map((v) => v * World.T.pools));
      this.scene.add(new THREE.Mesh(pg.build(), new THREE.MeshBasicMaterial({ map: Tex.radial('rgba(255,255,255,0.55)', 'rgba(0,0,0,0)'), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })));
    }
    // gapura di kedua ujung jalan
    [K.z0 + 16, K.z1 - 16].forEach((zg) => this._gapura(zg, nm));
  },
  _gapura(z, nm) {
    const col = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.7 });
    const cream = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });
    [184.5, 215.5].forEach((x) => {
      this._box(1.4, 7.5, 1.4, cream, x, 4.05, z);
      this._box(1.8, 0.6, 1.8, col, x, 7.9, z);
      this._box(1.8, 0.8, 1.8, col, x, 0.7, z);
    });
    this._box(33, 1.6, 1.0, col, 200, 8.6, z);
    const t = this._text(1024, 96, (g, w, h) => {
      g.fillStyle = '#3a2a1e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f2d9a0'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(nm.street, w / 2, h / 2 + 3);
    });
    this._panel(t, 30, 1.4, 200, 8.6, z - 0.52, '-z', { emi: 0.3 + this.lit * 0.6 });
    this._panel(t, 30, 1.4, 200, 8.6, z + 0.52, '+z', { emi: 0.3 + this.lit * 0.6 });
  },
  _colonialTex(name, v, cafe, wpx) {
    const W = Math.max(256, Math.round(wpx)), H = 256;
    const c = Tex.canvas(W, H), e = Tex.canvas(W, H);
    const g = c.getContext('2d'), ge = e.getContext('2d');
    const base = ['#efe6d2', '#f4efe6', '#d9e8dc', '#f1d7c4', '#e8dcc0', '#cfe0e8'][v];
    const shutter = ['#2f5a3a', '#6b3a22', '#2f4a6b', '#2f5a3a', '#7a2a2a', '#3a3a3a'][v];
    g.clearRect(0, 0, W, H);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
    const roofY = 40; // di atas ini hanya ornamen puncak (sisanya transparan)
    g.fillStyle = base;
    g.beginPath(); // puncak bertangga ala kolonial
    g.moveTo(0, roofY); g.lineTo(W * 0.3, roofY); g.lineTo(W * 0.3, roofY - 14); g.lineTo(W * 0.4, roofY - 14); g.lineTo(W * 0.4, roofY - 28);
    g.lineTo(W * 0.6, roofY - 28); g.lineTo(W * 0.6, roofY - 14); g.lineTo(W * 0.7, roofY - 14); g.lineTo(W * 0.7, roofY); g.lineTo(W, roofY); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(0, roofY, W, 7); g.fillRect(0, 128, W, 6);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, H - 6, W, 6);
    // jendela tinggi berdaun jendela di lantai atas
    const nWin = Math.max(2, Math.floor(W / 90));
    for (let i = 0; i < nWin; i++) {
      const x = (W / nWin) * (i + 0.5) - 16;
      g.fillStyle = '#2c3540'; g.fillRect(x, 60, 32, 56);
      g.beginPath(); g.arc(x + 16, 60, 16, Math.PI, 0); g.fill();
      if (Math.random() < 0.6) { ge.fillStyle = '#ffd59a'; ge.fillRect(x + 2, 62, 28, 52); g.fillStyle = 'rgba(255,210,150,0.35)'; g.fillRect(x + 2, 62, 28, 52); }
      g.fillStyle = shutter; g.fillRect(x - 12, 58, 11, 60); g.fillRect(x + 33, 58, 11, 60);
    }
    // papan nama toko
    g.fillStyle = shutter; g.fillRect(W * 0.12, 138, W * 0.76, 30);
    g.fillStyle = '#f5e2b0'; g.font = `bold ${Math.min(24, (W * 0.7) / (name.length * 0.62))}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, W / 2, 154);
    ge.fillStyle = '#6a5a3a'; ge.font = g.font; ge.textAlign = 'center'; ge.textBaseline = 'middle'; ge.fillText(name, W / 2, 154);
    // etalase & pintu lantai dasar (lampu hangat)
    const gx0 = 10, gx1 = W - 10;
    g.fillStyle = '#28323a'; g.fillRect(gx0, 176, gx1 - gx0, 74);
    ge.fillStyle = cafe ? '#ffcf8a' : '#ffe4b8'; ge.fillRect(gx0 + 4, 180, gx1 - gx0 - 8, 66);
    g.fillStyle = 'rgba(255,214,160,0.45)'; g.fillRect(gx0 + 4, 180, gx1 - gx0 - 8, 66);
    g.fillStyle = base;
    for (let x = gx0 + 50; x < gx1 - 20; x += 60) g.fillRect(x, 176, 6, 74);
    g.fillStyle = shutter; g.fillRect(W / 2 - 16, 190, 32, 60);
    return { map: Tex.make(c), emi: Tex.make(e) };
  },
  _shop(s, rnd) {
    const w = s.z1 - s.z0, h = s.h, depth = 14;
    const zc = (s.z0 + s.z1) / 2;
    const face = s.side < 0 ? '+x' : '-x';
    const dir = s.side < 0 ? 1 : -1; // arah depan (ke jalan)
    const base = ['#efe6d2', '#f4efe6', '#d9e8dc', '#f1d7c4', '#e8dcc0', '#cfe0e8'][s.v];
    const mat = new THREE.MeshStandardMaterial({ color: base, roughness: 0.85 });
    const bx = s.front - dir * depth / 2;
    this._box(depth, h, w - 0.3, mat, bx, 0.3 + h / 2, zc);
    const ft = this._colonialTex(s.name, s.v, s.cafe, w * 22);
    const ph = h * 256 / (256 - 40); // panel lebih tinggi untuk ornamen puncak
    const m = this._panel(ft.map, w - 0.3, ph, s.front + dir * 0.03, 0.3 + ph / 2, zc, face, { alpha: true, emi: 0 });
    m.material.emissiveMap = ft.emi; m.material.emissiveIntensity = 0.3 + this.lit * 0.7; m.material.needsUpdate = true;
    // kanopi kain bergaris
    const aw = this._text(64, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f4efe6' : ['#2f5a3a', '#7a2a2a', '#2f4a6b', '#c98a2a'][s.v % 4]; g.fillRect(i * 8, 0, 8, 64); } });
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, 1.8), new THREE.MeshStandardMaterial({ map: aw, side: THREE.DoubleSide, roughness: 0.9 }));
    awn.position.set(s.front + dir * 0.85, 0.3 + h * 0.36 * (256 / 216) + 0.2, zc);
    awn.rotation.y = s.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    awn.rotateX(-1.0);
    this._mesh(awn, true);
    // meja payung cafe di trotoar
    if (s.cafe) {
      const umb = new THREE.MeshStandardMaterial({ color: ['#f4efe6', '#7a2a2a', '#2f5a3a'][Math.floor(rnd() * 3)], roughness: 0.8, side: THREE.DoubleSide });
      const tbl = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.6 });
      for (let k = 0; k < Math.max(1, Math.floor(w / 8)); k++) {
        const tx = s.front + dir * 3.2, tz = s.z0 + 4 + k * 8;
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 12), tbl); t.position.set(tx, 1.05, tz); this.scene.add(t);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), tbl); leg.position.set(tx, 1.6, tz); this.scene.add(leg);
        const u = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.6, 8, 1, true), umb); u.position.set(tx, 2.9, tz); this._mesh(u, true);
        [-0.8, 0.8].forEach((o) => { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.42), tbl); ch.position.set(tx, 0.75, tz + o); this.scene.add(ch); });
      }
    }
  },
  _hotel(nm) {
    // Grand Citihub Hotel: blok (2,2) sisi timur jalan, depan x=219 menghadap -x, z 216..248
    const fx = 219;
    const grey = this._text(64, 64, (g) => { g.fillStyle = '#9aa0a8'; g.fillRect(0, 0, 64, 64); g.strokeStyle = '#7d838c'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62); g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke(); });
    grey.wrapS = grey.wrapT = THREE.RepeatWrapping; grey.repeat.set(6, 12);
    const terra = this._text(128, 96, (g) => {
      g.fillStyle = '#9a5c36'; g.fillRect(0, 0, 128, 96);
      g.fillStyle = '#f2efe9'; g.fillRect(0, 72, 128, 24);
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 2; [0, 42, 85].forEach((x) => { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 72); g.stroke(); });
      g.beginPath(); g.moveTo(0, 36); g.lineTo(128, 36); g.stroke();
    });
    terra.wrapS = terra.wrapT = THREE.RepeatWrapping; terra.repeat.set(5, 8);
    const greyM = new THREE.MeshStandardMaterial({ map: grey, roughness: 0.6, metalness: 0.2, envMap: World.envMap, envMapIntensity: 0.3 });
    const terraM = new THREE.MeshStandardMaterial({ map: terra, roughness: 0.7 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.6 });
    const magenta = new THREE.MeshStandardMaterial({ color: 0xc72d8c, roughness: 0.5, emissive: 0x3a0a28, emissiveIntensity: 0.3 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xe8892a, roughness: 0.6 });
    // menara (8 lantai di atas lantai dasar)
    this._box(22, 25, 13, greyM, fx + 13, 7 + 12.5 + 0.3, 223);
    this._box(24, 22, 19, terraM, fx + 12, 10 + 11 + 0.3, 238.5);
    this._box(24.4, 3, 19.4, orange, fx + 12, 7 + 1.5 + 0.3, 238.5);
    this._box(24, 1, 32, white, fx + 12, 32.6, 232);
    // balkon putih bertingkat dengan pagar kaca & tanaman menjuntai
    const glassM = this._glass(0.35);
    const vine = this._text(64, 128, (g) => { g.clearRect(0, 0, 64, 128); for (let i = 0; i < 9; i++) { g.strokeStyle = `rgba(60,${110 + Math.random() * 60},50,0.9)`; g.lineWidth = 2; const x = 4 + i * 7; g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 4, 60, x - 2, 40 + Math.random() * 88); g.stroke(); } });
    const vineM = new THREE.MeshStandardMaterial({ map: vine, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
    for (let k = 0; k < 6; k++) {
      const y = 10.5 + k * 3.6, off = (k % 2) * 0.8;
      this._box(4.2 + off, 0.55, 12.5, white, fx - 0.6 - off / 2, y, 222.8);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 1.1), glassM);
      gl.position.set(fx - 2.65 - off, y + 0.8, 222.8); gl.rotation.y = -Math.PI / 2; this.scene.add(gl);
      if (k < 4) { const v = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), vineM); v.position.set(fx - 2.7 - off, y - 2.2, 222.8); v.rotation.y = -Math.PI / 2; this.scene.add(v); }
    }
    // lantai dasar: carport terbuka + lobi
    this._box(25, 0.6, 22, white, fx + 11.5, 5.0, 237);
    const backM = new THREE.MeshBasicMaterial({ color: 0x15161a });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(21, 4.5), backM); back.position.set(fx + 16, 2.6, 237); back.rotation.y = -Math.PI / 2; this.scene.add(back);
    const stripe = this._text(32, 128, (g) => { g.fillStyle = '#111'; g.fillRect(0, 0, 32, 128); g.fillStyle = '#f5c400'; for (let y = -32; y < 128; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(32, y + 16); g.lineTo(32, y + 32); g.lineTo(0, y + 16); g.fill(); } });
    const colS = new THREE.MeshStandardMaterial({ map: stripe });
    this._box(0.8, 4.4, 0.8, white, fx + 1, 2.5, 244);
    this._box(0.8, 4.4, 0.8, colS, fx + 1, 2.5, 234);
    const lobby = this._text(512, 160, (g, w, h) => { g.fillStyle = '#efe7da'; g.fillRect(0, 0, w, h); g.fillStyle = '#c72d8c'; g.fillRect(0, h - 30, w, 30); g.fillStyle = '#8a6a4a'; g.fillRect(w * 0.3, h * 0.45, w * 0.4, h * 0.35); g.fillStyle = '#333'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.fillText('LOBBY', w / 2, h * 0.3); });
    this._panel(lobby, 9, 4.2, fx + 3.2, 2.4, 220.5, '-x', { emi: 0.35 + this.lit * 0.6 });
    // rangka magenta: pita papan nama, tiang & sabuk diagonal tangga
    this._box(1.6, 1.8, 30, magenta, fx - 1.6, 6.3, 233.5);
    this._box(1.2, 5.6, 1.2, magenta, fx - 1.6, 3.1, 217.4);
    this._box(1.2, 5.6, 1.2, magenta, fx - 1.6, 3.1, 213.6 + 0.3);
    const diag = this._box(1.0, 1.0, 9, magenta, fx - 1.6, 4.4, 214.2);
    diag.rotation.x = 0.55;
    this._box(4, 0.45, 6, magenta, fx - 1.2, 4.4, 214.5);
    // papan nama hotel
    const sign = this._text(1024, 256, (g, w, h) => {
      g.fillStyle = '#c72d8c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 74px Arial Rounded MT Bold, Arial';
      const words = nm.hotel.split(' ');
      g.fillText(words[0] || '', w / 2, 44);
      g.font = 'bold 88px Arial Rounded MT Bold, Arial';
      g.fillText(words.slice(1).join(''), w / 2, 128);
      g.fillText(nm.hotelSub, w / 2, 210);
    });
    this._panel(sign, 12, 3, fx - 2.45, 8.5, 238, '-x', { emi: 0.4 + this.lit * 0.9 });
    this._box(0.4, 3.2, 12.4, magenta, fx - 2.2, 8.5, 238);
    // pagar kaca teras lantai 2
    const tg = new THREE.Mesh(new THREE.PlaneGeometry(18, 1.1), glassM); tg.position.set(fx - 0.6, 7.9, 238.5); tg.rotation.y = -Math.PI / 2; this.scene.add(tg);
    // mobil parkir di carport
    [['orion', '#f2f2f2', 229], ['rondo', '#1b1b1b', 241]].forEach(([mdl, colr, z]) => {
      const car = CarFactory.build(DATA.newCarEntry(mdl, colr), { noBeam: true, lite: true });
      car.position.set(fx + 6, 0.3, z); car.rotation.y = -Math.PI / 2;
      this.scene.add(car);
    });
    this._filler(244, 216, 284, 284, 22, 1);
  },

  update(dt, t, px, pz) {
    if (!this.train) return;
    const s = this.trainState;
    const stopHead = 400 + this.trainLen / 2; // tengah kereta di depan stasiun
    if (s.dwell > 0) {
      s.dwell -= dt; s.v = 0;
      if (s.dwell <= 0) { s.stopped = true; if (Math.hypot(400 - px, -100 - pz) < 260) AudioSys.trainHorn(); }
    } else if (!s.stopped) {
      const d = stopHead - s.x;
      const vt = d > 0 ? Math.min(22, Math.sqrt(2 * 0.9 * d) + 0.3) : 22;
      s.v += U.clamp(vt - s.v, -2 * dt, 1 * dt);
      if (d < 0.6 && d > -3) { s.dwell = 18; s.v = 0; }
    } else s.v = Math.min(22, s.v + 0.8 * dt);
    s.x += s.v * dt;
    if (s.x > 2800) { s.x = -1500; s.stopped = false; s.v = 22; }
    this.train.position.x = s.x;
  },
  trainDist(x, z) {
    if (!this.train) return 1e9;
    const s = this.trainState;
    const cxx = U.clamp(x, s.x - this.trainLen, s.x);
    return s.v > 1 ? Math.hypot(cxx - x, this.ST.trackZ - z) : 1e9;
  },
};

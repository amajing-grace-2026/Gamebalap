/* =========================================================================
   JALAN LINTAS + TEROWONGAN BUKIT KABUT + BANDARA NEOPOLIS
   + pesawat (lepas landas / mendarat / melintas), helikopter, balon udara
   Semua model dibuat prosedural (orisinal).
   ========================================================================= */
const Airport = {
  CORR: { x0: 812, x1: 1180, z: 400, hw: 12 },
  TUN: { x0: 900, x1: 1100, r: 12.6 },
  AREA: { x0: 1180, x1: 1980, z0: 40, z1: 760 },
  RWY: { x0: 1230, x1: 1940, z0: 600, z1: 645, zc: 622.5 },
  APRON: { x0: 1180, x1: 1780, z0: 265, z1: 480 },
  TAXI: [{ x0: 1300, x1: 1322, z0: 480, z1: 600 }, { x0: 1700, x1: 1722, z0: 480, z1: 600 }],
  flights: [],
  parked: [],
  blinkSprites: [],

  build(scene, T, quality) {
    this.scene = scene;
    this.T = T;
    const rnd = U.rng(4242);
    const env = World.envMap;
    const conc = new GeoBatch();     // beton (tembok, portal)
    const metal = new GeoBatch();
    const glow = new GeoBatch(true);
    const marks = new GeoBatch(true);
    const pools = new GeoBatch(true);
    const nature = new GeoBatch(true);
    const C = this.CORR, TU = this.TUN;

    // ================= JALAN LINTAS =================
    const road = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0 + 4, C.hw * 2 + 2), World.asphaltMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set((C.x0 + C.x1) / 2, 0.002, C.z);
    road.receiveShadow = true;
    const uv = road.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (C.x1 - C.x0) / 8, uv.getY(i) * 26 / 8);
    scene.add(road);
    const yellow = [1, 0.75, 0.1], white = [0.85, 0.85, 0.85];
    const mk = World.T.marks === 0x5d5a6a ? 0.55 : 1;
    marks.flat((C.x0 + C.x1) / 2, 0.03, C.z - 0.25, C.x1 - C.x0, 0.16, yellow.map((v) => v * mk));
    marks.flat((C.x0 + C.x1) / 2, 0.03, C.z + 0.25, C.x1 - C.x0, 0.16, yellow.map((v) => v * mk));
    [-1, 1].forEach((sd) => marks.flat((C.x0 + C.x1) / 2, 0.03, C.z + sd * (C.hw - 1), C.x1 - C.x0, 0.2, white.map((v) => v * mk)));
    // dinding / pembatas jalan (tabrakan)
    World.addWall(C.x0, C.z - C.hw - 4, C.x1, C.z - C.hw);
    World.addWall(C.x0, C.z + C.hw, C.x1, C.z + C.hw + 4);
    [[C.x0, TU.x0], [TU.x1, C.x1]].forEach(([a, b]) => {
      [-1, 1].forEach((sd) => {
        conc.box((a + b) / 2, 0.55, C.z + sd * (C.hw + 0.5), b - a, 1.1, 1, { tileW: 4, tileH: 4 });
        metal.box((a + b) / 2, 1.25, C.z + sd * (C.hw + 0.1), b - a, 0.25, 0.08);
      });
      for (let x = a + 15; x < b; x += 30) {
        [-1, 1].forEach((sd) => {
          metal.box(x, 4, C.z + sd * (C.hw + 1.2), 0.2, 8, 0.2);
          metal.box(x, 8, C.z + sd * (C.hw - 0.1), 0.15, 0.15, 2.6);
          glow.box(x, 7.85, C.z + sd * (C.hw - 1.2), 0.8, 0.15, 0.8, { color: [1, 0.85, 0.6] });
          if (World.T.pools > 0) pools.flat(x, 0.04, C.z + sd * (C.hw - 4.5), 13, 13, [1, 0.65, 0.35].map((v) => v * World.T.pools));
        });
      }
    });
    // gantry papan petunjuk
    const gx = 850;
    metal.box(gx, 4.5, C.z - C.hw - 1, 0.5, 9, 0.5);
    metal.box(gx, 4.5, C.z + C.hw + 1, 0.5, 9, 0.5);
    metal.box(gx, 8.6, C.z, 0.4, 0.4, C.hw * 2 + 2);
    this._sign(scene, gx - 0.3, 7.2, C.z, 18, 2.6, ['TEROWONGAN BUKIT KABUT', 'BANDARA NEOPOLIS ➜'], '#0b6b3a');

    // ================= TEROWONGAN =================
    const len = TU.x1 - TU.x0;
    const tunTex = this._tunnelTex();
    tunTex.repeat.set(1, len / 6);
    const tunMat = new THREE.MeshStandardMaterial({ map: tunTex, roughness: 0.8, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.2 });
    const arch = new THREE.Mesh(new THREE.CylinderGeometry(TU.r, TU.r, len, 32, 1, true, 0, Math.PI), tunMat);
    arch.geometry.rotateZ(Math.PI / 2);
    arch.position.set((TU.x0 + TU.x1) / 2, 0, C.z);
    arch.receiveShadow = true;
    scene.add(arch);
    for (let x = TU.x0 + 4; x < TU.x1; x += 9) {
      glow.box(x, 11.9, C.z - 3.5, 3.5, 0.2, 0.5, { color: [1, 0.95, 0.85] });
      glow.box(x, 11.9, C.z + 3.5, 3.5, 0.2, 0.5, { color: [1, 0.95, 0.85] });
      pools.flat(x, 0.045, C.z, 10, 20, [1, 0.6, 0.25]);
    }
    for (let x = TU.x0 + 2; x < TU.x1; x += 12) {
      [-1, 1].forEach((sd) => glow.box(x, 4.4, C.z + sd * 11.3, 1.2, 0.3, 0.3, { color: [1, 0.55, 0.15] }));
    }
    [-1, 1].forEach((sd) => conc.box((TU.x0 + TU.x1) / 2, 0.25, C.z + sd * 11.6, len, 0.5, 1.6, { tileW: 4, tileH: 4 }));
    // portal
    const portalMat = new THREE.MeshStandardMaterial({ map: this._concreteTex(), roughness: 0.9, color: 0xb8b2a8 });
    [TU.x0 - 3, TU.x1].forEach((px) => {
      const sh = new THREE.Shape();
      sh.moveTo(-26, -1); sh.lineTo(26, -1); sh.lineTo(26, 21); sh.lineTo(-26, 21); sh.closePath();
      const hole = new THREE.Path();
      hole.moveTo(-TU.r, 0);
      hole.absarc(0, 0, TU.r, Math.PI, 0, true);
      hole.lineTo(-TU.r, 0);
      sh.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false, curveSegments: 24 });
      g.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(g, portalMat);
      m.position.set(px, 0, C.z);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    });
    this._sign(scene, TU.x0 - 3.1, 17, C.z, 22, 2.4, ['TEROWONGAN BUKIT KABUT'], '#1a1a1a', -1);
    this._sign(scene, TU.x1 + 3.1, 17, C.z, 22, 2.4, ['TEROWONGAN BUKIT KABUT'], '#1a1a1a', 1);

    // ================= BUKIT & GUNUNG =================
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    const hill = new GeoBatch(true);
    const gCol = () => [0.12 + rnd() * 0.06, 0.2 + rnd() * 0.08, 0.1];
    const rCol = () => { const v = 0.32 + rnd() * 0.1; return [v, v * 0.95, v * 0.88]; };
    // punggung bukit di atas terowongan (bagian bawah > atap terowongan)
    const domeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.16, 0.24, 0.12), roughness: 1, flatShading: true });
    for (let x = TU.x0 + 24; x <= TU.x1 - 24; x += 22) {
      const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), domeMat);
      dome.scale.set(22, 12, 34);
      dome.position.set(x, 26 + rnd() * 6, C.z);
      scene.add(dome);
    }
    for (let k = 0; k < 40; k++) {
      const side = k % 2 ? 1 : -1;
      const r = 30 + rnd() * 70;
      const x = U.lerp(TU.x0 - 30, TU.x1 + 40, rnd());
      const zc = C.z + side * (C.hw + 8 + r + rnd() * 120);
      if (x + r > this.AREA.x0 - 4 || x - r < World.edge + 30) continue;
      const h = 40 + rnd() * 90;
      hill.cone(x, -1, zc, r, h, 9, gCol(), rCol());
    }
    // perbukitan di sekeliling kota (bukan di sisi bandara)
    for (let k = 0; k < 70; k++) {
      const a = rnd() * Math.PI * 2;
      const d = 950 + rnd() * 700;
      const x = 400 + Math.cos(a) * d, z = 400 + Math.sin(a) * d;
      if (x > 820 && z > -200 && z < 1000) continue;
      const r = 80 + rnd() * 160;
      if (Math.abs(z - Landmarks.ST.trackZ) < r + 30) continue; // jangan menutupi rel kereta
      hill.cone(x, -2, z, r, 60 + rnd() * 160, 10, gCol(), rCol());
    }
    const hm = new THREE.Mesh(hill.build(), rockMat);
    hm.receiveShadow = true;
    scene.add(hm);
    // hutan cemara
    const pine = (x, z, s) => {
      const g = 0.16 + rnd() * 0.1;
      nature.box(x, 1 * s, z, 0.35 * s, 2 * s, 0.35 * s, { color: [0.2, 0.12, 0.07] });
      nature.cone(x, 1.4 * s, z, 2.2 * s, 4 * s, 7, [0.05, g, 0.08], [0.1, g + 0.12, 0.1]);
      nature.cone(x, 3.4 * s, z, 1.6 * s, 3.4 * s, 7, [0.06, g + 0.03, 0.09], [0.12, g + 0.15, 0.12]);
    };
    for (let k = 0; k < 900; k++) {
      const x = U.lerp(830, 2100, rnd()), z = U.lerp(-150, 950, rnd());
      if (Math.abs(z - C.z) < C.hw + 5 && x < this.AREA.x0 + 2) continue;
      if (x > this.AREA.x0 - 6 && x < this.AREA.x1 + 6 && z > this.AREA.z0 - 6 && z < this.AREA.z1 + 6) continue;
      if (World.inTunnel(x, z)) continue;
      if (Math.abs(z - Landmarks.ST.trackZ) < 18) continue;
      pine(x, z, 1 + rnd() * 1.4);
    }

    // ================= BANDARA =================
    const A = this.AREA;
    const field = new THREE.Mesh(new THREE.PlaneGeometry(A.x1 - A.x0, A.z1 - A.z0), new THREE.MeshStandardMaterial({ map: this._fieldTex(World.T.grass), roughness: 1 }));
    field.rotation.x = -Math.PI / 2;
    field.position.set((A.x0 + A.x1) / 2, -0.02, (A.z0 + A.z1) / 2);
    field.receiveShadow = true;
    const fuv = field.geometry.attributes.uv;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 40, fuv.getY(i) * 36);
    scene.add(field);
    const concMat = new THREE.MeshStandardMaterial({ map: this._concreteTex(), roughness: World.T.wet ? 0.55 : 0.85, color: 0xc9c5bd, envMap: env, envMapIntensity: World.T.wet ? 0.5 : 0.1 });
    const plane = (x0, z0, x1, z1, mat, y, rep) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      m.receiveShadow = true;
      if (rep) { const u2 = m.geometry.attributes.uv; for (let i = 0; i < u2.count; i++) u2.setXY(i, u2.getX(i) * (x1 - x0) / rep, u2.getY(i) * (z1 - z0) / rep); }
      scene.add(m);
      return m;
    };
    const Ap = this.APRON;
    plane(Ap.x0, Ap.z0, Ap.x1, Ap.z1, concMat, 0.006, 20);
    plane(1180, 388, Ap.x0 + 2, 412, World.asphaltMat, 0.006, 8);
    this.TAXI.forEach((t) => {
      plane(t.x0, t.z0, t.x1, t.z1, World.asphaltMat, 0.008, 8);
      marks.flat((t.x0 + t.x1) / 2, 0.03, (t.z0 + t.z1) / 2, 0.3, t.z1 - t.z0, [1, 0.8, 0.1]);
    });
    const R = this.RWY;
    const rwyMat = new THREE.MeshStandardMaterial({ map: this._runwayTex(), roughness: World.T.wet ? 0.6 : 0.9, envMap: env, envMapIntensity: World.T.wet ? 0.5 : 0.1 });
    plane(R.x0, R.z0, R.x1, R.z1, rwyMat, 0.012);
    // garis kuning di apron
    marks.flat((Ap.x0 + Ap.x1) / 2, 0.02, 470, Ap.x1 - Ap.x0 - 20, 0.3, [1, 0.8, 0.1]);

    // lampu landasan
    const lpos = [], lcol = [];
    const addL = (x, y, z, c) => { lpos.push(x, y, z); lcol.push(c[0], c[1], c[2]); };
    for (let x = R.x0; x <= R.x1; x += 25) { addL(x, 0.4, R.z0 - 0.6, [1, 1, 0.9]); addL(x, 0.4, R.z1 + 0.6, [1, 1, 0.9]); }
    for (let z = R.z0; z <= R.z1; z += 3) { addL(R.x0 - 1, 0.4, z, [0.2, 1, 0.3]); addL(R.x1 + 1, 0.4, z, [1, 0.15, 0.1]); }
    for (let x = A.x0 + 6; x < R.x0; x += 8) for (let k = -2; k <= 2; k++) addL(x, 0.6, R.zc + k * 2, [1, 1, 0.95]);
    this.TAXI.forEach((t) => { for (let z = t.z0; z <= t.z1; z += 12) { addL(t.x0 - 0.5, 0.35, z, [0.2, 0.4, 1]); addL(t.x1 + 0.5, 0.35, z, [0.2, 0.4, 1]); } });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(lcol, 3));
    this.rwyLights = new THREE.Points(lg, new THREE.PointsMaterial({ size: 1.4, vertexColors: true, map: Tex.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: World.T.pools > 0 ? 1 : 0.45 }));
    scene.add(this.rwyLights);

    // pagar bandara (dengan celah pintu masuk)
    const fz = [[A.z0, C.z - C.hw], [C.z + C.hw, A.z1]];
    fz.forEach(([z0, z1]) => World.addWall(A.x0 - 2, z0, A.x0, z1));
    World.addWall(A.x0 - 2, A.z1, A.x1 + 2, A.z1 + 2);
    World.addWall(A.x0 - 2, A.z0 - 2, A.x1 + 2, A.z0);
    World.addWall(A.x1, A.z0, A.x1 + 2, A.z1);
    const fenceMat = new THREE.MeshStandardMaterial({ map: this._fenceTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.6 });
    const fences = [
      [A.x0, A.z0, A.x0, C.z - C.hw], [A.x0, C.z + C.hw, A.x0, A.z1],
      [A.x0, A.z1, A.x1, A.z1], [A.x0, A.z0, A.x1, A.z0], [A.x1, A.z0, A.x1, A.z1],
    ];
    fences.forEach(([x0, z0, x1, z1]) => {
      const L = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(L, 3), fenceMat);
      const u3 = m.geometry.attributes.uv;
      for (let i = 0; i < u3.count; i++) u3.setX(i, u3.getX(i) * L / 3);
      m.position.set((x0 + x1) / 2, 1.5, (z0 + z1) / 2);
      m.rotation.y = x0 === x1 ? Math.PI / 2 : 0;
      scene.add(m);
      for (let t = 0; t <= L; t += 6) {
        const px = x0 + (x1 - x0) * (t / L), pz = z0 + (z1 - z0) * (t / L);
        metal.box(px, 1.6, pz, 0.12, 3.2, 0.12);
      }
    });

    // terminal
    const termMat = World.buildingMats[1];
    const tb = new GeoBatch();
    tb.box(1320, 8.3, 227.5, 240, 16, 75, { faces: 'XxZz', tileW: 16, tileH: 28 });
    scene.add(Object.assign(new THREE.Mesh(tb.build(), termMat), { castShadow: true, receiveShadow: true }));
    conc.box(1320, 16.6, 230, 250, 0.8, 85, { tileW: 4, tileH: 4 });
    World.addWall(1200, 190, 1440, 265);
    this._sign(scene, 1320, 19.5, 270.6, 70, 4.2, ['NEOPOLIS INTERNASIONAL'], '#0a1630', 0, true);
    // garbarata + pesawat parkir
    [1250, 1380].forEach((px, i) => {
      const pl = this.makePlane(i === 0 ? '#e8173c' : '#00a0ff');
      pl.position.set(px, 0, 293);
      pl.rotation.y = Math.PI;
      pl.userData.gear.visible = true;
      scene.add(pl);
      this.parked.push(pl);
      World.addWall(px - 2.3, 272, px + 2.3, 313);
      World.addWall(px - 8, 288, px - 4, 293);
      World.addWall(px + 4, 288, px + 8, 293);
      metal.box(px - 5.5, 5.5, 270, 3, 3, 12);
      metal.box(px - 5.5, 2, 274, 0.6, 4, 0.6);
    });
    // menara kontrol
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4, 42, 16), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.7 }));
    tw.position.set(1480, 21, 230); tw.castShadow = true; scene.add(tw);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 6, 6, 16), new THREE.MeshStandardMaterial({ color: 0x1d3b4a, emissive: 0x2a7a8a, emissiveIntensity: World.T.win * 0.8 + 0.1, roughness: 0.15, metalness: 0.8, envMap: env }));
    cab.position.set(1480, 45, 230); scene.add(cab);
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.2, 1, 16), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
    cr.position.set(1480, 48.5, 230); scene.add(cr);
    metal.box(1480, 53, 230, 0.3, 8, 0.3);
    this.blinkSprites.push(this._light(scene, 1480, 57.3, 230, 0xff2222, 3, 1.2));
    World.addWall(1475, 225, 1485, 235);
    // hanggar
    const hangMat = new THREE.MeshStandardMaterial({ map: this._corrugatedTex(), roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.4 });
    [1600, 1720].forEach((hx) => {
      const g = new THREE.CylinderGeometry(40, 40, 90, 24, 1, true, -Math.PI / 2, Math.PI);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, hangMat);
      m.scale.set(1, 0.55, 1);
      m.position.set(hx, 0, 185);
      m.castShadow = true;
      scene.add(m);
      conc.box(hx, 11, 230, 80, 22, 0.6, { tileW: 4, tileH: 4 });
      metal.box(hx, 7, 230.5, 50, 14, 0.3);
      World.addWall(hx - 40, 140, hx + 40, 231);
    });
    // tangki bahan bakar
    [[1860, 120], [1890, 120]].forEach(([x, z]) => {
      const tk = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 12, 20), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.5, metalness: 0.3 }));
      tk.position.set(x, 6, z); tk.castShadow = true; scene.add(tk);
      World.addWall(x - 10, z - 10, x + 10, z + 10);
    });
    // tiang lampu apron
    [[1230, 450], [1450, 450], [1620, 450], [1760, 300]].forEach(([x, z]) => {
      metal.box(x, 11, z, 0.6, 22, 0.6);
      glow.box(x, 22.2, z, 4, 0.8, 1.6, { color: [1, 0.92, 0.75] });
      if (World.T.pools > 0) pools.flat(x, 0.05, z - 14, 46, 46, [1, 0.8, 0.55].map((v) => v * World.T.pools));
      World.addWall(x - 0.6, z - 0.6, x + 0.6, z + 0.6);
    });
    // kantong angin
    metal.box(1905, 4, 675, 0.2, 8, 0.2);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.8, 4, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xff6a00, side: THREE.DoubleSide }));
    sock.geometry.rotateZ(Math.PI / 2);
    sock.position.set(1907, 7.6, 675);
    scene.add(sock);
    this.sock = sock;

    // ================= jadikan mesh =================
    const add = (b, mat, cast) => { if (!b.count) return; const m = new THREE.Mesh(b.build(), mat); if (cast) m.castShadow = true; m.receiveShadow = true; scene.add(m); };
    add(conc, portalMat, true);
    add(metal, World.metalMat, true);
    add(glow, new THREE.MeshBasicMaterial({ vertexColors: true }));
    add(marks, new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    add(pools, new THREE.MeshBasicMaterial({ map: Tex.radial('rgba(255,255,255,0.55)', 'rgba(0,0,0,0)'), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    add(nature, World.natureMat, quality === 'high');

    // ================= LALU LINTAS UDARA =================
    this.flights = [];
    const p1 = this.makePlane('#ff2bd6');
    scene.add(p1);
    this.flights.push(new Flight(p1, 'airport'));
    const p2 = this.makePlane('#ffb000');
    scene.add(p2);
    this.flights.push(new Flight(p2, 'cruise', { cx: 900, cz: 400, r: 1700, alt: 650, speed: 95, a: 0 }));
    const p3 = this.makePlane('#00e5a0');
    scene.add(p3);
    this.flights.push(new Flight(p3, 'cruise', { cx: 600, cz: 300, r: 2300, alt: 900, speed: 110, a: 2.5, dir: -1 }));
    const heli = this.makeHeli();
    scene.add(heli);
    this.flights.push(new Flight(heli, 'heli', { cx: 400, cz: 400, r: 230, alt: 120, speed: 28, a: 1 }));
    // balon udara
    const bcols = [['#e8173c', '#ffd400'], ['#00a0ff', '#ffffff'], ['#7cff00', '#ff6a00'], ['#ff2bd6', '#7a2cff'], ['#ffb000', '#e8173c']];
    bcols.forEach((cc, i) => {
      const b = this.makeBalloon(cc);
      scene.add(b);
      this.flights.push(new Flight(b, 'balloon', { x: 950 + i * 140, z: -100 + (i % 3) * 420, alt: 110 + i * 35, phase: i }));
    });
  },

  update(dt, t) {
    this.flights.forEach((f) => f.update(dt, t));
    const on = Math.sin(t * 5) > 0.6;
    this.blinkSprites.forEach((s) => { s.visible = on; });
    if (this.sock) this.sock.rotation.y = Math.sin(t * 0.3) * 0.5;
  },

  // pesawat di landasan saat event bandara dimulai → pindahkan ke udara
  clearRunway() { this.flights.forEach((f) => f.mode === 'airport' && f.toAir()); },

  // rintangan pesawat yang sedang di darat (untuk tabrakan dengan mobil)
  groundObstacles() {
    const out = [];
    this.flights.forEach((f) => {
      if (f.mode === 'airport' && f.y < 4) out.push({ x: f.x, z: f.z, h: f.h, vx: Math.sin(f.h) * f.speed, vz: Math.cos(f.h) * f.speed, circles: [-2, -1, 0, 1, 2], cOff: 7.5, cRad: 2.4 });
    });
    return out;
  },
  nearestDist(x, z) {
    let best = 1e9;
    this.flights.forEach((f) => { if (f.mode !== 'balloon') best = Math.min(best, Math.hypot(f.x - x, f.z - z, f.y)); });
    return best;
  },

  // ---------------- model pesawat orisinal
  makePlane(accent) {
    const g = new THREE.Group();
    const env = World.envMap;
    const skin = this._fuselageTex(accent);
    const body = new THREE.MeshStandardMaterial({ map: skin.map, emissiveMap: skin.emi, emissive: 0xffffff, emissiveIntensity: World.T.win > 0.3 ? 1 : 0.2, roughness: 0.35, metalness: 0.25, envMap: env, envMapIntensity: 0.9 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.35, metalness: 0.3, envMap: env });
    const acc = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.35, metalness: 0.3, envMap: env });
    const dark = new THREE.MeshStandardMaterial({ color: 0x22252b, roughness: 0.5, metalness: 0.5 });
    // badan (lathe)
    const prof = [[0, -19], [0.5, -18.4], [1.2, -16], [1.9, -11], [2.05, -6], [2.05, 12], [1.85, 15], [1.35, 17.4], [0.7, 18.9], [0, 19.5]].map(([r, y]) => new THREE.Vector2(r, y));
    const fg = new THREE.LatheGeometry(prof, 24);
    fg.rotateX(Math.PI / 2);
    const fus = new THREE.Mesh(fg, body);
    fus.position.y = 3.6;
    fus.castShadow = true;
    g.add(fus);
    // kaca kokpit
    const ck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 1.2), new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.1, metalness: 0.9, envMap: env }));
    ck.position.set(0, 4.75, 16.6); ck.rotation.x = 0.45;
    g.add(ck);
    // sayap
    const wingShape = (s) => {
      const sh = new THREE.Shape();
      sh.moveTo(1.5 * s, 4); sh.lineTo(18 * s, -4.5); sh.lineTo(18 * s, -6.2); sh.lineTo(1.5 * s, -3.5); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.45, bevelEnabled: false });
      geo.rotateX(Math.PI / 2);
      return geo;
    };
    [-1, 1].forEach((s) => {
      const w = new THREE.Mesh(wingShape(s), white);
      w.position.set(0, 2.6, 0);
      w.rotation.z = s * 0.06;
      w.castShadow = true;
      g.add(w);
      const wl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 1.6), acc);
      wl.position.set(18 * s, 3.8, -5.4);
      g.add(wl);
      // mesin
      const en = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.0, 4.6, 16).rotateX(Math.PI / 2), white);
      en.position.set(6.2 * s, 1.3, 2.4);
      g.add(en);
      const inl = new THREE.Mesh(new THREE.CircleGeometry(1.0, 16), dark);
      inl.position.set(6.2 * s, 1.3, 4.72);
      g.add(inl);
      const py = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 3), white);
      py.position.set(6.2 * s, 2.3, 1.8);
      g.add(py);
      // stabilizer horizontal
      const hs = new THREE.Shape();
      hs.moveTo(0.8 * s, -14); hs.lineTo(7 * s, -18.2); hs.lineTo(7 * s, -19.4); hs.lineTo(0.8 * s, -18.4); hs.closePath();
      const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.3, bevelEnabled: false });
      hg.rotateX(Math.PI / 2);
      const hm = new THREE.Mesh(hg, white);
      hm.position.y = 4.4;
      g.add(hm);
    });
    // sirip ekor
    const fin = new THREE.Shape();
    fin.moveTo(-12, 0); fin.lineTo(-18.5, 0); fin.lineTo(-20.2, 8.5); fin.lineTo(-17, 8.5); fin.closePath();
    const fgeo = new THREE.ExtrudeGeometry(fin, { depth: 0.4, bevelEnabled: false });
    fgeo.rotateY(-Math.PI / 2);
    const fm = new THREE.Mesh(fgeo, acc);
    fm.position.set(0.2, 5.4, 0);
    fm.castShadow = true;
    g.add(fm);
    // roda pendarat
    const gear = new THREE.Group();
    [[0, 15], [-3, -1], [3, -1]].forEach(([x, z]) => {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 6), dark);
      st.position.set(x, 1.6, z); gear.add(st);
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 12).rotateZ(Math.PI / 2), dark);
      wh.position.set(x, 0.55, z); gear.add(wh);
    });
    g.add(gear);
    // lampu navigasi
    const navR = this._light(g, 18, 3.5, -5.6, 0xff2020, 1.6, 1);
    const navG = this._light(g, -18, 3.5, -5.6, 0x20ff40, 1.6, 1);
    const strobe = [this._light(g, 18.1, 3.6, -6, 0xffffff, 2.6, 2), this._light(g, -18.1, 3.6, -6, 0xffffff, 2.6, 2), this._light(g, 0, 4.6, -19.6, 0xffffff, 2, 2)];
    const beacon = [this._light(g, 0, 5.75, 2, 0xff2020, 1.8, 1.5), this._light(g, 0, 1.45, 2, 0xff2020, 1.8, 1.5)];
    const landing = [this._light(g, 2.5, 2.4, 3.5, 0xfff6e0, 7, 3), this._light(g, -2.5, 2.4, 3.5, 0xfff6e0, 7, 3)];
    g.userData = { gear, navR, navG, strobe, beacon, landing };
    return g;
  },
  makeHeli() {
    const g = new THREE.Group();
    const env = World.envMap;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2e4a3a, roughness: 0.5, metalness: 0.4, envMap: env });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat);
    b.scale.set(1.6, 1.5, 3.2); b.position.y = 0; g.add(b);
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0b1420, roughness: 0.05, metalness: 0.9, envMap: env }));
    glass.scale.set(1.5, 1.2, 1.6); glass.position.set(0, 0.2, 1.9); glass.rotation.x = 1.2; g.add(glass);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 7, 10).rotateX(Math.PI / 2), mat);
    boom.position.set(0, 0.5, -5.8); g.add(boom);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 1.2), mat);
    fin.position.set(0, 1.4, -9); g.add(fin);
    const tr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.25), dark);
    tr.position.set(0.25, 1.5, -9.1); g.add(tr);
    [-1, 1].forEach((s) => {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 5), dark);
      sk.position.set(s * 1.3, -1.9, 0.2); g.add(sk);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), dark);
      leg.position.set(s * 1.25, -1.4, 0.8); g.add(leg);
    });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8), dark);
    mast.position.y = 1.8; g.add(mast);
    const rotor = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 11), dark);
      bl.rotation.y = (k / 4) * Math.PI;
      rotor.add(bl);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(5.6, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    disc.rotation.x = -Math.PI / 2;
    rotor.add(disc);
    rotor.position.y = 2.2;
    g.add(rotor);
    // lampu sorot ke bawah
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: World.T.pools > 0 ? 0.08 : 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(18, 120, 24, 1, true), coneMat);
    cone.position.set(0, -60, 4);
    cone.rotation.x = 0.25;
    g.add(cone);
    const red = this._light(g, 0, -1.4, 0, 0xff2020, 1.4, 1);
    g.userData = { rotor, tr, beacon: [red], strobe: [], landing: [], navR: null, navG: null, gear: null };
    g.scale.setScalar(1.4);
    return g;
  },
  makeBalloon(cols) {
    const g = new THREE.Group();
    const c = Tex.canvas(256, 64);
    const x = c.getContext('2d');
    for (let i = 0; i < 12; i++) { x.fillStyle = cols[i % 2]; x.fillRect(i * (256 / 12), 0, 256 / 12 + 1, 64); }
    const prof = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = t * Math.PI;
      const r = Math.sin(a) * (t > 0.5 ? 1 : 0.55 + 0.45 * Math.sin(t * Math.PI)) * 9;
      prof.push(new THREE.Vector2(Math.max(0.3, r), -11 + t * 22));
    }
    prof.reverse();
    const env = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), new THREE.MeshStandardMaterial({ map: Tex.make(c), roughness: 0.7, side: THREE.DoubleSide }));
    env.position.y = 14;
    g.add(env);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 1 }));
    g.add(basket);
    [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].forEach(([a, b]) => {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.4, 4), new THREE.MeshBasicMaterial({ color: 0x222222 }));
      r.position.set(a, 2.2, b); g.add(r);
    });
    const fire = this._light(g, 0, 2.6, 0, 0xffa040, 2.2, 1.4);
    g.userData = { fire };
    return g;
  },

  _light(parent, x, y, z, color, size, boost) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.get('dot', () => Tex.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64)), color: new THREE.Color(color).multiplyScalar(boost || 1), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.scale.set(size, size, 1);
    s.position.set(x, y, z);
    parent.add(s);
    return s;
  },
  _sign(scene, x, y, z, w, h, lines, bg, face, neon) {
    const c = Tex.canvas(1024, Math.round(1024 * h / w));
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(8, 8, c.width - 16, c.height - 16);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.min(c.height / (lines.length + 0.6), 90);
    g.font = `bold ${fs}px Arial`;
    if (neon) { g.shadowColor = '#00e5ff'; g.shadowBlur = 20; g.fillStyle = '#bff6ff'; }
    lines.forEach((l, i) => g.fillText(l, c.width / 2, (c.height / (lines.length + 1)) * (i + 1)));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: Tex.make(c), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    if (face === undefined || face === -1) m.rotation.y = -Math.PI / 2;
    else if (face === 1) m.rotation.y = Math.PI / 2;
    else m.rotation.y = 0;
    scene.add(m);
    return m;
  },

  // ---------------- tekstur
  _tunnelTex() {
    const c = Tex.canvas(256, 64);
    const g = c.getContext('2d');
    g.fillStyle = '#4a4744'; g.fillRect(0, 0, 256, 64);
    const tiles = (u0, u1) => {
      g.fillStyle = '#d6cdb6'; g.fillRect(u0, 0, u1 - u0, 64);
      g.strokeStyle = '#9d9480'; g.lineWidth = 1;
      for (let x = u0; x <= u1; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
      for (let y = 0; y <= 64; y += 8) { g.beginPath(); g.moveTo(u0, y); g.lineTo(u1, y); g.stroke(); }
    };
    tiles(0, 50); tiles(206, 256);
    g.fillStyle = '#e0a020'; g.fillRect(50, 0, 4, 64); g.fillRect(202, 0, 4, 64);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`; g.fillRect(Math.random() * 256, Math.random() * 64, 3, 3); }
    const gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.15, 'rgba(0,0,0,0)'); gr.addColorStop(0.85, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
    return Tex.make(c, true);
  },
  _concreteTex() {
    return Tex.get('concrete', () => {
      const c = Tex.canvas(128, 128);
      const g = c.getContext('2d');
      g.fillStyle = '#a9a59e'; g.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
      g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 2;
      g.strokeRect(0, 0, 128, 128);
      return Tex.make(c, true);
    });
  },
  _fieldTex(base) {
    const c = Tex.canvas(64, 64);
    const g = c.getContext('2d');
    const bc = new THREE.Color(base);
    for (let i = 0; i < 8; i++) {
      const k = i % 2 ? 1.12 : 0.95;
      g.fillStyle = `rgb(${Math.round(bc.r * 255 * k)},${Math.round(bc.g * 255 * k)},${Math.round(bc.b * 255 * k)})`;
      g.fillRect(i * 8, 0, 8, 64);
    }
    return Tex.make(c, true);
  },
  _runwayTex() {
    const c = Tex.canvas(2048, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#2f2f34'; g.fillRect(0, 0, 2048, 128);
    for (let i = 0; i < 20000; i++) { const v = 30 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v + 4},0.6)`; g.fillRect(Math.random() * 2048, Math.random() * 128, 2, 1); }
    g.fillStyle = '#e8e8e8';
    g.fillRect(0, 5, 2048, 3); g.fillRect(0, 120, 2048, 3);
    const px = 2048 / 710; // px per meter
    for (let x = 70 * px; x < 2048 - 70 * px; x += 50 * px) g.fillRect(x, 62, 30 * px, 4);
    // threshold & angka (orisinal)
    [0, 1].forEach((end) => {
      const x0 = end ? 2048 - 40 * px : 6 * px;
      for (let k = 0; k < 12; k++) { if (k === 5 || k === 6) continue; g.fillRect(x0, 14 + k * 8.6, 30 * px, 5); }
      g.save();
      const tx = end ? 2048 - 58 * px : 58 * px;
      g.translate(tx, 64); g.rotate(end ? -Math.PI / 2 : Math.PI / 2);
      g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(end ? '27' : '09', 0, 0);
      g.restore();
      // touchdown zone
      const tz = end ? 2048 - 150 * px : 120 * px;
      g.fillRect(tz, 30, 30 * px, 8); g.fillRect(tz, 90, 30 * px, 8);
    });
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(Math.random() * 2048, 40 + Math.random() * 48, 40 + Math.random() * 120, 4 + Math.random() * 8); }
    const t = Tex.make(c);
    t.anisotropy = 8;
    return t;
  },
  _fenceTex() {
    const c = Tex.canvas(64, 64);
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(190,195,200,1)'; g.lineWidth = 2;
    for (let i = -64; i < 128; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke(); }
    g.fillStyle = 'rgba(160,165,170,1)'; g.fillRect(0, 0, 64, 4);
    return Tex.make(c, true);
  },
  _corrugatedTex() {
    const c = Tex.canvas(64, 64);
    const g = c.getContext('2d');
    for (let x = 0; x < 64; x++) { const v = 150 + Math.sin(x / 2) * 35; g.fillStyle = `rgb(${v},${v + 3},${v + 6})`; g.fillRect(x, 0, 1, 64); }
    const t = Tex.make(c, true);
    t.repeat.set(30, 4);
    return t;
  },
  _fuselageTex(accent) {
    const W = 512, Hh = 256;
    const c = Tex.canvas(W, Hh), e = Tex.canvas(W, Hh);
    const g = c.getContext('2d'), ge = e.getContext('2d');
    g.fillStyle = '#eef0f2'; g.fillRect(0, 0, W, Hh);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, W, Hh);
    // perut abu-abu (u≈0/1)
    g.fillStyle = '#b8bec6'; g.fillRect(0, 0, W * 0.12, Hh); g.fillRect(W * 0.88, 0, W * 0.12, Hh);
    // garis aksen & jendela di kedua sisi (u≈0.25 dan 0.75)
    [[0.215, 0.285], [0.785, 0.715]].forEach(([stripe, win]) => {
      g.fillStyle = accent; g.fillRect(W * stripe - 6, Hh * 0.08, 12, Hh * 0.84);
      for (let y = Hh * 0.18; y < Hh * 0.86; y += 6) {
        g.fillStyle = '#1b2430'; g.fillRect(W * win - 2, y, 4, 3);
        ge.fillStyle = '#ffe2a8'; ge.fillRect(W * win - 2, y, 4, 3);
      }
    });
    return { map: Tex.make(c), emi: Tex.make(e) };
  },
};

/* ---------------- pengendali gerak pesawat/heli/balon ---------------- */
class Flight {
  constructor(obj, mode, o = {}) {
    this.obj = obj; this.mode = mode; this.o = o;
    this.x = 0; this.y = 0; this.z = 0; this.h = 0; this.pitch = 0; this.bank = 0; this.speed = 0; this.t = 0;
    const R = Airport.RWY;
    if (mode === 'airport') {
      this.state = 'hold'; this.timer = 6;
      this.x = R.x0 + 8; this.z = R.zc; this.h = Math.PI / 2;
      this.wps = [[3300, 330, R.zc], [3300, 330, -900], [-1800, 300, -900], [-1800, 260, R.zc]];
    } else if (mode === 'cruise' || mode === 'heli') {
      this.a = o.a || 0;
      this.speed = o.speed;
    } else if (mode === 'balloon') {
      this.x = o.x; this.z = o.z; this.y = o.alt;
    }
    this.update(0, 0);
  }
  toAir() {
    if (this.y > 60) return;
    this.state = 'fly'; this.wpi = 1;
    this.x = 3300; this.y = 330; this.z = Airport.RWY.zc; this.h = Math.PI; this.speed = 75; this.pitch = 0;
  }
  _flyTo(dt, tx, ty, tz, turnMax, vGain) {
    const desired = Math.atan2(tx - this.x, tz - this.z);
    const yr = U.clamp(U.angDiff(this.h, desired) * 0.6, -turnMax, turnMax);
    this.h += yr * dt;
    this.bank += (-yr * 4 - this.bank) * Math.min(1, dt * 1.5);
    const vy = U.clamp((ty - this.y) * (vGain || 0.35), -12, 11);
    this.pitch += (Math.atan2(vy, Math.max(20, this.speed)) - this.pitch) * Math.min(1, dt * 2);
    this.x += Math.sin(this.h) * this.speed * dt;
    this.z += Math.cos(this.h) * this.speed * dt;
    this.y += vy * dt;
    return Math.hypot(tx - this.x, tz - this.z);
  }
  update(dt, t) {
    this.t += dt;
    const R = Airport.RWY;
    const ud = this.obj.userData;
    if (this.mode === 'airport') {
      switch (this.state) {
        case 'hold':
          this.speed = 0; this.timer -= dt;
          if (this.timer <= 0) this.state = 'roll';
          break;
        case 'roll':
          this.speed = Math.min(80, this.speed + 4.5 * dt);
          this.x += this.speed * dt;
          if (this.speed > 66) { this.pitch = Math.min(0.16, this.pitch + dt * 0.12); this.y += Math.sin(this.pitch) * this.speed * dt; }
          if (this.y > 25) { this.state = 'fly'; this.wpi = 0; }
          break;
        case 'fly': {
          const w = this.wps[this.wpi];
          this.speed += (78 - this.speed) * dt * 0.3;
          const d = this._flyTo(dt, w[0], w[1], w[2], 0.13);
          if (d < 280) { this.wpi++; if (this.wpi >= this.wps.length) { this.state = 'final'; this.finalD = Math.hypot(this.x - R.x0, this.z - R.zc); } }
          break;
        }
        case 'final': {
          const tx = R.x0 + 110; // titik sentuh landasan
          const d = tx - this.x;
          const ty = d > 0 ? Math.min(this.y + 2, d * Math.tan(5.5 * Math.PI / 180)) : 0;
          this.speed += (64 - this.speed) * dt * 0.3;
          this._flyTo(dt, tx + 600, ty, R.zc, 0.1, d < 1500 ? 0.9 : 0.35);
          // jaga lurus dengan landasan
          this.z += (R.zc - this.z) * Math.min(1, dt * 0.3);
          if (this.x > R.x0 && this.y < 3) { this.state = 'landroll'; this.y = 0; this.pitch = 0; this.bank = 0; this.h = Math.PI / 2; this.z = R.zc; }
          else if (this.x > R.x0 + 450) { this.state = 'fly'; this.wpi = 0; } // batal mendarat → putar lagi
          break;
        }
        case 'landroll':
          this.speed = Math.max(9, this.speed - 4.4 * dt);
          this.x += this.speed * dt;
          if (this.speed <= 9.01) { this.state = 'turn'; this.turnFrom = this.h; this.turnT = 0; }
          break;
        case 'turn':
          this.turnT += dt / 9;
          this.speed = 4;
          this.h = this.turnFrom + Math.PI * Math.min(1, this.turnT);
          this.x += Math.sin(this.h) * this.speed * dt; this.z += Math.cos(this.h) * this.speed * dt;
          if (this.turnT >= 1) { this.h = this.turnFrom + Math.PI; this.state = this.x > R.x0 + 200 ? 'taxi' : 'hold'; this.timer = 10; if (this.state === 'hold') this.h = Math.PI / 2; }
          break;
        case 'taxi':
          this.speed = 12;
          this.x += Math.sin(this.h) * this.speed * dt;
          this.z += (R.zc - this.z) * Math.min(1, dt);
          if (this.x < R.x0 + 30) { this.state = 'turn'; this.turnFrom = this.h; this.turnT = 0; }
          break;
      }
      if (this.y < 0) this.y = 0;
      const low = this.y < 400 && (this.state === 'final' || this.state === 'roll' || this.state === 'landroll' || (this.state === 'fly' && this.wpi === 0));
      if (ud.gear) ud.gear.visible = this.y < 60 && (this.state !== 'fly');
      ud.landing.forEach((l) => { l.visible = low; });
    } else if (this.mode === 'cruise' || this.mode === 'heli') {
      const o = this.o, dir = o.dir || 1;
      this.a += (this.speed / o.r) * dt * dir;
      this.x = o.cx + Math.cos(this.a) * o.r;
      this.z = o.cz + Math.sin(this.a) * o.r;
      this.y = o.alt + (this.mode === 'heli' ? Math.sin(this.t * 0.4) * 8 : 0);
      // arah = garis singgung lingkaran
      const tx = -Math.sin(this.a) * dir, tz = Math.cos(this.a) * dir;
      this.h = Math.atan2(tx, tz);
      this.bank = dir * (this.mode === 'heli' ? 0.15 : 0.22);
      this.pitch = this.mode === 'heli' ? -0.08 : 0;
      if (ud.gear) ud.gear.visible = false;
      if (ud.landing) ud.landing.forEach((l) => { l.visible = false; });
      if (ud.rotor) { ud.rotor.rotation.y += dt * 28; ud.tr.rotation.x += dt * 40; }
    } else if (this.mode === 'balloon') {
      const o = this.o;
      this.x = o.x + Math.sin(this.t * 0.02 + o.phase) * 120;
      this.z = o.z + Math.cos(this.t * 0.015 + o.phase * 2) * 90;
      this.y = o.alt + Math.sin(this.t * 0.2 + o.phase) * 6;
      this.obj.rotation.y = this.t * 0.03 + o.phase;
      ud.fire.visible = Math.sin(this.t * 1.3 + o.phase * 3) > 0.55;
    }
    if (this.mode !== 'balloon') {
      this.obj.position.set(this.x, this.y, this.z);
      this.obj.rotation.set(-this.pitch, this.h, this.bank, 'YXZ');
      const blink = (this.t % 1.2) < 0.08;
      if (ud.strobe) ud.strobe.forEach((s) => { s.visible = blink; });
      if (ud.beacon) ud.beacon.forEach((s) => { s.visible = (this.t % 1) < 0.5; });
    } else {
      this.obj.position.set(this.x, this.y, this.z);
    }
  }
}

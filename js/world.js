/* =========================================================================
   KOTA "NEOPOLIS" â€” dibuat secara prosedural (grid 8x8 blok)
   + pengaturan waktu (Malam / Senja / Siang), langit, pegunungan, bayangan
   ========================================================================= */
const TIMES = {
  night: {
    name: 'Malam', sky: ['#020108', '#0b0620', '#2a0f3d', '#5a1650', '#1a0a26'], fog: 0x140b26, fogD: 0.0026,
    hemiSky: 0x7a6cff, hemiGround: 0x281428, hemiI: 0.55, sunCol: 0x9fb0ff, sunI: 0.45, sunDir: [-0.55, 0.75, -0.35], amb: 0x30244a, ambI: 0.35,
    exposure: 1.1, facade: 0.32, win: 1.0, pools: 1, marks: 0x5d5a6a, stars: true, moon: true, clouds: 0, bloom: 0.8, bloomTh: 1.0, wet: true,
    mount: ['#07050e', '#120c22'], beams: true, grass: '#0e1410',
  },
  dusk: {
    name: 'Senja', sky: ['#14224d', '#3b4a86', '#9a6f9c', '#ffa25e', '#4a3346'], fog: 0x7d6a86, fogD: 0.0017,
    hemiSky: 0xa9b8ff, hemiGround: 0x5a4636, hemiI: 0.95, sunCol: 0xffb36b, sunI: 1.9, sunDir: [-0.85, 0.28, -0.45], amb: 0x6a5060, ambI: 0.25,
    exposure: 1.0, facade: 0.85, win: 0.55, pools: 0.45, marks: 0x9a98a2, stars: false, sun: '#ffd28a', clouds: 0.5, bloom: 0.5, bloomTh: 2.2, wet: false,
    mount: ['#3c3150', '#8a6e8c'], beams: true, grass: '#3a4a2a',
  },
  day: {
    name: 'Siang', sky: ['#2c64c8', '#5d97e6', '#a9cdf2', '#e3eef8', '#c9d6df'], fog: 0xb6cbe0, fogD: 0.00105,
    hemiSky: 0xd7e7ff, hemiGround: 0x6d6852, hemiI: 0.95, sunCol: 0xfff3dc, sunI: 2.6, sunDir: [-0.45, 0.85, -0.3], amb: 0xffffff, ambI: 0.15,
    exposure: 0.95, facade: 1.0, win: 0.05, pools: 0, marks: 0xd6d6d6, stars: false, sun: '#fffbe8', clouds: 0.8, bloom: 0.3, bloomTh: 3.0, wet: false,
    mount: ['#7d8fa6', '#a8b9cc'], beams: false, grass: '#4f6b34',
  },
};

const World = {
  N: 8, P: 100, W: 24,
  barriers: [],
  barrierMeshes: [],
  blinkMats: [],
  walls: [],
  EAST_GAP: [388, 412],

  node(i, j) { return { x: i * this.P, z: j * this.P }; },
  get size() { return this.N * this.P; },
  get edge() { return this.size + this.W / 2; }, // 812

  addWall(x0, z0, x1, z1) { this.walls.push({ x0, z0, x1, z1 }); },

  build(scene, renderer, quality, time) {
    this.scene = scene;
    this.quality = quality;
    this.timeKey = TIMES[time] ? time : 'dusk';
    const T = (this.T = TIMES[this.timeKey]);
    const rnd = U.rng(20261113);
    const N = this.N, P = this.P, H = this.W / 2;
    const center = this.size / 2;
    this.walls = [];

    // ------------ langit, kabut, cahaya
    this.fogColor = new THREE.Color(T.fog);
    scene.background = this.fogColor.clone();
    scene.fog = new THREE.FogExp2(T.fog, T.fogD * (quality === 'low' ? 1.3 : 1));
    this.sky = this._sky(T);
    scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight(T.hemiSky, T.hemiGround, T.hemiI);
    scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(T.sunCol, T.sunI);
    this.sunDir = new THREE.Vector3().fromArray(T.sunDir).normalize();
    sun.position.copy(this.sunDir).multiplyScalar(300);
    if (quality !== 'low') {
      sun.castShadow = true;
      const hi = quality === 'high';
      sun.shadow.mapSize.set(hi ? 2048 : 1024, hi ? 2048 : 1024);
      const sc = sun.shadow.camera, ext = hi ? 70 : 50;
      sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 700;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.03;
    }
    this.sun = this.moon = sun;
    scene.add(sun); scene.add(sun.target);
    this.amb = new THREE.AmbientLight(T.amb, T.ambI);
    scene.add(this.amb);
    this.lightK = 1;

    // ------------ env map untuk pantulan cat mobil, kaca & jalan basah
    this.envMap = this._envMap(renderer, T);

    // ------------ tanah (rumput/tanah di luar kota) + aspal kota
    const grass = this._grassTex(T.grass);
    grass.repeat.set(400, 400);
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.set(1000, -0.05, 400);
    terrain.receiveShadow = true;
    scene.add(terrain);
    this.asphaltMat = this.makeAsphalt(T);
    const city = new THREE.Mesh(new THREE.PlaneGeometry(this.size + this.W + 4, this.size + this.W + 4), this.asphaltMat);
    city.rotation.x = -Math.PI / 2;
    city.position.set(center, 0, center);
    city.receiveShadow = true;
    scene.add(city);
    this._repeatUV(city.geometry, (this.size + this.W) / 8);

    // ------------ batch geometri
    const fac = [0, 1, 2, 3].map((v) => this._facadeTex(v, rnd));
    const bSides = fac.map(() => new GeoBatch());
    const roofs = new GeoBatch();
    const walk = new GeoBatch();
    const glow = new GeoBatch(true);
    const metal = new GeoBatch();
    const marks = new GeoBatch();
    const pools = new GeoBatch(true);
    const nature = new GeoBatch(true);
    const signs = new GeoBatch();
    const beacons = [];
    const neon = ['#ff2bd6', '#00e5ff', '#7a2cff', '#7cff00', '#ffb000', '#ff3355'].map((c) => new THREE.Color(c).toArray());
    const signAtlas = this._signAtlas();
    const pine = (x, z, s) => {
      const g = 0.16 + rnd() * 0.1;
      nature.box(x, 0.3 + 1 * s, z, 0.35 * s, 2 * s, 0.35 * s, { color: [0.2, 0.12, 0.07] });
      nature.cone(x, 0.3 + 1.4 * s, z, 2.2 * s, 4 * s, 7, [0.05, g, 0.08], [0.1, g + 0.12, 0.1]);
      nature.cone(x, 0.3 + 3.4 * s, z, 1.6 * s, 3.4 * s, 7, [0.06, g + 0.03, 0.09], [0.12, g + 0.15, 0.12]);
    };
    const leafy = (x, z, s) => {
      const g = 0.2 + rnd() * 0.12;
      nature.box(x, 0.3 + 1.3 * s, z, 0.3 * s, 2.6 * s, 0.3 * s, { color: [0.22, 0.14, 0.08] });
      const ym = 0.3 + 3.4 * s;
      nature.cone(x, ym, z, 2.1 * s, -1.5 * s, 7, [0.1, g + 0.04, 0.07], [0.06, g - 0.05, 0.05]);
      nature.cone(x, ym, z, 2.1 * s, 2.2 * s, 7, [0.1, g + 0.04, 0.07], [0.16, g + 0.14, 0.09]);
    };
    this.pine = pine; this.natureBatch = nature;

    for (let cx = 0; cx < N; cx++) {
      for (let cz = 0; cz < N; cz++) {
        const x0 = cx * P + H, x1 = cx * P + P - H;
        const z0 = cz * P + H, z1 = cz * P + P - H;
        const bw = x1 - x0;
        walk.box((x0 + x1) / 2, 0.15, (z0 + z1) / 2, bw, 0.3, bw, { faces: 'XxYZz', tileW: 4, tileH: 4 });
        const dd = Math.hypot(cx + 0.5 - N / 2, cz + 0.5 - N / 2) / (N * 0.707);
        const district = dd < 0.33 ? 0 : dd < 0.68 ? 1 : 2;
        const isPark = district !== 0 && rnd() < 0.12;
        const ix0 = x0 + 4, ix1 = x1 - 4, iz0 = z0 + 4, iz1 = z1 - 4;
        const lmk = Landmarks.reserved(cx, cz);
        if (lmk) {
          // blok landmark (toko/servis/mall) dibangun di landmarks.js
        } else if (isPark) {
          nature.flat((ix0 + ix1) / 2, 0.31, (iz0 + iz1) / 2, ix1 - ix0, iz1 - iz0, [0.12, 0.22, 0.1]);
          for (let t = 0; t < 30; t++) {
            const tx = U.lerp(ix0 + 3, ix1 - 3, rnd()), tz = U.lerp(iz0 + 3, iz1 - 3, rnd());
            if (rnd() < 0.5) pine(tx, tz, 1 + rnd() * 0.8); else leafy(tx, tz, 1 + rnd() * 0.6);
          }
          for (let k = 0; k < 6; k++) {
            const lx = U.lerp(ix0 + 6, ix1 - 6, rnd()), lz = U.lerp(iz0 + 6, iz1 - 6, rnd());
            metal.box(lx, 1.6, lz, 0.15, 3, 0.15);
            glow.box(lx, 3.2, lz, 0.5, 0.4, 0.5, { color: [1, 0.85, 0.6] });
          }
        } else {
          const lots = [];
          const r = rnd();
          if (district === 2 && r < 0.5) lots.push([ix0, iz0, ix1, iz1]);
          else if (r < 0.3) lots.push([ix0, iz0, ix1, iz1]);
          else if (r < 0.65) {
            const f = U.lerp(0.4, 0.6, rnd());
            if (rnd() < 0.5) { const m = U.lerp(ix0, ix1, f); lots.push([ix0, iz0, m, iz1], [m, iz0, ix1, iz1]); } else { const m = U.lerp(iz0, iz1, f); lots.push([ix0, iz0, ix1, m], [ix0, m, ix1, iz1]); }
          } else {
            const mx = U.lerp(ix0, ix1, U.lerp(0.4, 0.6, rnd())), mz = U.lerp(iz0, iz1, U.lerp(0.4, 0.6, rnd()));
            lots.push([ix0, iz0, mx, mz], [mx, iz0, ix1, mz], [ix0, mz, mx, iz1], [mx, mz, ix1, iz1]);
          }
          lots.forEach((L) => {
            const m = 0.8 + rnd() * 2;
            const a0 = L[0] + m, b0 = L[1] + m, a1 = L[2] - m, b1 = L[3] - m;
            const w = a1 - a0, d = b1 - b0;
            let h;
            if (district === 0) h = 40 + rnd() * 85;
            else if (district === 1) h = 16 + rnd() * 36;
            else h = 7 + rnd() * 14;
            const bx = (a0 + a1) / 2, bz = (b0 + b1) / 2;
            const v = district === 0 ? (rnd() < 0.55 ? 1 : (rnd() < 0.5 ? 3 : 0)) : Math.floor(rnd() * 4);
            bSides[v].box(bx, 0.3 + h / 2, bz, w, h, d, { faces: 'XxZz', tileW: 16, tileH: 28 });
            roofs.box(bx, 0.3 + h + 0.01, bz, w, 0.02, d, { faces: 'Y' });
            // parapet atap
            roofs.box(bx, 0.3 + h + 0.5, bz, w + 0.3, 1, d + 0.3, { faces: 'XxZz' });
            if (h > 30 && rnd() < 0.55) glow.box(bx, 0.3 + h - 0.6, bz, w + 0.4, 0.6, d + 0.4, { faces: 'XxZz', color: U.pick(neon) });
            if (h > 25 && rnd() < 0.5) {
              const ah = 6 + rnd() * 12;
              metal.box(bx, 0.3 + h + ah / 2, bz, 0.3, ah, 0.3);
              beacons.push(bx, 0.3 + h + ah + 0.3, bz);
            }
            for (let k = 0; k < 3; k++) {
              if (w > 8 && d > 8) metal.box(bx + (rnd() - 0.5) * (w - 4), 0.3 + h + 0.8, bz + (rnd() - 0.5) * (d - 4), 2, 1.6, 2);
            }
            // lantai dasar: kanopi toko
            const faces = [];
            if (Math.abs(L[0] - ix0) < 0.1) faces.push([-1, 0]);
            if (Math.abs(L[2] - ix1) < 0.1) faces.push([1, 0]);
            if (Math.abs(L[1] - iz0) < 0.1) faces.push([0, -1]);
            if (Math.abs(L[3] - iz1) < 0.1) faces.push([0, 1]);
            faces.forEach((fc) => {
              const len = fc[0] !== 0 ? d : w;
              if (district !== 2 && rnd() < 0.6) {
                // kanopi
                const cxp = bx + fc[0] * (w / 2 + 0.9), czp = bz + fc[1] * (d / 2 + 0.9);
                metal.box(cxp, 3.6, czp, fc[0] !== 0 ? 1.8 : len * 0.8, 0.15, fc[1] !== 0 ? 1.8 : len * 0.8);
              }
              if (rnd() < 0.55) {
                const sw = Math.min(len - 2, 7 + rnd() * 4);
                if (sw < 4) return;
                const sy = 5 + rnd() * Math.min(10, h - 5);
                const sx = bx + fc[0] * (w / 2 + 0.12), sz = bz + fc[1] * (d / 2 + 0.12);
                const off = (rnd() - 0.5) * (len - sw - 1);
                const px = sx + (fc[1] !== 0 ? off : 0), pz = sz + (fc[0] !== 0 ? off : 0);
                this._signQuad(signs, px, sy, pz, sw, sw / 8, fc[0], fc[1], Math.floor(rnd() * 16));
              }
            });
          });
        }
        // lampu jalan + pohon trotoar
        const sides = [
          { nx: -1, nz: 0, fixed: x0 + 1.2, along: 'z' }, { nx: 1, nz: 0, fixed: x1 - 1.2, along: 'z' },
          { nx: 0, nz: -1, fixed: z0 + 1.2, along: 'x' }, { nx: 0, nz: 1, fixed: z1 - 1.2, along: 'x' },
        ];
        const poolCol = district === 0 ? [0.55, 0.5, 1.0] : district === 1 ? [1.0, 0.6, 0.32] : [1.0, 0.72, 0.38];
        const headCol = district === 0 ? [0.85, 0.9, 1] : [1, 0.85, 0.6];
        sides.forEach((s) => {
          for (let k = 0; k < 3; k++) {
            const t = 12 + k * 26 + ((cx + cz) % 2) * 6;
            const along = (s.along === 'z' ? z0 : x0) + t;
            const px = s.along === 'z' ? s.fixed : along;
            const pz = s.along === 'z' ? along : s.fixed;
            metal.box(px, 3.8, pz, 0.2, 7, 0.2);
            const ax = px + s.nx * 1.2, az = pz + s.nz * 1.2;
            metal.box(ax, 7.2, az, s.nx ? 2.4 : 0.15, 0.15, s.nz ? 2.4 : 0.15);
            glow.box(px + s.nx * 2.2, 7.05, pz + s.nz * 2.2, 0.9, 0.18, 0.9, { color: headCol });
            pools.flat(px + s.nx * 4.5, 0.035, pz + s.nz * 4.5, 13, 13, poolCol);
            if (district !== 0 && !isPark && !lmk && k < 2) {
              const tt = t + 13;
              const qx = s.along === 'z' ? s.fixed : (s.along === 'x' ? x0 + tt : 0);
              const qz = s.along === 'z' ? z0 + tt : s.fixed;
              if (rnd() < 0.7) { if (district === 2) pine(qx, qz, 0.9 + rnd() * 0.3); else leafy(qx, qz, 0.9 + rnd() * 0.3); }
            }
          }
        });
      }
    }

    // ------------ marka jalan
    const markRoad = (horiz, line, seg) => {
      if (Landmarks.isHeritageRoad(horiz, line, seg)) return; // jalan heritage berbatu, tanpa marka
      const a = seg * P + H, b = (seg + 1) * P - H;
      const fixed = line * P;
      for (let t = a + 3; t < b - 3; t += 7) {
        if (horiz) marks.flat(t + 1.75, 0.025, fixed, 3.5, 0.25);
        else marks.flat(fixed, 0.025, t + 1.75, 0.25, 3.5);
      }
      const mid = (a + b) / 2;
      [-1, 1].forEach((sd) => {
        if (horiz) marks.flat(mid, 0.025, fixed + sd * (H - 1.2), b - a, 0.18);
        else marks.flat(fixed + sd * (H - 1.2), 0.025, mid, 0.18, b - a);
      });
    };
    for (let line = 0; line <= N; line++) for (let seg = 0; seg < N; seg++) { markRoad(true, line, seg); markRoad(false, line, seg); }
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const cxp = i * P, czp = j * P;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
          const ni = i + dx, nj = j + dz;
          if (ni < 0 || nj < 0 || ni > N || nj > N) return;
          const dist = H + 2;
          for (let s = -4; s <= 4; s++) {
            const off = s * 2.2;
            if (dx !== 0) marks.flat(cxp + dx * dist, 0.026, czp + off, 3, 1.0);
            else marks.flat(cxp + off, 0.026, czp + dz * dist, 1.0, 3);
          }
        });
      }
    }
    // marka di mulut jalan ke terowongan (sisi timur)
    for (let t = this.edge + 2; t < this.edge + 12; t += 7) marks.flat(t + 1.75, 0.025, 400, 3.5, 0.25);

    // ------------ tembok batas kota (dengan celah jalan ke terowongan di timur)
    const lo = -H - 1.5, hi = this.edge + 1.5, span = hi - lo;
    const g0 = this.EAST_GAP[0], g1 = this.EAST_GAP[1];
    walk.box(lo, 0.7, center, 3, 1.4, span + 3, { tileW: 4, tileH: 4 });
    walk.box(hi, 0.7, (lo + g0) / 2, 3, 1.4, g0 - lo, { tileW: 4, tileH: 4 });
    walk.box(hi, 0.7, (g1 + hi) / 2 + 1.5, 3, 1.4, hi - g1 + 3, { tileW: 4, tileH: 4 });
    // sisi selatan punya celah ke pelataran stasiun (x 388..412)
    const s0 = Landmarks.ST.gap[0], s1 = Landmarks.ST.gap[1];
    walk.box((lo - 1.5 + s0) / 2, 0.7, lo, s0 - lo + 1.5, 1.4, 3, { tileW: 4, tileH: 4 });
    walk.box((s1 + hi + 1.5) / 2, 0.7, lo, hi + 1.5 - s1, 1.4, 3, { tileW: 4, tileH: 4 });
    walk.box(center, 0.7, hi, span + 3, 1.4, 3, { tileW: 4, tileH: 4 });
    glow.box(lo + 1.55, 1.2, center, 0.05, 0.25, span, { faces: 'X', color: [1, 0.15, 0.7] });
    glow.box((lo + s0) / 2, 1.2, lo + 1.55, s0 - lo, 0.25, 0.05, { faces: 'Z', color: [0, 0.9, 1] });
    glow.box((s1 + hi) / 2, 1.2, lo + 1.55, hi - s1, 0.25, 0.05, { faces: 'Z', color: [0, 0.9, 1] });
    for (let t = -2; t > -12; t -= 7) marks.flat(400, 0.025, t - 1.75, 0.25, 3.5);
    glow.box(center, 1.2, hi - 1.55, span, 0.25, 0.05, { faces: 'z', color: [0, 0.9, 1] });
    const E = this.edge;
    this.addWall(-H - 3, -H - 3, -H, E + 3);
    this.addWall(E, -H - 3, E + 3, g0);
    this.addWall(E, g1, E + 3, E + 3);
    this.addWall(-H - 3, -H - 3, s0, -H);
    this.addWall(s1, -H - 3, E + 3, -H);
    this.addWall(-H - 3, E, E + 3, E + 3);

    // siluet gedung jauh (tidak di sisi timur, karena ada bukit & bandara)
    for (let k = 0; k < 160; k++) {
      const ang = rnd() * Math.PI * 2;
      const rad = 520 + rnd() * 260;
      const bx = center + Math.cos(ang) * rad, bz = center + Math.sin(ang) * rad;
      if (bx > center + 380) continue;
      if (bz > -280 && bz < 20) continue; // jalur rel kereta di selatan
      const w = 20 + rnd() * 30, h = 30 + rnd() * 110;
      bSides[k % 4].box(bx, h / 2, bz, w, h, w, { faces: 'XxZz', tileW: 16, tileH: 28 });
      if (rnd() < 0.35) glow.box(bx, h - 1, bz, w + 0.4, 1.2, w + 0.4, { faces: 'XxZz', color: U.pick(neon) });
    }

    // ------------ jadikan mesh
    const shadows = quality !== 'low';
    const add = (geo, mat, opts = {}) => {
      if (!geo.count) return null;
      const m = new THREE.Mesh(geo.build(), mat);
      m.matrixAutoUpdate = false; m.updateMatrix();
      if (shadows && opts.cast) m.castShadow = true;
      if (shadows && opts.recv) m.receiveShadow = true;
      if (opts.order) m.renderOrder = opts.order;
      scene.add(m);
      return m;
    };
    const fcol = new THREE.Color(T.facade, T.facade, T.facade);
    this.buildingMats = fac.map((f, i) => new THREE.MeshStandardMaterial({
      map: f.map, emissiveMap: f.emi, emissive: 0xffffff, emissiveIntensity: T.win, color: fcol,
      roughness: i === 1 ? 0.25 : 0.75, metalness: i === 1 ? 0.55 : 0.1, envMap: this.envMap, envMapIntensity: i === 1 ? 0.9 : 0.25,
    }));
    this.buildingMats.forEach((m, i) => add(bSides[i], m, { cast: true, recv: true }));
    add(roofs, new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4a4744).multiply(fcol), roughness: 0.9 }), { cast: true, recv: true });
    add(walk, new THREE.MeshStandardMaterial({ map: this._sidewalkTex(), roughness: 0.85, color: 0xb4b0bc }), { recv: true });
    const gk = this.timeKey === 'night' ? 1.8 : this.timeKey === 'dusk' ? 1.3 : 1;
    add(glow, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(gk, gk, gk) }));
    this.metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.5, metalness: 0.7, envMap: this.envMap, envMapIntensity: 0.5 });
    add(metal, this.metalMat, { cast: true });
    add(marks, new THREE.MeshBasicMaterial({ color: T.marks, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    if (T.pools > 0) {
      add(pools, new THREE.MeshBasicMaterial({
        map: Tex.radial('rgba(255,255,255,0.55)', 'rgba(0,0,0,0)'), vertexColors: true, transparent: true, color: new THREE.Color(T.pools, T.pools, T.pools),
        blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }), { order: 1 });
    }
    this.natureMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    this._natureMesh = add(nature, this.natureMat, { cast: true });
    add(signs, new THREE.MeshBasicMaterial({ map: signAtlas, side: THREE.DoubleSide }));

    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(beacons, 3));
    this.beaconMat = new THREE.PointsMaterial({ color: 0xff2244, size: 1.6, sizeAttenuation: true, map: Tex.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    scene.add(new THREE.Points(bg, this.beaconMat));

    this.barrierGroup = new THREE.Group();
    scene.add(this.barrierGroup);
    this._mountains(scene, T);
  },

  makeAsphalt(T) {
    const t = Tex.get('asph', () => this._asphaltTex());
    const r = Tex.get('asphR', () => this._roughTex());
    return new THREE.MeshStandardMaterial({
      color: this.timeKey === 'night' ? 0x8a8a96 : 0xffffff,
      map: t.map, bumpMap: t.map, bumpScale: 0.025, roughnessMap: T.wet ? r : null,
      roughness: T.wet ? 0.9 : 0.78, metalness: T.wet ? 0.1 : 0.05, envMap: this.envMap, envMapIntensity: T.wet ? 0.55 : 0.3,
    });
  },
  _repeatUV(geo, rep) {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rep, uv.getY(i) * rep);
  },

  // pegunungan jauh di cakrawala
  _mountains(scene, T) {
    const pos = [], col = [];
    const cx = 1000, cz = 400, R = 2700, n = 160;
    const c0 = new THREE.Color(T.mount[0]), c1 = new THREE.Color(T.mount[1]), cf = new THREE.Color(T.fog);
    const rnd = U.rng(77);
    const hs = [];
    for (let i = 0; i <= n; i++) hs.push(140 + Math.abs(Math.sin(i * 0.21) * 220 + Math.sin(i * 0.53 + 1) * 120) + rnd() * 60);
    hs[n] = hs[0];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p = (a, h) => [cx + Math.cos(a) * R, h, cz + Math.sin(a) * R];
      const A = p(a0, -20), B = p(a1, -20), C = p(a1, hs[i + 1]), D = p(a0, hs[i]);
      [A, B, C, A, C, D].forEach((v) => {
        pos.push(v[0], v[1], v[2]);
        const k = U.clamp(v[1] / 400, 0, 1);
        const cc = cf.clone().lerp(c0, 0.85).lerp(c1, k * 0.6);
        col.push(cc.r, cc.g, cc.b);
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    m.renderOrder = -5;
    scene.add(m);
  },

  inTunnel(x, z) { return x > 900 && x < 1100 && Math.abs(z - 400) < 13; },

  update(dt, t, cam) {
    if (this.beaconMat) this.beaconMat.opacity = 0.35 + 0.65 * (Math.sin(t * 3) > 0 ? 1 : 0.2);
    const blink = Math.sin(t * 8) > 0;
    this.blinkMats.forEach((m, i) => { m.color.setHex((blink ? i % 2 === 0 : i % 2 === 1) ? 0xffaa00 : 0x221100); });
    if (cam) {
      this.sky.position.copy(cam.position);
      // di dalam terowongan cahaya luar meredup
      const target = this.inTunnel(cam.position.x, cam.position.z) ? 0.18 : 1;
      this.lightK += (target - this.lightK) * Math.min(1, dt * 2.5);
      const k = this.lightK, T = this.T;
      this.hemi.intensity = T.hemiI * k;
      this.sun.intensity = T.sunI * k;
      this.amb.intensity = T.ambI * k;
      this.scene.fog.color.copy(this.fogColor).multiplyScalar(0.25 + 0.75 * k);
      this.scene.background.copy(this.scene.fog.color);
    }
  },

  // posisi bayangan matahari mengikuti pemain
  followSun(x, z) {
    const s = this.sun;
    s.position.set(x + this.sunDir.x * 250, this.sunDir.y * 250, z + this.sunDir.z * 250);
    s.target.position.set(x, 0, z);
  },

  // ------------ tabrakan
  collide(o) {
    let hit = 0;
    const P = this.P, H = this.W / 2, N = this.N;
    const cx = Math.floor(o.x / P), cz = Math.floor(o.z / P);
    if (cx >= 0 && cx < N && cz >= 0 && cz < N && o.x < this.edge) {
      hit = Math.max(hit, this._circleAABB(o, cx * P + H, cz * P + H, cx * P + P - H, cz * P + P - H));
    }
    for (let i = 0; i < this.walls.length; i++) {
      const b = this.walls[i];
      hit = Math.max(hit, this._circleAABB(o, b.x0, b.z0, b.x1, b.z1));
    }
    for (let i = 0; i < this.barriers.length; i++) {
      const b = this.barriers[i];
      hit = Math.max(hit, this._circleAABB(o, b.x0, b.z0, b.x1, b.z1));
    }
    return hit;
  },
  _circleAABB(o, x0, z0, x1, z1) {
    const r = o.radius;
    if (o.x < x0 - r || o.x > x1 + r || o.z < z0 - r || o.z > z1 + r) return 0;
    const px = U.clamp(o.x, x0, x1), pz = U.clamp(o.z, z0, z1);
    const dx = o.x - px, dz = o.z - pz;
    const d2 = dx * dx + dz * dz;
    let nx, nz, pen;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      if (d >= r) return 0;
      nx = dx / d; nz = dz / d; pen = r - d;
    } else {
      const l = o.x - x0, rr = x1 - o.x, t = o.z - z0, b = z1 - o.z;
      const m = Math.min(l, rr, t, b);
      if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rr) { nx = 1; nz = 0; pen = rr + r; } else if (m === t) { nx = 0; nz = -1; pen = t + r; } else { nx = 0; nz = 1; pen = b + r; }
    }
    return this._resolve(o, nx, nz, pen);
  },
  _resolve(o, nx, nz, pen) {
    o.x += nx * pen; o.z += nz * pen;
    const vn = o.vx * nx + o.vz * nz;
    if (vn < 0) {
      o.vx -= 1.3 * vn * nx; o.vz -= 1.3 * vn * nz;
      o.vx *= 0.97; o.vz *= 0.97;
      o.nx = nx; o.nz = nz;
      return -vn;
    }
    return 0;
  },

  // posisi aman terdekat di tengah jalan
  roadSnap(x, z, heading) {
    const P = this.P, N = this.N;
    if (x > this.edge - 2) {
      if (x < 1180) return { x: U.clamp(x, this.edge + 4, 1176), z: 400, h: Math.sin(heading) >= 0 ? Math.PI / 2 : -Math.PI / 2 };
      return { x: U.clamp(x, 1190, 1970), z: U.clamp(z, 50, 750), h: heading };
    }
    if (z < -this.W / 2) return { x: U.clamp(x, 400, 400), z: U.clamp(z, -60, -20), h: Math.cos(heading) >= 0 ? 0 : Math.PI };
    const ix = U.clamp(Math.round(x / P), 0, N), iz = U.clamp(Math.round(z / P), 0, N);
    const dx = Math.abs(x - ix * P), dz = Math.abs(z - iz * P);
    if (dx < dz) return { x: ix * P, z: U.clamp(z, 0, this.size), h: Math.cos(heading) >= 0 ? 0 : Math.PI };
    return { x: U.clamp(x, 0, this.size), z: iz * P, h: Math.sin(heading) >= 0 ? Math.PI / 2 : -Math.PI / 2 };
  },

  districtName(x, z) {
    if (z < -this.W / 2) return Landmarks.N().station;
    for (const p of Landmarks.pois) if (Math.hypot(p.x - x, p.z - z) < 45) return p.label;
    if (x > this.edge) {
      if (this.inTunnel(x, z)) return 'Terowongan Bukit Kabut';
      if (x < 1180) return 'Jalan Lintas Bukit Kabut';
      return 'Bandara Internasional Neopolis';
    }
    const c = this.size / 2;
    const d = Math.hypot(x - c, z - c);
    if (d < 170) return 'Pusat Kota Neopolis';
    const a = Math.atan2(z - c, x - c);
    const names = ['Distrik Pelabuhan', 'Kampung Lampion', 'Kawasan Gudang', 'Bukit Kaca', 'Pasar Malam', 'Kanal Ungu', 'Jalur Industri', 'Taman Bulan'];
    return names[Math.floor(U.mod(a + Math.PI / 8, Math.PI * 2) / (Math.PI / 4)) % 8];
  },

  // ------------ barikade balapan
  setBarriers(list) {
    this.clearBarriers();
    const tex = this._chevronTex();
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.6 });
    list.forEach((b) => {
      const w = b.x1 - b.x0, d = b.z1 - b.z0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), mat);
      m.position.set((b.x0 + b.x1) / 2, 0.7, (b.z0 + b.z1) / 2);
      m.castShadow = true;
      const uv = m.geometry.attributes.uv;
      const long = Math.max(w, d);
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * long / 3);
      this.barrierGroup.add(m);
      this.barrierMeshes.push(m);
      const n = Math.max(2, Math.floor(long / 6));
      for (let k = 0; k < n; k++) {
        const lm = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
        this.blinkMats.push(lm);
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), lm);
        const t = (k + 0.5) / n;
        l.position.set(w > d ? b.x0 + w * t : (b.x0 + b.x1) / 2, 1.55, w > d ? (b.z0 + b.z1) / 2 : b.z0 + d * t);
        this.barrierGroup.add(l);
        this.barrierMeshes.push(l);
      }
    });
    this.barriers = list;
  },
  clearBarriers() {
    this.barrierMeshes.forEach((m) => { this.barrierGroup.remove(m); m.geometry.dispose(); });
    this.barrierMeshes = [];
    this.blinkMats = [];
    this.barriers = [];
  },

  // ------------ penanda event (pilar cahaya)
  makeMarker(color, label) {
    const g = new THREE.Group();
    const col = new THREE.Color(color);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(4, 4, 60, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    beam.position.y = 30;
    g.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5.2, 6.2, 40),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
    g.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(5.2, 40),
      new THREE.MeshBasicMaterial({ map: Tex.radial('rgba(255,255,255,0.5)', 'rgba(255,255,255,0)'), color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05;
    g.add(disc);
    const c = Tex.canvas(512, 128);
    const x = c.getContext('2d');
    x.font = 'bold 54px Orbitron, Arial';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = color; x.shadowBlur = 18;
    x.fillStyle = '#fff';
    x.fillText(label, 256, 64);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.make(c), transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(16, 4, 1);
    sp.position.y = 9;
    g.add(sp);
    g.userData = { ring, beam, sprite: sp };
    return g;
  },

  // ------------ langit
  _skyCanvas(T) {
    const c = Tex.canvas(1024, 512);
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, T.sky[0]);
    gr.addColorStop(0.3, T.sky[1]);
    gr.addColorStop(0.44, T.sky[2]);
    gr.addColorStop(0.5, T.sky[3]);
    gr.addColorStop(0.56, T.sky[4]);
    gr.addColorStop(1, T.sky[4]);
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    // posisi matahari pada kanvas (equirect)
    const sd = new THREE.Vector3().fromArray(T.sunDir).normalize();
    const u = U.mod(Math.atan2(sd.z, -sd.x), Math.PI * 2) / (Math.PI * 2); // sesuai UV SphereGeometry
    const v = 0.5 - Math.asin(sd.y) / Math.PI;
    if (T.sun) {
      const sx = u * 1024, sy = v * 512;
      const halo = g.createRadialGradient(sx, sy, 0, sx, sy, 260);
      halo.addColorStop(0, 'rgba(255,230,180,0.85)');
      halo.addColorStop(0.15, 'rgba(255,200,140,0.35)');
      halo.addColorStop(1, 'rgba(255,180,120,0)');
      g.fillStyle = halo; g.fillRect(0, 0, 1024, 512);
    }
    if (T.stars) {
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`;
        const s = Math.random() < 0.05 ? 2 : 1;
        g.fillRect(Math.random() * 1024, Math.random() * 220, s, s);
      }
    }
    if (T.clouds) {
      const r = U.rng(5);
      for (let i = 0; i < 70; i++) {
        const cx = r() * 1024, cy = 130 + r() * 110;
        const w = 60 + r() * 160, h = 6 + r() * 14;
        const cg = g.createRadialGradient(cx, cy, 0, cx, cy, w);
        const lit = this.timeKey === 'dusk' ? `rgba(255,${170 + r() * 50},${150 + r() * 40},${0.35 * T.clouds})` : `rgba(255,255,255,${0.5 * T.clouds})`;
        cg.addColorStop(0, lit); cg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = cg;
        g.save(); g.translate(cx, cy); g.scale(1, h / w); g.beginPath(); g.arc(0, 0, w, 0, Math.PI * 2); g.fill(); g.restore();
      }
    }
    return c;
  },
  _sky(T) {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(2900, 32, 16), new THREE.MeshBasicMaterial({ map: Tex.make(this._skyCanvas(T)), side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -10;
    grp.add(m);
    const sd = new THREE.Vector3().fromArray(T.sunDir).normalize();
    if (T.moon) {
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.radial('rgba(235,235,255,1)', 'rgba(150,140,255,0)', 128), fog: false, transparent: true, depthWrite: false }));
      moon.scale.set(260, 260, 1);
      moon.position.copy(sd).multiplyScalar(2600);
      grp.add(moon);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.radial('rgba(255,255,255,1)', 'rgba(230,230,255,0.0)', 64), fog: false, transparent: true, depthWrite: false }));
      core.scale.set(80, 80, 1);
      core.position.copy(moon.position);
      grp.add(core);
    }
    if (T.sun) {
      const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: Tex.radial('rgba(255,255,245,1)', 'rgba(255,220,160,0)', 128), color: new THREE.Color(T.sun).multiplyScalar(3), fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sun.scale.set(200, 200, 1);
      sun.position.copy(sd).multiplyScalar(2600);
      grp.add(sun);
    }
    grp.children.forEach((c) => { c.renderOrder = -10; });
    return grp;
  },
  _envMap(renderer, T) {
    const c = this._skyCanvas(T);
    const g = c.getContext('2d');
    // tambahkan pantulan "kota": blok terang di cakrawala
    const cols = this.timeKey === 'day' ? ['#ffffff', '#d0dcea', '#9fb3c8'] : ['#ff2bd6', '#00e5ff', '#ffb000', '#ffffff', '#7a2cff'];
    for (let i = 0; i < 60; i++) {
      g.fillStyle = cols[i % cols.length];
      g.globalAlpha = 0.25 + Math.random() * 0.5;
      g.fillRect(Math.random() * 1024, 240 + Math.random() * 30, 6 + Math.random() * 30, 3 + Math.random() * 14);
    }
    g.globalAlpha = 1;
    g.fillStyle = this.timeKey === 'day' ? '#55524c' : '#0c0a12';
    g.fillRect(0, 290, 1024, 222);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.encoding = THREE.sRGBEncoding;
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromEquirectangular(t).texture;
    pm.dispose();
    return env;
  },

  // ------------ tekstur
  _asphaltTex() {
    const S = 512;
    const c = Tex.canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = '#2a2a30'; g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S);
    const d = img.data;
    const r = U.rng(3);
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * 34 + (r() < 0.03 ? 30 : 0);
      d[i] = U.clamp(66 + n, 0, 255); d[i + 1] = U.clamp(66 + n, 0, 255); d[i + 2] = U.clamp(72 + n, 0, 255);
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = 'rgba(0,0,0,0.06)';
      g.beginPath(); g.ellipse(r() * S, r() * S, 30 + r() * 60, 10 + r() * 30, r() * 3, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(10,10,12,0.22)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      let x = r() * S, y = r() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
    const t = Tex.make(c, true);
    return { map: t };
  },
  _roughTex() {
    const S = 256;
    const c = Tex.canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(190,190,190)'; g.fillRect(0, 0, S, S);
    const r = U.rng(9);
    for (let i = 0; i < 7; i++) {
      const x = r() * S, y = r() * S, rad = 14 + r() * 36;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgb(90,90,90)'); gr.addColorStop(1, 'rgba(190,190,190,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  },
  _grassTex(base) {
    const S = 256;
    const c = Tex.canvas(S, S);
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    const r = U.rng(4);
    const bc = new THREE.Color(base);
    for (let i = 0; i < 5000; i++) {
      const k = 0.7 + r() * 0.6;
      g.fillStyle = `rgb(${Math.round(bc.r * 255 * k)},${Math.round(bc.g * 255 * k)},${Math.round(bc.b * 255 * k)})`;
      g.fillRect(r() * S, r() * S, 2, 2);
    }
    return Tex.make(c, true);
  },
  _sidewalkTex() {
    const c = Tex.canvas(128, 128);
    const g = c.getContext('2d');
    g.fillStyle = '#8a8690'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#5e5a66'; g.lineWidth = 3;
    for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    for (let i = 0; i < 800; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    return Tex.make(c, true);
  },
  // fasad gedung: map (siang) + emissiveMap (jendela menyala malam)
  _facadeTex(variant, rnd) {
    const c = Tex.canvas(128, 256), e = Tex.canvas(128, 256);
    const g = c.getContext('2d'), ge = e.getContext('2d');
    const facade = ['#a7a198', '#304a64', '#a98a70', '#3d3e46'][variant];
    g.fillStyle = facade; g.fillRect(0, 0, 128, 256);
    ge.fillStyle = '#000'; ge.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.07})`; g.fillRect(rnd() * 128, rnd() * 256, 2, 2); }
    const lit = [['#ffd27a', '#ffe9b0', '#ffc35a'], ['#9fe6ff', '#d7f6ff', '#ffe0a8'], ['#ffcf8a', '#ffe4b8', '#ffb46a'], ['#fff1c9', '#ffd27a', '#b0f0ff']][variant];
    const layout = [{ cols: 4, rows: 8, mx: 5, my: 8 }, { cols: 4, rows: 8, mx: 1, my: 2 }, { cols: 5, rows: 10, mx: 6, my: 8 }, { cols: 1, rows: 8, mx: 3, my: 10 }][variant];
    const cw = 128 / layout.cols, rh = 256 / layout.rows;
    for (let r = 0; r < layout.rows; r++) {
      for (let k = 0; k < layout.cols; k++) {
        const x = k * cw + layout.mx, y = r * rh + layout.my;
        const w = cw - layout.mx * 2, h = rh - layout.my * 2;
        // kaca dengan gradasi pantulan
        const gr = g.createLinearGradient(x, y, x + w, y + h);
        gr.addColorStop(0, variant === 1 ? '#5f7f9e' : '#46586b');
        gr.addColorStop(1, variant === 1 ? '#1f3247' : '#1b2430');
        g.fillStyle = gr;
        g.fillRect(x, y, w, h);
        if (variant === 3) { // jendela pita: nyala per segmen
          for (let s = 0; s < 6; s++) {
            if (rnd() < 0.4) {
              const col = lit[Math.floor(rnd() * 3)];
              ge.fillStyle = col; ge.globalAlpha = 0.6 + rnd() * 0.4;
              ge.fillRect(x + (w / 6) * s + 1, y, w / 6 - 2, h);
              ge.globalAlpha = 1;
            }
          }
        } else if (rnd() < 0.4) {
          const col = lit[Math.floor(rnd() * 3)];
          ge.fillStyle = col; ge.globalAlpha = 0.55 + rnd() * 0.45;
          ge.fillRect(x, y, w, h);
          ge.globalAlpha = 1;
          g.fillStyle = col; g.globalAlpha = 0.25; g.fillRect(x, y, w, h); g.globalAlpha = 1;
        }
        if (variant !== 1) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y + h, w, 2); }
      }
    }
    if (variant === 1) { // rangka curtain wall
      g.fillStyle = 'rgba(200,220,235,0.35)';
      for (let k = 0; k <= layout.cols; k++) g.fillRect(k * cw - 1, 0, 2, 256);
      for (let r = 0; r <= layout.rows; r++) g.fillRect(0, r * rh - 1, 128, 2);
    }
    const map = Tex.make(c, true), emi = Tex.make(e, true);
    return { map, emi };
  },
  _signAtlas() {
    const c = Tex.canvas(512, 1024);
    const g = c.getContext('2d');
    const words = ['RAMEN 24 JAM', 'HOTEL BINTANG', 'KOPI MALAM', 'BENGKEL TURBO', 'KARAOKE', 'PIZZA NEON', 'APOTEK', 'NEON RUSH',
      'SATE AYAM', 'DISKO 88', 'BAKSO KILAT', 'CUCI MOBIL', 'GAME CENTER', 'MIE GORENG', 'BAR LAMPION', 'BIOSKOP'];
    const cols = ['#ff2bd6', '#00e5ff', '#ffb000', '#7cff00', '#ff3355', '#7a2cff', '#ffffff'];
    words.forEach((w, i) => {
      const y = i * 64;
      g.fillStyle = '#0a0612'; g.fillRect(0, y, 512, 64);
      const col = cols[i % cols.length];
      g.strokeStyle = col; g.lineWidth = 3; g.shadowColor = col; g.shadowBlur = 12;
      g.strokeRect(6, y + 6, 500, 52);
      g.font = 'bold 40px Arial Black, Arial';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = col;
      g.fillText(w, 256, y + 33);
      g.shadowBlur = 0;
      g.fillStyle = '#fff'; g.globalAlpha = 0.6;
      g.fillText(w, 256, y + 33);
      g.globalAlpha = 1;
    });
    return Tex.make(c);
  },
  _signQuad(batch, cx, cy, cz, w, h, nx, nz, idx) {
    const hw = w / 2, hh = h / 2;
    const rx = nz, rz = -nx;
    const a = [cx - rx * hw, cy - hh, cz - rz * hw];
    const b = [cx + rx * hw, cy - hh, cz + rz * hw];
    const c = [cx + rx * hw, cy + hh, cz + rz * hw];
    const d = [cx - rx * hw, cy + hh, cz - rz * hw];
    const v0 = 1 - (idx + 1) / 16, v1 = 1 - idx / 16;
    const uvs = [[0, v0], [1, v0], [1, v1], [0, v1]];
    const v = [a, b, c, d];
    [0, 1, 2, 0, 2, 3].forEach((i) => batch._push(v[i], [nx, 0, nz], uvs[i]));
  },
  _chevronTex() {
    return Tex.get('chev', () => {
      const c = Tex.canvas(128, 64);
      const g = c.getContext('2d');
      g.fillStyle = '#111'; g.fillRect(0, 0, 128, 64);
      g.fillStyle = '#ff8a00';
      for (let i = -2; i < 6; i++) {
        g.beginPath();
        g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 48, 64); g.lineTo(i * 32 + 32, 64);
        g.closePath(); g.fill();
      }
      g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 5); g.fillRect(0, 59, 128, 5);
      return Tex.make(c, true);
    });
  },
};

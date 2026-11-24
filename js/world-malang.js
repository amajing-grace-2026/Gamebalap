/* =========================================================================
   PETA KOTA MALANG — dari data OpenStreetMap (© OpenStreetMap contributors, ODbL)
   + ketinggian SRTM (Mapzen/AWS Terrain Tiles). Data dibuat oleh preview/malang-tools
   (build_map.py) → js/malang-data.js (window.MALANG).
   Sumbu: x = timur, z = selatan (utara = -z), y = meter di atas Jl. Langsep (447 m dpl).
   Modul ini aktif hanya saat pengaturan "Peta" = Kota Malang; ia menimpa fungsi World,
   Traffic, Airport, Landmarks & TrafficLights milik kota Neopolis.
   ========================================================================= */
const MalangWorld = {
  active: false,
  CELL: 32,

  install() {
    const D = window.MALANG;
    if (!D) return false;
    this.D = D;
    this.active = true;
    this._prepTerrain();
    this._prepRoads();
    this._prepColliders();
    this._prepGarage();
    const self = this;

    // ---- World
    const baseUpdate = World.update.bind(World);
    Object.assign(World, {
      isMalang: true,
      W: 16,
      build(scene, renderer, quality, time) { self.build(scene, renderer, quality, time); },
      heightAt: (x, z) => self.surface(x, z).y,
      probe: (x, z, h, len, wid) => self.probe(x, z, h, len, wid),
      collide: (o) => self.collide(o),
      roadSnap: (x, z, h) => self.roadSnap(x, z, h),
      districtName: (x, z) => self.districtName(x, z),
      inTunnel: () => false,
      garage: () => self.garageSpot,
      followSun(x, z) {
        const s = this.sun, y = self.surface(x, z).y;
        s.position.set(x + this.sunDir.x * 250, y + this.sunDir.y * 250, z + this.sunDir.z * 250);
        s.target.position.set(x, y, z);
      },
      update(dt, t, cam) {
        baseUpdate(dt, t, cam);
        if (cam && self.mount) self.mount.position.set(cam.position.x, 0, cam.position.z);
      },
    });

    // ---- modul khusus Neopolis dimatikan
    Object.assign(Airport, { build() {}, update() {}, groundObstacles: () => [], nearestDist: () => 1e9, clearRunway() {} });
    Object.assign(TrafficLights, { build() {}, update() {}, hasLight: () => false });
    Object.assign(Landmarks, { build() {}, update() {}, trainDist: () => 1e9, train: null });
    Landmarks.pois = D.landmarks.map((l, i) => ({
      id: 'mlg' + i, x: l.x, z: l.z, label: l.name.replace(' (masuk gang)', ''),
      color: l.approx ? '#ffb35c' : '#4fcf92', icon: '★', above: i % 2 === 0,
    }));

    // ---- lalu lintas di sepanjang jalan
    Object.assign(Traffic, MalangTraffic);

    // ---- event balap dari rute usulan
    DATA.EVENTS = this._events();
    return true;
  },

  // ------------------------------------------------------------------ medan
  _prepTerrain() {
    const T = this.D.terrain;
    this.T = T;
    this.bounds = { x0: T.x0, z0: T.z0, x1: T.x0 + (T.nx - 1) * T.step, z1: T.z0 + (T.nz - 1) * T.step };
  },
  // interpolasi sama persis dengan segitiga mesh medan (diagonal b–c)
  terrainH(x, z) {
    const T = this.T, H = T.h;
    const fi = (x - T.x0) / T.step, fj = (z - T.z0) / T.step;
    const i = Math.max(0, Math.min(T.nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(T.nz - 2, Math.floor(fj)));
    const u = U.clamp(fi - i, 0, 1), v = U.clamp(fj - j, 0, 1);
    const a = H[j * T.nx + i], b = H[j * T.nx + i + 1], c = H[(j + 1) * T.nx + i], d = H[(j + 1) * T.nx + i + 1];
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  },

  // ------------------------------------------------------------------ jalan → indeks ruang
  _prepRoads() {
    const D = this.D, P = D.pts, C = this.CELL;
    this.grid = new Map();
    this.segs = [];
    const add = (ax, ay, az, bx, by, bz, hw, road, lift) => {
      const s = { ax, ay, az, bx, by, bz, hw, road, lift };
      this.segs.push(s);
      const r = hw + 1;
      const i0 = Math.floor((Math.min(ax, bx) - r) / C), i1 = Math.floor((Math.max(ax, bx) + r) / C);
      const j0 = Math.floor((Math.min(az, bz) - r) / C), j1 = Math.floor((Math.max(az, bz) + r) / C);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = i * 100003 + j;
        let L = this.grid.get(k);
        if (!L) { L = []; this.grid.set(k, L); }
        L.push(s);
      }
    };
    D.roads.forEach((r) => {
      const lift = r.hw.startsWith('primary') ? 0.06 : 0.04;
      for (let k = 0; k < r.chain.length - 1; k++) {
        const a = P[r.chain[k]], b = P[r.chain[k + 1]];
        add(a[0], a[1], a[2], b[0], b[1], b[2], r.w / 2, r, lift);
      }
    });
    D.croads.forEach((r) => {
      const p = r.p;
      for (let k = 0; k + 5 < p.length; k += 3) add(p[k], p[k + 1], p[k + 2], p[k + 3], p[k + 4], p[k + 5], r.w / 2, null, 0);
    });
  },
  _cell(x, z) { const C = this.CELL; return this.grid.get(Math.floor(x / C) * 100003 + Math.floor(z / C)); },

  // permukaan: { y, seg } — seg = ruas jalan di bawah titik (null = rumput/tanah)
  surface(x, z) {
    const L = this._cell(x, z);
    let best = null, by = -1e9;
    if (L) {
      for (let i = 0; i < L.length; i++) {
        const s = L[i];
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const l2 = dx * dx + dz * dz || 1;
        const t = U.clamp(((x - s.ax) * dx + (z - s.az) * dz) / l2, 0, 1);
        const px = s.ax + dx * t - x, pz = s.az + dz * t - z;
        const lim = s.hw + 0.4;
        if (px * px + pz * pz > lim * lim) continue;
        const y = s.ay + (s.by - s.ay) * t + s.lift;
        if (y > by) { by = y; best = s; }
      }
    }
    if (best) return { y: by, seg: best };
    return { y: this.terrainH(x, z) + 0.02, seg: null };
  },
  // kemiringan bodi & tanjakan untuk mobil
  probe(x, z, h, len, wid) {
    const fx = Math.sin(h), fz = Math.cos(h);
    const lx = Math.cos(h), lz = -Math.sin(h); // kiri
    const a = len * 0.36, b = wid * 0.42;
    const c = this.surface(x, z);
    const yf = this.surface(x + fx * a, z + fz * a).y, yb = this.surface(x - fx * a, z - fz * a).y;
    const yl = this.surface(x + lx * b, z + lz * b).y, yr = this.surface(x - lx * b, z - lz * b).y;
    const grade = (yf - yb) / (2 * a);
    return {
      y: Math.max(c.y, (yf + yb) / 2), grade, pitch: Math.atan(grade), roll: Math.atan((yl - yr) / (2 * b)),
      onRoad: !!c.seg, seg: c.seg,
    };
  },

  // ------------------------------------------------------------------ tabrakan gedung
  _prepColliders() {
    const D = this.D, C = this.CELL;
    this.bgrid = new Map();
    this.keep = new Uint8Array(D.buildings.length);
    const put = (o) => {
      const r = Math.hypot(o.hw, o.hd) + 1;
      for (let i = Math.floor((o.x - r) / C); i <= Math.floor((o.x + r) / C); i++) {
        for (let j = Math.floor((o.z - r) / C); j <= Math.floor((o.z + r) / C); j++) {
          const k = i * 100003 + j;
          let L = this.bgrid.get(k);
          if (!L) { L = []; this.bgrid.set(k, L); }
          L.push(o);
        }
      }
    };
    // gedung yang menutupi jalan dibuang (sisa tumpang-tindih data)
    let removed = 0;
    D.buildings.forEach((b, i) => {
      const o = { x: b[0], z: b[2], hw: b[3] / 2, hd: b[4] / 2, c: Math.cos(b[6]), s: Math.sin(b[6]) };
      if (this._boxOnRoad(o)) { removed++; return; }
      this.keep[i] = 1;
      put(o);
    });
    this.removedBuildings = removed;
    D.landmarks.forEach((l) => put({ x: l.x, z: l.z, hw: l.w / 2, hd: l.d / 2, c: Math.cos(l.rot), s: Math.sin(l.rot) }));
  },
  _boxOnRoad(o) {
    const C = this.CELL, r = Math.hypot(o.hw, o.hd) + 8;
    for (let i = Math.floor((o.x - r) / C); i <= Math.floor((o.x + r) / C); i++) {
      for (let j = Math.floor((o.z - r) / C); j <= Math.floor((o.z + r) / C); j++) {
        const L = this.grid.get(i * 100003 + j);
        if (!L) continue;
        for (const s of L) {
          // titik-titik di sepanjang ruas → koordinat lokal kotak
          const n = Math.max(1, Math.ceil(Math.hypot(s.bx - s.ax, s.bz - s.az) / 2));
          for (let k = 0; k <= n; k++) {
            const t = k / n;
            const dx = s.ax + (s.bx - s.ax) * t - o.x, dz = s.az + (s.bz - s.az) * t - o.z;
            const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
            const ex = Math.max(0, Math.abs(lx) - o.hw), ez = Math.max(0, Math.abs(lz) - o.hd);
            if (ex * ex + ez * ez < s.hw * s.hw * 0.7) return true;
          }
        }
      }
    }
    return false;
  },
  collide(o) {
    let hit = 0;
    const L = this.bgrid.get(Math.floor(o.x / this.CELL) * 100003 + Math.floor(o.z / this.CELL));
    if (L) {
      for (let i = 0; i < L.length; i++) {
        const b = L[i];
        const dx = o.x - b.x, dz = o.z - b.z;
        const rr = o.radius + b.hw + b.hd;
        if (dx * dx + dz * dz > rr * rr) continue;
        // ke koordinat lokal kotak, tabrak sebagai AABB, lalu kembali ke dunia
        const lo = {
          x: dx * b.c - dz * b.s, z: dx * b.s + dz * b.c,
          vx: o.vx * b.c - o.vz * b.s, vz: o.vx * b.s + o.vz * b.c, radius: o.radius,
        };
        const hv = World._circleAABB(lo, -b.hw, -b.hd, b.hw, b.hd);
        if (hv > 0 || lo.x !== dx * b.c - dz * b.s || lo.z !== dx * b.s + dz * b.c) {
          o.x = b.x + lo.x * b.c + lo.z * b.s; o.z = b.z - lo.x * b.s + lo.z * b.c;
          o.vx = lo.vx * b.c + lo.vz * b.s; o.vz = -lo.vx * b.s + lo.vz * b.c;
          if (lo.nx !== undefined) { o.nx = lo.nx * b.c + lo.nz * b.s; o.nz = -lo.nx * b.s + lo.nz * b.c; }
          hit = Math.max(hit, hv);
        }
      }
    }
    for (let i = 0; i < World.walls.length; i++) {
      const w = World.walls[i];
      hit = Math.max(hit, World._circleAABB(o, w.x0, w.z0, w.x1, w.z1));
    }
    return hit;
  },

  // ------------------------------------------------------------------ garasi (dekat Cyber Mall, Jl. Langsep)
  _prepGarage() {
    const D = this.D, P = D.pts;
    const lm = D.landmarks.find((l) => /Cyber/i.test(l.name)) || D.landmarks[0];
    let best = null, bd = 1e9;
    D.roads.forEach((r) => {
      if (r.rb || r.stub) return;
      r.chain.forEach((idx, k) => {
        const p = P[idx], d = Math.hypot(p[0] - lm.x, p[2] - lm.z);
        if (d < bd && k > 4 && k < r.chain.length - 6) { bd = d; best = { r, k }; }
      });
    });
    const ch = best.r.chain, p = P[ch[best.k]];
    let q = P[ch[best.k + 4]];
    let dir = [q[0] - p[0], q[2] - p[2]];
    if (dir[1] > 0) { q = P[ch[best.k - 4]]; dir = [q[0] - p[0], q[2] - p[2]]; } // menghadap utara (ke Galunggung)
    const l = Math.hypot(dir[0], dir[1]) || 1;
    dir = [dir[0] / l, dir[1] / l];
    this.garageSpot = { x: p[0], z: p[2], sx: p[0] + dir[0] * 18, sz: p[2] + dir[1] * 18, sh: Math.atan2(dir[0], dir[1]) };
  },

  roadSnap(x, z, heading) {
    let best = null, bd = 1e9;
    for (let rad = 1; rad <= 8 && !best; rad++) {
      const C = this.CELL, ci = Math.floor(x / C), cj = Math.floor(z / C);
      for (let i = ci - rad; i <= ci + rad; i++) for (let j = cj - rad; j <= cj + rad; j++) {
        const L = this.grid.get(i * 100003 + j);
        if (!L) continue;
        for (const s of L) {
          const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1;
          const t = U.clamp(((x - s.ax) * dx + (z - s.az) * dz) / l2, 0, 1);
          const px = s.ax + dx * t, pz = s.az + dz * t;
          const d = Math.hypot(px - x, pz - z) - (s.road ? 3 : 0);
          if (d < bd) { bd = d; best = { x: px, z: pz, dx, dz }; }
        }
      }
    }
    if (!best) { const g = this.garageSpot; return { x: g.sx, z: g.sz, h: g.sh }; }
    let h = Math.atan2(best.dx, best.dz);
    if (Math.cos(U.angDiff(heading, h)) < 0) h += Math.PI;
    return { x: best.x, z: best.z, h };
  },

  districtName(x, z) {
    for (const p of Landmarks.pois) if (Math.hypot(p.x - x, p.z - z) < 40) return p.label;
    const s = this.surface(x, z);
    const elev = Math.round(s.y + this.D.origin.base) + ' m dpl';
    let name = s.seg && s.seg.road && s.seg.road.name;
    if (!name) {
      let bd = 60;
      const L = this._cell(x, z) || [];
      L.forEach((g) => { if (g.road && g.road.name) { const d = Math.hypot((g.ax + g.bx) / 2 - x, (g.az + g.bz) / 2 - z); if (d < bd) { bd = d; name = g.road.name; } } });
    }
    return (name || 'Kota Malang') + ' · ' + elev;
  },

  // ------------------------------------------------------------------ event balap
  _events() {
    const R = this.D.routes;
    const find = (re) => R.find((r) => re.test(r.name));
    const pts = (r) => {
      let p = r.path.map((q) => [q[0], q[2]]);
      if (r.loop && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 3) p = p.slice(0, -1);
      return p;
    };
    const mk = (id, type, re, tier, req, extra) => {
      const r = find(re);
      if (!r) return null;
      return Object.assign({ id, type, name: r.name, tier, req, opp: 3, loop: !!r.loop, path: pts(r), desc: r.desc, len: r.len, up: r.up, maxGrade: r.maxGrade }, extra || {});
    };
    return [
      mk('mlg-s1', 'sprint', /Soekarno/, 1, 0),
      mk('mlg-g1', 'drag', /Drag/, 1, 0),
      mk('mlg-c1', 'circuit', /Kampus/, 2, 400, { laps: 1 }),
      mk('mlg-d1', 'drift', /Soekarno/, 2, 400, { id: 'mlg-d1', name: 'Drift Soekarno-Hatta', opp: 0, targets: [3500, 2300, 1300] }),
      mk('mlg-c2', 'circuit', /Ijen/, 3, 1200, { laps: 1 }),
      mk('mlg-s2', 'sprint', /Tlogomas/, 4, 2500, { name: 'GRAND FINAL: Tanjakan Tlogomas' }),
    ].filter(Boolean);
  },

  // ------------------------------------------------------------------ bangun adegan
  build(scene, renderer, quality, time) {
    const T = World._atmosphere(scene, renderer, quality, time);
    const D = this.D, P = D.pts;
    const night = World.timeKey === 'night', dusk = World.timeKey === 'dusk';
    const shadows = quality !== 'low';
    const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    const dark = night ? 0.32 : dusk ? 0.78 : 1;

    // ---- medan
    {
      const TT = this.T, g = new THREE.BufferGeometry(), pos = new Float32Array(TT.nx * TT.nz * 3), col = new Float32Array(TT.nx * TT.nz * 3), idx = [];
      const c1 = lin(0x3f6a2c), c2 = lin(0x5d7a36), c3 = lin(0x7d6d4c), c = new THREE.Color();
      for (let j = 0; j < TT.nz; j++) for (let i = 0; i < TT.nx; i++) {
        const k = j * TT.nx + i, h = TT.h[k];
        pos[k * 3] = TT.x0 + i * TT.step; pos[k * 3 + 1] = h; pos[k * 3 + 2] = TT.z0 + j * TT.step;
        const n = (Math.sin(i * 1.7 + j * 0.9) + Math.sin(i * 0.31 - j * 0.53) * 1.4) * 0.25 + 0.5;
        c.copy(c1).lerp(c2, n).lerp(c3, U.clamp((h - 70) / 60, 0, 1) * 0.5).multiplyScalar(dark);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      }
      for (let j = 0; j < TT.nz - 1; j++) for (let i = 0; i < TT.nx - 1; i++) { const a = j * TT.nx + i, b = a + 1, cc = a + TT.nx, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
      m.receiveShadow = shadows;
      scene.add(m);
    }

    // ---- aspal (tekstur dengan marka tepi & tengah)
    const roadTex = (() => {
      const c = Tex.canvas(128, 512), g = c.getContext('2d');
      g.fillStyle = '#3b3d42'; g.fillRect(0, 0, 128, 512);
      for (let k = 0; k < 2500; k++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; g.fillRect(Math.random() * 128, Math.random() * 512, 2, 2); }
      g.fillStyle = '#e8e8e0'; g.fillRect(5, 0, 4, 512); g.fillRect(119, 0, 4, 512);
      g.fillStyle = '#f2f2ea'; g.fillRect(62, 0, 4, 230);
      const t = Tex.make(c, true); t.anisotropy = 8; return t;
    })();
    const asph = new THREE.MeshStandardMaterial({
      map: roadTex, color: night ? 0x9a9aa6 : 0xffffff, roughness: T.wet ? 0.55 : 0.88, metalness: T.wet ? 0.1 : 0.02,
      envMap: World.envMap, envMapIntensity: T.wet ? 0.55 : 0.2, side: THREE.DoubleSide,
    });
    World.asphaltMat = asph;
    const rp = [], ru = [], ri = [], sp = [], si = [];
    D.roads.forEach((r) => {
      const ch = r.chain, n = ch.length, hw = r.w / 2, lift = r.hw.startsWith('primary') ? 0.06 : 0.04;
      let v = 0; const base = rp.length / 3, sbase = sp.length / 3;
      for (let k = 0; k < n; k++) {
        const p = P[ch[k]], a = P[ch[Math.max(0, k - 1)]], b = P[ch[Math.min(n - 1, k + 1)]];
        let tx = b[0] - a[0], tz = b[2] - a[2]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
        const nx = -tz, nz = tx;
        if (k > 0) v += Math.hypot(p[0] - P[ch[k - 1]][0], p[2] - P[ch[k - 1]][2]);
        const y = p[1] + lift;
        rp.push(p[0] + nx * hw, y, p[2] + nz * hw, p[0] - nx * hw, y, p[2] - nz * hw);
        ru.push(0, v / 9, 1, v / 9);
        sp.push(p[0] + nx * (hw + 0.4), y - 0.02, p[2] + nz * (hw + 0.4), p[0] + nx * (hw + 0.4), y - 1.2, p[2] + nz * (hw + 0.4),
          p[0] - nx * (hw + 0.4), y - 0.02, p[2] - nz * (hw + 0.4), p[0] - nx * (hw + 0.4), y - 1.2, p[2] - nz * (hw + 0.4));
        if (k < n - 1) {
          const a0 = base + k * 2; ri.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3);
          const s0 = sbase + k * 4; si.push(s0, s0 + 1, s0 + 4, s0 + 4, s0 + 1, s0 + 5, s0 + 2, s0 + 6, s0 + 3, s0 + 3, s0 + 6, s0 + 7);
        }
      }
    });
    const mesh = (pos, idx, mat, uv, opts = {}) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = shadows && !opts.noShadow;
      m.matrixAutoUpdate = false; m.updateMatrix();
      scene.add(m);
      return m;
    };
    mesh(rp, ri, asph, ru);
    mesh(sp, si, new THREE.MeshStandardMaterial({ color: lin(0xb4b2a8).multiplyScalar(dark), roughness: 0.9, side: THREE.DoubleSide }));
    // tambalan aspal di persimpangan
    {
      const cnt = new Map(), wOf = new Map();
      D.roads.forEach((r) => r.chain.forEach((i) => { cnt.set(i, (cnt.get(i) || 0) + 1); wOf.set(i, Math.max(wOf.get(i) || 0, r.w)); }));
      const jn = [...cnt.entries()].filter(([, c]) => c >= 2).map(([i]) => i);
      const disc = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: night ? 0x2c2d33 : 0x3b3d42, roughness: 0.9, envMap: World.envMap, envMapIntensity: T.wet ? 0.5 : 0.15 }), jn.length);
      const m = new THREE.Matrix4();
      jn.forEach((i, k) => { const p = P[i], r = wOf.get(i) / 2 + 0.6; m.makeScale(r, 1, r).setPosition(p[0], p[1] + 0.085, p[2]); disc.setMatrixAt(k, m); });
      disc.receiveShadow = shadows;
      scene.add(disc);
    }
    // jalan kampung / jalan lain
    {
      const pos = [], uv = [], idx = [];
      D.croads.forEach((r) => {
        const p = r.p, n = p.length / 3, hw = r.w / 2, base = pos.length / 3; let v = 0;
        for (let k = 0; k < n; k++) {
          const a = Math.max(0, k - 1) * 3, b = Math.min(n - 1, k + 1) * 3, c = k * 3;
          let tx = p[b] - p[a], tz = p[b + 2] - p[a + 2]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
          if (k > 0) v += Math.hypot(p[c] - p[c - 3], p[c + 2] - p[c - 1]);
          pos.push(p[c] - tz * hw, p[c + 1], p[c + 2] + tx * hw, p[c] + tz * hw, p[c + 1], p[c + 2] - tx * hw); uv.push(0, v / 9, 1, v / 9);
          if (k < n - 1) { const q = base + k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
        }
      });
      const t = roadTex.clone(); t.needsUpdate = true;
      mesh(pos, idx, new THREE.MeshStandardMaterial({ color: night ? 0x6a6a72 : 0x8a8a8a, map: t, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }), uv);
    }

    // ---- rumah & gedung (instanced, jendela menyala di malam/senja)
    {
      const B = D.buildings, keep = this.keep;
      const n = keep.reduce((a, b) => a + b, 0);
      const win = (() => {
        const c = Tex.canvas(64, 64), e = Tex.canvas(64, 64), g = c.getContext('2d'), ge = e.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
        ge.fillStyle = '#000'; ge.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
          const x = 6 + i * 20, y = 8 + j * 30;
          g.fillStyle = '#5d6670'; g.fillRect(x, y, 12, 16);
          ge.fillStyle = Math.random() < 0.55 ? '#ffcf86' : '#1a1408'; ge.fillRect(x, y, 12, 16);
        }
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 60, 64, 4);
        return { map: Tex.make(c), emi: Tex.make(e) };
      })();
      const side = new THREE.MeshStandardMaterial({ map: win.map, emissiveMap: win.emi, emissive: 0xffffff, emissiveIntensity: night ? 0.6 : dusk ? 0.35 : 0, roughness: 0.85, color: new THREE.Color(dark, dark, dark) });
      const roof = new THREE.MeshStandardMaterial({ color: lin(0x9a5a3c).multiplyScalar(dark), roughness: 0.9 });
      const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(geo, [side, side, roof, side, side, side], n);
      const HOUSE = [0xe9e2d0, 0xd8c9a8, 0xc9d3d6, 0xf0d9c4, 0xbfc7b3, 0xe2d5e0].map(lin);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
      let k = 0;
      B.forEach((b, i) => {
        if (!keep[i]) return;
        q.setFromAxisAngle(Y, b[6]); s.set(b[3], b[5] + 1, b[4]); p.set(b[0], b[1] - 1, b[2]);
        m.compose(p, q, s); im.setMatrixAt(k, m); im.setColorAt(k, HOUSE[b[7]] || HOUSE[0]); k++;
      });
      im.castShadow = shadows; im.receiveShadow = shadows;
      scene.add(im);
      World.buildingMats = [side];
    }

    // ---- pohon
    {
      const Tr = D.trees, palms = Tr.filter((t) => t[3]), rest = Tr.filter((t) => !t[3]);
      const m = new THREE.Matrix4();
      const mk = (list, trunkH, crownGeo, crownCol, crownY) => {
        if (!list.length) return;
        const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, trunkH, 6).translate(0, trunkH / 2, 0), new THREE.MeshStandardMaterial({ color: lin(0x6b5138).multiplyScalar(dark), roughness: 1 }), list.length);
        const cr = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: lin(crownCol).multiplyScalar(dark), roughness: 0.95, flatShading: true }), list.length);
        list.forEach((t, k) => {
          const sc = 0.8 + ((k * 37) % 10) / 20;
          m.makeScale(sc, sc, sc).setPosition(t[0], t[1], t[2]); tr.setMatrixAt(k, m);
          m.makeScale(sc, sc, sc).setPosition(t[0], t[1] + crownY * sc, t[2]); cr.setMatrixAt(k, m);
        });
        tr.castShadow = cr.castShadow = shadows;
        scene.add(tr, cr);
      };
      mk(rest, 3, new THREE.IcosahedronGeometry(2.6, 0), 0x4f7a3a, 4.2);
      mk(palms, 9, new THREE.ConeGeometry(3, 1.6, 7).rotateX(Math.PI), 0x5e8f3f, 9.4);
    }

    // ---- lampu jalan di jalan utama (+ genangan cahaya saat senja/malam)
    this._streetLights(scene, T, night, dusk);

    // ---- landmark (sementara kotak + papan nama; detail menyusul dari foto)
    this._landmarks(scene, T, night, dark, shadows);

    // ---- batas peta
    const Bn = this.bounds;
    World.addWall(Bn.x0 - 5, Bn.z0 - 5, Bn.x1 + 5, Bn.z0 + 40);
    World.addWall(Bn.x0 - 5, Bn.z1 - 40, Bn.x1 + 5, Bn.z1 + 5);
    World.addWall(Bn.x0 - 5, Bn.z0 - 5, Bn.x0 + 40, Bn.z1 + 5);
    World.addWall(Bn.x1 - 40, Bn.z0 - 5, Bn.x1 + 5, Bn.z1 + 5);

    World.metalMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 0.5, metalness: 0.7, envMap: World.envMap, envMapIntensity: 0.5 });
    World.natureMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    World.barrierGroup = new THREE.Group();
    scene.add(World.barrierGroup);
    // pegunungan di cakrawala (Arjuno, Kawi, Semeru…) ikut kamera
    this.mount = World._mountains(scene, T, 0, 0, 2500);
    this._mapCanvas();
  },

  _streetLights(scene, T, night, dusk) {
    const D = this.D, P = D.pts, spots = [];
    D.roads.forEach((r) => {
      if (r.stub || r.w < 6) return;
      const ch = r.chain;
      let acc = 17, side = 1;
      for (let k = 1; k < ch.length - 1; k++) {
        const a = P[ch[k - 1]], p = P[ch[k]];
        acc += Math.hypot(p[0] - a[0], p[2] - a[2]);
        if (acc < 34) continue;
        acc = 0; side = -side;
        const b = P[ch[k + 1]];
        let tx = b[0] - a[0], tz = b[2] - a[2]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
        spots.push({ k, ch, p, tx, tz, nx: -tz * side, nz: tx * side, hw: r.w / 2 });
      }
    });
    const n = spots.length;
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 8, 6).translate(0, 4, 0), World.metalMat || new THREE.MeshStandardMaterial({ color: 0x55565c, roughness: 0.6, metalness: 0.5 }), n);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.16, 1.6), new THREE.MeshBasicMaterial({ color: night || dusk ? 0xfff0c8 : 0xcfd3d8 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const pools = [], pidx = [], puv = [];
    spots.forEach((s, i) => {
      const x = s.p[0] + s.nx * (s.hw + 0.9), z = s.p[2] + s.nz * (s.hw + 0.9), y = s.p[1] - 0.3;
      m.makeTranslation(x, y, z); pole.setMatrixAt(i, m);
      q.setFromAxisAngle(Y, Math.atan2(s.nx, s.nz));
      m.compose(v.set(x - s.nx * 0.8, y + 8, z - s.nz * 0.8), q, one); head.setMatrixAt(i, m);
      // genangan cahaya: segi-empat tepat di atas pita jalan (ikut tanjakan)
      if (s.k >= 2 && s.k < s.ch.length - 2) {
        const a = P[s.ch[s.k - 2]], b = P[s.ch[s.k + 2]], cOff = s.hw * 0.35, w = s.hw * 0.6;
        const base = pools.length / 3;
        [[a, -1], [a, 1], [b, -1], [b, 1]].forEach(([pt, sd]) => {
          const off = cOff + sd * w;
          pools.push(pt[0] + s.nx * off, pt[1] + 0.12, pt[2] + s.nz * off);
        });
        puv.push(0, 0, 1, 0, 0, 1, 1, 1);
        pidx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    });
    pole.castShadow = true;
    scene.add(pole, head);
    if (T.pools > 0 && pools.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pools, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(puv, 2));
      g.setIndex(pidx);
      const mat = new THREE.MeshBasicMaterial({
        map: Tex.radial('rgba(255,210,150,0.6)', 'rgba(0,0,0,0)'), transparent: true, color: new THREE.Color(T.pools, T.pools, T.pools),
        blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
      });
      const pm = new THREE.Mesh(g, mat);
      pm.renderOrder = 1;
      scene.add(pm);
    }
  },

  _landmarks(scene, T, night, dark, shadows) {
    const D = this.D;
    const sign = (text, col) => {
      const c = Tex.canvas(512, 96), g = c.getContext('2d');
      g.fillStyle = '#111318'; g.fillRect(0, 0, 512, 96);
      g.fillStyle = col; g.fillRect(0, 0, 512, 8); g.fillRect(0, 88, 512, 8);
      g.fillStyle = '#ffffff'; g.font = 'bold 44px Rajdhani, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, 256, 50, 490);
      return Tex.make(c);
    };
    D.landmarks.forEach((l) => {
      const grp = new THREE.Group();
      const col = l.kind === 'mall' ? 0x8a5cc8 : 0x2f6fd0;
      const body = new THREE.Mesh(new THREE.BoxGeometry(l.w, l.h + 2, l.d).translate(0, (l.h + 2) / 2 - 2, 0),
        new THREE.MeshStandardMaterial({ color: new THREE.Color(col).convertSRGBToLinear().multiplyScalar(dark), roughness: 0.6, metalness: 0.1, envMap: World.envMap, envMapIntensity: 0.3 }));
      body.castShadow = body.receiveShadow = shadows;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(l.w * 0.8, 3), new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0xffe2a8, emissiveIntensity: night ? 0.7 : 0.12, roughness: 0.15, metalness: 0.6, envMap: World.envMap }));
      glass.position.set(0, 1.7, l.d / 2 + 0.05);
      const tex = sign(l.name.replace(' (masuk gang)', ''), l.approx ? '#ffb35c' : '#4fcf92');
      const board = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(l.w * 0.95, 18), Math.min(l.w * 0.95, 18) * 96 / 512),
        new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(night ? 1.6 : 1, night ? 1.6 : 1, night ? 1.6 : 1) }));
      board.position.set(0, Math.min(l.h - 1.5, 6.5), l.d / 2 + 0.08);
      grp.add(body, glass, board);
      // tiang papan nama tinggi di tepi jalan (terlihat dari jauh)
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 11, 0.5).translate(0, 5.5, 0), World.metalMat || new THREE.MeshStandardMaterial({ color: 0x444444 }));
      const tb = new THREE.Mesh(new THREE.PlaneGeometry(7, 7 * 96 / 512), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, color: new THREE.Color(night ? 1.6 : 1, night ? 1.6 : 1, night ? 1.6 : 1) }));
      tb.position.set(0, 10.4, 0);
      const pg = new THREE.Group(); pg.add(pole, tb);
      pg.position.set(l.w / 2 + 1.5, 0, l.d / 2 + 3);
      grp.add(pg);
      grp.position.set(l.x, l.y, l.z); grp.rotation.y = l.rot;
      scene.add(grp);
    });
  },

  // gambar peta (dipakai minimap & peta besar), 0,5 px per meter
  _mapCanvas() {
    const D = this.D, P = D.pts, B = this.bounds, res = 0.5;
    const c = Tex.canvas(Math.ceil((B.x1 - B.x0) * res), Math.ceil((B.z1 - B.z0) * res));
    const g = c.getContext('2d');
    g.fillStyle = '#0d1410'; g.fillRect(0, 0, c.width, c.height);
    g.setTransform(res, 0, 0, res, -B.x0 * res, -B.z0 * res);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#2f2b45';
    D.croads.forEach((r) => {
      g.lineWidth = Math.max(5, r.w * 1.4);
      g.beginPath();
      for (let k = 0; k < r.p.length; k += 3) { if (k) g.lineTo(r.p[k], r.p[k + 2]); else g.moveTo(r.p[k], r.p[k + 2]); }
      g.stroke();
    });
    g.strokeStyle = '#5d5683';
    D.roads.forEach((r) => {
      g.lineWidth = Math.max(10, r.w * 1.6);
      g.beginPath();
      r.chain.forEach((i, k) => { const p = P[i]; if (k) g.lineTo(p[0], p[2]); else g.moveTo(p[0], p[2]); });
      g.stroke();
    });
    this.map = c;
  },
  // kotak batas jalan utama (untuk peta besar)
  routeBounds() {
    if (!this._rb) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      this.D.pts.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); });
      this._rb = { x0: x0 - 150, x1: x1 + 150, z0: z0 - 150, z1: z1 + 150 };
    }
    return this._rb;
  },
  drawMap(c) {
    const B = this.bounds;
    c.drawImage(this.map, B.x0, B.z0, B.x1 - B.x0, B.z1 - B.z0);
  },
};

/* ------------------------------------------------------------------
   LALU LINTAS MALANG: mobil mengikuti ruas jalan utama (lajur kiri),
   berganti ruas di persimpangan secara acak; jalan satu arah dipatuhi.
   ------------------------------------------------------------------ */
const MalangTraffic = {
  cars: [],
  _prep() {
    if (this.lanes) return;
    const D = MalangWorld.D, P = D.pts;
    this.lanes = D.roads.filter((r) => r.chain.length > 3).map((r) => {
      const pts = r.chain.map((i) => P[i]), cum = [0];
      for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][2] - pts[k - 1][2]));
      return { r, pts, cum, len: cum[cum.length - 1], a: r.chain[0], b: r.chain[r.chain.length - 1], off: r.oneway ? r.w * 0.22 : Math.min(3.2, r.w * 0.27) };
    });
    this.adj = new Map();
    const put = (node, ln, dir) => { let L = this.adj.get(node); if (!L) { L = []; this.adj.set(node, L); } L.push({ ln, dir }); };
    this.lanes.forEach((ln) => {
      put(ln.a, ln, 1);
      if (!ln.r.oneway) put(ln.b, ln, -1);
    });
  },
  _pose(c) {
    const ln = c.ln, s = c.dir > 0 ? U.clamp(c.s, 0, ln.len) : U.clamp(ln.len - c.s, 0, ln.len);
    let lo = 0, hi = ln.cum.length - 2;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ln.cum[mid] <= s) lo = mid; else hi = mid - 1; }
    const a = ln.pts[lo], b = ln.pts[lo + 1], l = ln.cum[lo + 1] - ln.cum[lo] || 1, t = (s - ln.cum[lo]) / l;
    let tx = (b[0] - a[0]) / l * c.dir, tz = (b[2] - a[2]) / l * c.dir;
    const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
    // lajur kiri: kiri dari arah (tx,tz) = (tz, -tx)
    return { x: x + tz * ln.off, z: z - tx * ln.off, tx, tz };
  },
  _next(c) {
    const ln = c.ln, end = c.dir > 0 ? ln.b : ln.a;
    let opts = (this.adj.get(end) || []).filter((o) => !(o.ln === ln));
    if (!opts.length) {
      if (!ln.r.oneway) { c.dir = -c.dir; c.s = 0; return; }
      this._place(c, 120, 300); return;
    }
    const o = U.pick(opts);
    c.ln = o.ln; c.dir = o.dir; c.s = 0;
  },
  _place(c, dmin, dmax, near) {
    const p = near || this._near || { x: 0, z: 0 };
    for (let k = 0; k < 40; k++) {
      const ln = U.pick(this.lanes);
      const pt = U.pick(ln.pts);
      const d = Math.hypot(pt[0] - p.x, pt[2] - p.z);
      if (d < dmin || d > dmax) continue;
      c.ln = ln;
      c.dir = ln.r.oneway ? 1 : (Math.random() < 0.5 ? 1 : -1);
      c.s = Math.random() * ln.len;
      c.speed = c.cruise * 0.6; c.stun = 0;
      const q = this._pose(c);
      c.x = q.x; c.z = q.z; c.h = Math.atan2(q.tx, q.tz);
      return true;
    }
    return false;
  },
  spawn(scene, count, avoid) {
    this.clear(scene);
    this._prep();
    this._near = avoid;
    const models = ['pixel', 'rondo', 'vespera', 'van', 'orion', 'rondo', 'bus', 'pixel', 'kitsune', 'rondo'];
    for (let n = 0; n < count; n++) {
      const model = U.pick(models);
      const color = U.pick(Traffic.COLORS);
      const entry = { model, up: {}, style: Object.assign(DATA.defaultStyle(color), { finish: 'gloss', rim: '#777777', tint: 2 }) };
      const mesh = CarFactory.build(entry, { lite: true });
      mesh.rotation.order = 'YXZ';
      const sh = DATA.carById(model).shape;
      const c = {
        mesh, ud: mesh.userData, x: 0, z: 0, h: 0, vx: 0, vz: 0, y: null,
        speed: 0, cruise: model === 'bus' ? 11 : U.rand(12, 17), stun: 0, honk: 0,
        circles: sh.len > 6 ? [-1, 0, 1] : [-1, 1], cOff: sh.len / 2 - sh.wid / 2, cRad: sh.wid / 2 + 0.1,
        wheelRot: 0, len: sh.len, wid: sh.wid,
      };
      if (!this._place(c, 60, 320)) { CarFactory.dispose(mesh); continue; }
      scene.add(mesh);
      this.cars.push(c);
    }
  },
  clear(scene) {
    this.cars.forEach((c) => { scene.remove(c.mesh); CarFactory.dispose(c.mesh); });
    this.cars = [];
  },
  update(dt, obstacles) {
    const cars = this.cars;
    if (obstacles[0]) this._near = obstacles[0];
    this._rt = (this._rt || 0) - dt;
    if (this._rt <= 0 && obstacles[0]) {
      this._rt = 0.5;
      const p = obstacles[0];
      const far = cars.find((c) => Math.hypot(c.x - p.x, c.z - p.z) > 380);
      if (far) { this._place(far, 140, 320); far.y = null; }
    }
    for (const c of cars) {
      let target = c.cruise;
      if (c.stun > 0) { c.stun -= dt; target = 0; } else {
        const fx = Math.sin(c.h), fz = Math.cos(c.h);
        const check = (o) => {
          const rx = o.x - c.x, rz = o.z - c.z;
          const ahead = rx * fx + rz * fz;
          if (ahead <= 0 || ahead > 18) return;
          if (Math.abs(rx * fz - rz * fx) < 2.6) target = Math.min(target, Math.max(0, (ahead - 7) * 1.6));
        };
        obstacles.forEach(check);
        cars.forEach((o) => { if (o !== c) check(o); });
      }
      c.speed += U.clamp(target - c.speed, -14 * dt, 4 * dt);
      c.s += c.speed * dt;
      let guard = 0;
      while (c.s >= c.ln.len && guard++ < 4) { c.s -= c.ln.len; this._next(c); }
      const q = this._pose(c);
      // haluskan perpindahan lajur di simpang
      const k = Math.min(1, dt * 6);
      const jump = Math.hypot(q.x - c.x, q.z - c.z) > 25;
      c.x = jump ? q.x : c.x + (q.x - c.x) * k + q.tx * c.speed * dt * (1 - k);
      c.z = jump ? q.z : c.z + (q.z - c.z) * k + q.tz * c.speed * dt * (1 - k);
      const th = Math.atan2(q.tx, q.tz);
      c.h = jump ? th : c.h + U.angDiff(c.h, th) * Math.min(1, dt * 7);
      c.vx = Math.sin(c.h) * c.speed; c.vz = Math.cos(c.h) * c.speed;
      const g = MalangWorld.probe(c.x, c.z, c.h, c.len, c.wid);
      c.y = c.y == null || Math.abs(g.y - c.y) > 3 ? g.y : c.y + (g.y - c.y) * Math.min(1, dt * 15);
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.set(-g.pitch, c.h, g.roll);
      c.wheelRot += (c.speed / c.ud.wr) * dt;
      c.ud.wheels.forEach((w) => { w.spin.rotation.x = c.wheelRot; });
      c.ud.tailMat.color.setHex(target < c.speed - 0.5 ? 0xff1030 : 0x8a0010);
      if (c.honk > 0) c.honk -= dt;
    }
  },
};

// pilihan peta dibaca sebelum game dimulai (?map=malang di URL juga bisa)
MalangWorld.wanted = (() => {
  try {
    const q = new URLSearchParams(location.search).get('map');
    if (q) return q === 'malang';
    return (JSON.parse(localStorage.getItem('nr_settings') || '{}').map || 'neopolis') === 'malang';
  } catch (e) { return false; }
})();

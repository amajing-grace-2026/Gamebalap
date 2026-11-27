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
    this._customIjen();
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
        baseUpdate(dt, t, cam); // pegunungan ikut kamera lewat World.mountFollow
        self._tileTick(dt, cam);
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
      const r = hw + 3; // + trotoar
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
        add(a[0], a[1], a[2], b[0], b[1], b[2], r.w / 2, r, 0.05); // tinggi seragam: tak ada loncatan antar-ruas
        if (this._hasWalk(r)) this.segs[this.segs.length - 1].walk = this.SW;
      }
    });
    D.croads.forEach((r) => {
      const p = r.p;
      for (let k = 0; k + 5 < p.length; k += 3) add(p[k], p[k + 1], p[k + 2], p[k + 3], p[k + 4], p[k + 5], r.w / 2, null, 0.02);
    });
  },
  SW: 2.3, // lebar trotoar
  _hasWalk(r) { return !r.stub && !r.rb && r.w >= 6; },
  // titik (x,z) berada di atas jalan LAIN (bukan ruas r)?
  _otherRoad(x, z, r) {
    const L = this._cell(x, z);
    if (!L) return false;
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      if (s.road === r) continue;
      const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1;
      const t = U.clamp(((x - s.ax) * dx + (z - s.az) * dz) / l2, 0, 1);
      const px = s.ax + dx * t - x, pz = s.az + dz * t - z, lim = s.hw + 0.4;
      if (px * px + pz * pz < lim * lim) return true;
    }
    return false;
  },
  _cell(x, z) { const C = this.CELL; return this.grid.get(Math.floor(x / C) * 100003 + Math.floor(z / C)); },

  // permukaan: { y, seg } — seg = ruas jalan di bawah titik (null = rumput/tanah)
  surface(x, z) {
    const L = this._cell(x, z);
    let best = null, by = -1e9, walkY = -1e9;
    if (L) {
      for (let i = 0; i < L.length; i++) {
        const s = L[i];
        const dx = s.bx - s.ax, dz = s.bz - s.az;
        const l2 = dx * dx + dz * dz || 1;
        const t = U.clamp(((x - s.ax) * dx + (z - s.az) * dz) / l2, 0, 1);
        const px = s.ax + dx * t - x, pz = s.az + dz * t - z;
        const d2 = px * px + pz * pz, lim = s.hw + 0.4;
        if (d2 > lim * lim) {
          const wl = s.hw + (s.walk || 0);
          if (s.walk && d2 < wl * wl) walkY = Math.max(walkY, s.ay + (s.by - s.ay) * t + 0.21);
          continue;
        }
        const y = s.ay + (s.by - s.ay) * t + s.lift;
        if (y > by) { by = y; best = s; }
      }
    }
    if (best) return { y: by, seg: best };
    if (walkY > -1e8) return { y: walkY, seg: null };
    if (this.pads) for (const pd of this.pads) if (Math.abs(x - pd.x) < pd.r && Math.abs(z - pd.z) < pd.r && Math.hypot(x - pd.x, z - pd.z) < pd.r) return { y: Math.max(pd.y, this.terrainH(x, z) + 0.06), seg: pd.seg || (pd.seg = { road: { name: 'Bundaran Tugu Jl. Bandung' } }) };
    return { y: this.terrainH(x, z) + 0.02, seg: null };
  },
  // kemiringan bodi & tanjakan untuk mobil
  probe(x, z, h, len, wid) {
    const fx = Math.sin(h), fz = Math.cos(h);
    const lx = Math.cos(h), lz = -Math.sin(h); // kiri
    // jarak sampel panjang = rata-rata spasial (tanpa jeda waktu), jadi mobil tidak oleng di kecepatan tinggi
    const a = Math.max(2.8, len * 0.5), b = wid * 0.4;
    const c = this.surface(x, z);
    // titik sampel yang jatuh ke rumput/tepi saat mobil masih di aspal diabaikan (tidak menyentak)
    const at = (sx, sz) => { const s = this.surface(sx, sz); return c.seg && !s.seg ? null : s.y; };
    let yf = at(x + fx * a, z + fz * a), yb = at(x - fx * a, z - fz * a);
    if (yf == null) yf = yb == null ? c.y : 2 * c.y - yb;
    if (yb == null) yb = 2 * c.y - yf;
    let yl = at(x + lx * b, z + lz * b), yr = at(x - lx * b, z - lz * b);
    if (yl == null) yl = c.y; if (yr == null) yr = c.y;
    const grade = U.clamp((yf - yb) / (2 * a), -0.25, 0.25);
    return {
      y: c.y * 0.5 + (yf + yb) * 0.25, grade, pitch: Math.atan(grade), roll: U.clamp(Math.atan((yl - yr) / (2 * b)), -0.06, 0.06),
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
    this._roundabouts();
    D.buildings.forEach((b, i) => {
      const o = { x: b[0], z: b[2], hw: b[3] / 2, hd: b[4] / 2, c: Math.cos(b[6]), s: Math.sin(b[6]) };
      if (this._cleared(b[0], b[2], Math.max(b[3], b[4]) / 2)) return;
      if (this._boxOnRoad(o)) { removed++; return; }
      this.keep[i] = 1;
      put(o);
    });
    this.removedBuildings = removed;
    D.landmarks.forEach((l) => put({ x: l.x, z: l.z, hw: l.w / 2, hd: l.d / 2, c: Math.cos(l.rot), s: Math.sin(l.rot) }));
    (this.extraBoxes || []).forEach((o) => put(o));
    // pulau bundaran: oktagon dari dua kotak
    [this.balapan, this.tugu].forEach((t) => {
      if (t) [0, Math.PI / 4].forEach((a) => put({ x: t.x, z: t.z, hw: t.R * 0.92, hd: t.R * 0.92, c: Math.cos(a), s: Math.sin(a) }));
    });
  },
  // Ijen Computer di Jl. Ijen, di seberang taman Simpang Balapan; Indomaret di sebelah utaranya
  _customIjen() {
    const D = this.D, P = D.pts;
    const rb = D.roads.find((r) => r.rb && /Balapan/i.test(r.name));
    let cx = 1236, cz = 1476;
    if (rb) { cx = 0; cz = 0; rb.chain.forEach((i) => { cx += P[i][0]; cz += P[i][2]; }); cx /= rb.chain.length; cz /= rb.chain.length; }
    // titik Jl. Ijen terdekat dari pusat bundaran
    let best = null, bd = 1e9;
    D.roads.forEach((r) => {
      if (!/^Jl\. Ijen$/.test(r.name) || r.oneway) return;
      r.chain.forEach((i, k) => { const q = P[i], d = Math.hypot(q[0] - cx, q[2] - cz); if (d < bd && k > 0 && k < r.chain.length - 1) { bd = d; best = { r, k }; } });
    });
    if (!best) return;
    const ch = best.r.chain, p = P[ch[best.k]], a = P[ch[best.k - 1]], b = P[ch[best.k + 1]];
    let tx = b[0] - a[0], tz = b[2] - a[2]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    if (tz > 0) { tx = -tx; tz = -tz; } // t menunjuk ke utara
    let nx = -tz, nz = tx; // normal
    if ((cx - p[0]) * nx + (cz - p[2]) * nz > 0) { nx = -nx; nz = -nz; } // n menjauhi bundaran (sisi toko)
    const hw = best.r.w / 2, setback = hw + this.SW + 7;
    const rot = Math.atan2(-nx, -nz); // tampak depan menghadap jalan
    const mk = (along, w, d) => ({ x: p[0] + tx * along + nx * (setback + d / 2), z: p[2] + tz * along + nz * (setback + d / 2) });
    const ic = mk(0, 17, 13), im = mk(23, 26, 14);
    const y = p[1];
    this.ijen = { ic, im, rot, y, tx, tz, nx, nz, road: p, hw };
    const l = D.landmarks.find((q) => /Ijen Computer/i.test(q.name));
    if (l) Object.assign(l, { x: ic.x, z: ic.z, y, rot, w: 17, d: 13, h: 7, approx: false, custom: 'ijen' });
    this.extraBoxes = [{ x: im.x, z: im.z, hw: 13, hd: 7, c: Math.cos(rot), s: Math.sin(rot) }];
    this.clears = [{ x: ic.x, z: ic.z, r: 16 }, { x: im.x, z: im.z, r: 19 }, { x: p[0] + nx * (hw + 4), z: p[2] + nz * (hw + 4), r: 14 }];
  },
  // area yang dikosongkan dari rumah/pohon acak (landmark detail & taman)
  _cleared(x, z, r) { return (this.clears || []).some((c) => Math.hypot(c.x - x, c.z - z) < c.r + r * 0.5); },
  _roundabouts() {
    const D = this.D, P = D.pts;
    this.clears = this.clears || [];
    // 1) Taman Simpang Balapan: pulau besar sampai tepi jalan lingkar
    const rb = D.roads.find((r) => r.rb && /Balapan/i.test(r.name));
    if (rb) {
      let cx = 0, cz = 0, cy = 0;
      rb.chain.forEach((i) => { cx += P[i][0]; cy += P[i][1]; cz += P[i][2]; });
      cx /= rb.chain.length; cy /= rb.chain.length; cz /= rb.chain.length;
      let rr = 0; rb.chain.forEach((i) => { rr += Math.hypot(P[i][0] - cx, P[i][2] - cz); });
      rr /= rb.chain.length;
      this.balapan = { x: cx, z: cz, y0: cy + 0.045, R: rr - rb.w / 2 - 0.35 };
      this.clears.push({ x: cx, z: cz, r: this.balapan.R + 1 });
    }
    // 2) Tugu hijau di bundaran kecil persimpangan Jl. Bandung – Panjaitan – Ijen (busur OSM tanpa nama)
    const rb2 = D.roads.find((r) => r.rb && !r.name);
    if (rb2 && rb2.chain.length >= 3) {
      const a = P[rb2.chain[0]], b = P[rb2.chain[Math.floor(rb2.chain.length / 2)]], c = P[rb2.chain[rb2.chain.length - 1]];
      // pusat lingkaran lewat 3 titik
      const ax = a[0], az = a[2], bx = b[0], bz = b[2], cx = c[0], cz = c[2];
      const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
      if (Math.abs(d) > 1e-6) {
        const ux = ((ax * ax + az * az) * (bz - cz) + (bx * bx + bz * bz) * (cz - az) + (cx * cx + cz * cz) * (az - bz)) / d;
        const uz = ((ax * ax + az * az) * (cx - bx) + (bx * bx + bz * bz) * (ax - cx) + (cx * cx + cz * cz) * (bx - ax)) / d;
        const rr = Math.hypot(ax - ux, az - uz);
        let R = Math.min(6.5, rr - rb2.w / 2 - 0.3);
        // jangan menutupi jalan lain
        const any = {};
        while (R > 3.5) {
          let hit = false;
          for (let k = 0; k < 16 && !hit; k++) { const t = (k / 16) * Math.PI * 2; hit = this._otherRoad(ux + Math.cos(t) * R, uz + Math.sin(t) * R, any); }
          if (!hit) break;
          R -= 0.5;
        }
        const y = rb2.chain.reduce((s2, i) => s2 + P[i][1], 0) / rb2.chain.length;
        this.tugu = { x: ux, z: uz, R: Math.max(3.5, R), y0: y + 0.045 };
        // pelataran aspal melingkar di sekeliling tugu (busur OSM-nya tidak lengkap)
        this.pads = (this.pads || []).concat([{ x: ux, z: uz, r: this.tugu.R + 8, y: y + 0.035 }]);
        this.clears.push({ x: ux, z: uz, r: this.tugu.R + 2 });
      }
    }
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
    // varian arah balik untuk rute A→B: titik start berbeda, jadi penanda event tidak menumpuk
    const rev = (re, extra) => {
      const r = find(re);
      return r && !r.loop ? Object.assign({ path: pts(r).slice().reverse() }, extra) : null;
    };
    // syarat REP Malang (240/900/1700) bisa dicapai dengan menang tiap event sekali, tanpa harus mengulang
    return [
      mk('mlg-s1', 'sprint', /Soekarno/, 1, 0),
      mk('mlg-g1', 'drag', /Drag/, 1, 0),
      rev(/Soekarno/) && mk('mlg-s1r', 'sprint', /Soekarno/, 1, 0, rev(/Soekarno/, { name: 'Sprint Soekarno-Hatta (Arah Balik)' })),
      mk('mlg-c1', 'circuit', /Kampus/, 2, 240, { laps: 1 }),
      mk('mlg-d1', 'drift', /Soekarno/, 2, 240, { id: 'mlg-d1', name: 'Drift Soekarno-Hatta', opp: 0, targets: [6000, 4000, 2500] }),
      rev(/Drag/) && mk('mlg-g2', 'drag', /Drag/, 2, 240, rev(/Drag/, { name: 'Drag Ijen (Arah Balik)' })),
      mk('mlg-c2', 'circuit', /Ijen/, 3, 900, { laps: 1 }),
      rev(/Tlogomas/) && mk('mlg-s3', 'sprint', /Tlogomas/, 3, 900, rev(/Tlogomas/, { name: 'Turunan Tlogomas', desc: 'Rute Tlogomas dari atas: turunan cepat, rem tepat waktu di tikungan.' })),
      mk('mlg-s2', 'sprint', /Tlogomas/, 4, 1700, { name: 'GRAND FINAL: Tanjakan Tlogomas' }),
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
    this.tiled = [];
    this.shadows = shadows;

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
      const t = Tex.make(c, true); t.anisotropy = quality === 'low' ? 1 : 8; return t;
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
    // ---- trotoar di kiri-kanan jalan utama (terputus di persimpangan)
    {
      const SW = this.SW, wp = [], wu = [], wi = [];
      D.roads.forEach((r) => {
        if (!this._hasWalk(r)) return;
        const ch = r.chain, n = ch.length, hw = r.w / 2;
        [1, -1].forEach((sd) => {
          let prevOk = false, v = 0;
          for (let k = 0; k < n; k++) {
            const p = P[ch[k]], a = P[ch[Math.max(0, k - 1)]], b = P[ch[Math.min(n - 1, k + 1)]];
            let tx = b[0] - a[0], tz = b[2] - a[2]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
            const nx = -tz * sd, nz = tx * sd;
            if (k > 0) v += Math.hypot(p[0] - P[ch[k - 1]][0], p[2] - P[ch[k - 1]][2]);
            const ok = !this._otherRoad(p[0] + nx * (hw + 0.5), p[2] + nz * (hw + 0.5), r) && !this._otherRoad(p[0] + nx * (hw + SW), p[2] + nz * (hw + SW), r) && !this._otherRoad(p[0] + nx * (hw + SW / 2), p[2] + nz * (hw + SW / 2), r);
            const y = p[1] + 0.05, base = wp.length / 3;
            wp.push(p[0] + nx * hw, y - 0.05, p[2] + nz * hw, p[0] + nx * hw, y + 0.16, p[2] + nz * hw,
              p[0] + nx * (hw + SW), y + 0.16, p[2] + nz * (hw + SW), p[0] + nx * (hw + SW), y - 0.8, p[2] + nz * (hw + SW));
            wu.push(0, v / 2, 0.1, v / 2, 1, v / 2, 1.1, v / 2);
            if (ok && prevOk) {
              const q = base - 4;
              for (let f = 0; f < 3; f++) wi.push(q + f, base + f, q + f + 1, q + f + 1, base + f, base + f + 1);
            }
            prevOk = ok;
          }
        });
      });
      const walkTex = (() => {
        const c = Tex.canvas(128, 128), g = c.getContext('2d');
        g.fillStyle = '#c2beb4'; g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(70,70,70,0.35)'; g.lineWidth = 2;
        for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
        g.fillStyle = '#8f8b82'; g.fillRect(0, 0, 10, 128);
        for (let k = 0; k < 400; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3); }
        return Tex.make(c, true);
      })();
      mesh(wp, wi, new THREE.MeshStandardMaterial({ map: walkTex, color: new THREE.Color(dark, dark, dark), roughness: 0.9, side: THREE.DoubleSide }), wu);
    }
    // tambalan aspal di persimpangan
    {
      const cnt = new Map(), wOf = new Map();
      D.roads.forEach((r) => r.chain.forEach((i) => { cnt.set(i, (cnt.get(i) || 0) + 1); wOf.set(i, Math.max(wOf.get(i) || 0, r.w)); }));
      const jn = [...cnt.entries()].filter(([, c]) => c >= 2).map(([i]) => i);
      this._tiled(scene, new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: lin(0x3b3d42).multiplyScalar(night ? 0.75 : 1), roughness: 0.88, envMap: World.envMap, envMapIntensity: T.wet ? 0.5 : 0.15 }), jn.length,
        (k, m) => { const p = P[jn[k]], r = wOf.get(jn[k]) / 2 + 0.6; m.makeScale(r, 1, r).setPosition(p[0], p[1] + 0.085, p[2]); },
        { receive: shadows });
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
      // kotak dengan 2 grup saja (dinding, atap datar) → 2 draw call per petak, bukan 6
      const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      {
        const I = geo.index.array, walls = [], top = [];
        geo.groups.forEach((gr) => { for (let i = gr.start; i < gr.start + gr.count; i++) (gr.materialIndex === 2 ? top : walls).push(I[i]); });
        geo.setIndex(walls.concat(top)); geo.clearGroups();
        geo.addGroup(0, walls.length, 0); geo.addGroup(walls.length, top.length, 1);
      }
      const HOUSE = [0xe9e2d0, 0xd8c9a8, 0xc9d3d6, 0xf0d9c4, 0xbfc7b3, 0xe2d5e0].map(lin);
      const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
      const kept = [];
      B.forEach((b, i) => { if (keep[i]) kept.push(b); });
      this._tiled(scene, geo, [side, roof], kept.length, (k, m, c) => {
        const b = kept[k];
        q.setFromAxisAngle(Y, b[6]); s.set(b[3], b[5] + 1, b[4]); p.set(b[0], b[1] - 1, b[2]);
        m.compose(p, q, s); c.copy(HOUSE[b[7]] || HOUSE[0]);
      }, { color: true, cast: shadows, receive: shadows });
      // atap genteng limasan untuk rumah (≤ 10 m); gedung tinggi tetap beratap datar
      const houses = kept.filter((b) => b[5] <= 10);
      const rg = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
      const TILE = [0xa4512f, 0x8e3f27, 0xb5653a, 0x7a4a3a, 0x9b5a3e, 0x5c5f66].map(lin);
      this._tiled(scene, rg, new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true, color: new THREE.Color(dark, dark, dark) }), houses.length, (k, m, c) => {
        const b = houses[k];
        const rh = U.clamp(Math.min(b[3], b[4]) * 0.32, 1.4, 3.6);
        q.setFromAxisAngle(Y, b[6]); s.set(b[3] * 1.12, rh, b[4] * 1.12); p.set(b[0], b[1] + b[5], b[2]);
        m.compose(p, q, s); c.copy(TILE[(k * 7 + b[7]) % TILE.length]);
      }, { color: true, cast: shadows });
      World.buildingMats = [side];
    }

    // ---- pohon
    {
      const Tr = D.trees.filter((t) => !this._cleared(t[0], t[2], 0)), palms = Tr.filter((t) => t[3]), rest = Tr.filter((t) => !t[3]);
      const mk = (list, trunkH, crownGeo, crownCol, crownY) => {
        if (!list.length) return;
        const sc = (k) => 0.8 + ((k * 37) % 10) / 20;
        this._tiled(scene, new THREE.CylinderGeometry(0.18, 0.25, trunkH, 6).translate(0, trunkH / 2, 0), new THREE.MeshStandardMaterial({ color: lin(0x6b5138).multiplyScalar(dark), roughness: 1 }), list.length,
          (k, m) => { const t = list[k], s = sc(k); m.makeScale(s, s, s).setPosition(t[0], t[1], t[2]); }, { cast: shadows });
        this._tiled(scene, crownGeo, new THREE.MeshStandardMaterial({ color: lin(crownCol).multiplyScalar(dark), roughness: 0.95, flatShading: true }), list.length,
          (k, m) => { const t = list[k], s = sc(k); m.makeScale(s, s, s).setPosition(t[0], t[1] + crownY * s, t[2]); }, { cast: shadows });
      };
      mk(rest, 3, new THREE.IcosahedronGeometry(2.6, 0), 0x4f7a3a, 4.2);
      // palem raja (Jl. Ijen): batang tinggi ramping + mahkota pelepah yang melengkung
      if (palms.length) {
        const TH = 11;
        const parts = [];
        for (let i = 0; i < 10; i++) {
          const f = new THREE.PlaneGeometry(0.75, 3.8, 1, 3).rotateX(-Math.PI / 2).translate(0, 0, 1.9);
          const pos = f.attributes.position;
          for (let k = 0; k < pos.count; k++) { const zz = pos.getZ(k); pos.setY(k, -0.09 * zz * zz); pos.setX(k, pos.getX(k) * (1 - zz / 4.5)); }
          f.rotateX(-0.25 + (i % 2) * 0.35).rotateY((i / 10) * Math.PI * 2 + (i % 2) * 0.3);
          parts.push(f.toNonIndexed());
        }
        parts.push(new THREE.CylinderGeometry(0.32, 0.22, 1.1, 7).translate(0, -0.5, 0).toNonIndexed());
        const arr = []; parts.forEach((g2) => arr.push(...g2.attributes.position.array));
        const crownGeo = new THREE.BufferGeometry(); crownGeo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); crownGeo.computeVertexNormals();
        const sc = (k) => 0.85 + ((k * 37) % 10) / 33, v3 = new THREE.Vector3();
        this._tiled(scene, new THREE.CylinderGeometry(0.17, 0.26, TH, 7).translate(0, TH / 2, 0), new THREE.MeshStandardMaterial({ color: lin(0x9a9286).multiplyScalar(dark), roughness: 0.9 }), palms.length,
          (k, m) => { const t = palms[k]; m.makeScale(1, sc(k), 1).setPosition(t[0], t[1], t[2]); }, { cast: shadows });
        this._tiled(scene, crownGeo, new THREE.MeshStandardMaterial({ color: lin(0x4f8a3a).multiplyScalar(dark), roughness: 0.9, side: THREE.DoubleSide }), palms.length,
          (k, m) => { const t = palms[k], s = sc(k); m.makeRotationY(k * 1.7).scale(v3.set(s, s, s)).setPosition(t[0], t[1] + TH * s, t[2]); }, { cast: shadows });
      }
    }

    // ---- lampu jalan di jalan utama (+ genangan cahaya saat senja/malam)
    this._streetLights(scene, T, night, dusk);

    // ---- landmark (sementara kotak + papan nama; detail menyusul dari foto)
    this._landmarks(scene, T, night, dark, shadows);

    // ---- tugu hijau (bundaran Jl. Bandung) & taman Simpang Balapan & Ijen Computer (dari foto)
    if (this.tugu) this._tuguBalapan(scene, dark, shadows, night);
    if (this.balapan) this._tamanBalapan(scene, dark, shadows, night);
    this._ijenComputer(scene, dark, shadows, night);

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
    World.mountFollow = this.mount;
    if (World.far < 2500) this.mount.scale.setScalar((World.far * 0.94) / 2500); // kualitas Rendah: masuk ke dalam camera.far
    // petak kota di luar kabut disembunyikan (≥ 98,8% tertutup kabut pada jarak ini)
    this.viewDist = Math.min(World.far || 6000, 2.1 / scene.fog.density);
    this._tt = 0;
    this._mapCanvas();
  },

  // ------------------------------------------------------------------ petak kota (culling)
  // r128 meng-cull InstancedMesh memakai bounding sphere GEOMETRI dasarnya (bukan isi instance),
  // jadi satu InstancedMesh se-kota selalu tergambar semua (atau hilang serempak). Di sini tiap
  // jenis objek dibagi per petak TILE m: tiap petak punya geometri "kembar" (atribut GPU dipakai
  // bersama, tidak disalin) dengan bounding sphere seluas isi petak → frustum culling bekerja,
  // dan petak jauh / bayangan petak jauh dimatikan oleh _tileTick.
  TILE: 300,
  _shareGeo(geo) {
    const g = new THREE.BufferGeometry();
    g.setIndex(geo.index);
    Object.keys(geo.attributes).forEach((k) => g.setAttribute(k, geo.attributes[k]));
    geo.groups.forEach((gr) => g.addGroup(gr.start, gr.count, gr.materialIndex));
    return g;
  },
  // fill(k, m, c): isi matriks m (& warna c bila opts.color) untuk instance ke-k
  _tiled(scene, geo, mat, n, fill, opts = {}) {
    if (!n) return;
    const S = this.TILE, m = new THREE.Matrix4(), col = new THREE.Color();
    const M = new Float32Array(n * 16), C = opts.color ? new Float32Array(n * 3) : null, cells = new Map();
    for (let k = 0; k < n; k++) {
      fill(k, m, col);
      m.toArray(M, k * 16);
      if (C) { C[k * 3] = col.r; C[k * 3 + 1] = col.g; C[k * 3 + 2] = col.b; }
      const key = (Math.floor(M[k * 16 + 12] / S) + 500) * 1000 + Math.floor(M[k * 16 + 14] / S) + 500;
      let L = cells.get(key);
      if (!L) cells.set(key, (L = []));
      L.push(k);
    }
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const gR = geo.boundingSphere.radius + geo.boundingSphere.center.length();
    cells.forEach((L) => {
      const im = new THREE.InstancedMesh(this._shareGeo(geo), mat, L.length);
      const A = im.instanceMatrix.array, CA = C ? new Float32Array(L.length * 3) : null;
      let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9, s2 = 0;
      L.forEach((k, j) => {
        const o = k * 16;
        for (let e = 0; e < 16; e++) A[j * 16 + e] = M[o + e];
        if (CA) { CA[j * 3] = C[k * 3]; CA[j * 3 + 1] = C[k * 3 + 1]; CA[j * 3 + 2] = C[k * 3 + 2]; }
        const x = M[o + 12], y = M[o + 13], z = M[o + 14];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
        s2 = Math.max(s2, M[o] * M[o] + M[o + 1] * M[o + 1] + M[o + 2] * M[o + 2], M[o + 4] * M[o + 4] + M[o + 5] * M[o + 5] + M[o + 6] * M[o + 6], M[o + 8] * M[o + 8] + M[o + 9] * M[o + 9] + M[o + 10] * M[o + 10]);
      });
      if (CA) im.instanceColor = new THREE.InstancedBufferAttribute(CA, 3);
      const r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + gR * Math.sqrt(s2);
      im.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), r);
      im.receiveShadow = !!opts.receive;
      im.castShadow = !!opts.cast;
      im.matrixAutoUpdate = false;
      scene.add(im);
      this.tiled.push({ im, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, r, cast: !!opts.cast });
    });
  },
  // beberapa kali per detik: sembunyikan petak di luar jarak kabut, bayangan hanya ±250 m
  _tileTick(dt, cam) {
    if (!this.tiled || !this.tiled.length || !cam) return;
    this._tt -= dt;
    if (this._tt > 0) return;
    this._tt = 0.25;
    const x = cam.position.x, z = cam.position.z, V = this.viewDist;
    for (let i = 0; i < this.tiled.length; i++) {
      const t = this.tiled[i], d = Math.hypot(t.cx - x, t.cz - z) - t.r;
      t.im.visible = d < V;
      if (t.cast) t.im.castShadow = d < 250;
    }
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
    const q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const base = (s) => [s.p[0] + s.nx * (s.hw + 0.9), s.p[1] - 0.3, s.p[2] + s.nz * (s.hw + 0.9)];
    this._tiled(scene, new THREE.CylinderGeometry(0.09, 0.13, 8, 6).translate(0, 4, 0), World.metalMat || new THREE.MeshStandardMaterial({ color: 0x55565c, roughness: 0.6, metalness: 0.5 }), n,
      (i, m) => { const [x, y, z] = base(spots[i]); m.makeTranslation(x, y, z); }, { cast: this.shadows });
    this._tiled(scene, new THREE.BoxGeometry(0.35, 0.16, 1.6), new THREE.MeshBasicMaterial({ color: night || dusk ? 0xfff0c8 : 0xcfd3d8 }), n, (i, m) => {
      const s = spots[i], [x, y, z] = base(s);
      q.setFromAxisAngle(Y, Math.atan2(s.nx, s.nz));
      m.compose(v.set(x - s.nx * 0.8, y + 8, z - s.nz * 0.8), q, one);
    });
    const pools = [], pidx = [], puv = [];
    spots.forEach((s) => {
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
      if (l.custom) return; // landmark detail digambar terpisah
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

  // Tugu di tengah Bundaran Simpang Balapan: pulau bergaris hitam-putih, pilar kecil hijau-putih,
  // tangga piramida, tiang putih, kepala kubus hijau & ornamen berlian di puncak
  _tuguBalapan(scene, dark, shadows, night) {
    const { x, z, R } = this.tugu;
    // pulau di atas tanah tertinggi di bawahnya (tanah di pojok simpang ini sedikit lebih tinggi dari jalan)
    let top = this.tugu.y0;
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; for (const rr of [0, R * 0.5, R]) top = Math.max(top, this.terrainH(x + Math.cos(a) * rr, z + Math.sin(a) * rr) + 0.06); }
    this.tugu.y0 = top;
    const y0 = this.tugu.y0; // tinggi jalan di sekitar pulau
    (this.pads || []).forEach((pd) => {
      const cg = new THREE.CircleGeometry(pd.r, 48, 0, Math.PI * 2).rotateX(-Math.PI / 2);
      // permukaan pelataran mengikuti tanah (selalu di atasnya), rata di dekat pulau
      const ps = cg.attributes.position;
      for (let k = 0; k < ps.count; k++) { const vx = pd.x + ps.getX(k), vz = pd.z + ps.getZ(k); ps.setY(k, Math.max(pd.y, this.terrainH(vx, vz) + 0.06) - pd.y); }
      cg.computeVertexNormals();
      const disc = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: new THREE.Color(0x3b3d42).convertSRGBToLinear().multiplyScalar(dark), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: 1 }));
      disc.position.set(pd.x, pd.y - 0.005, pd.z); disc.receiveShadow = shadows; scene.add(disc);
      // marka putih melingkar di tepi pulau
      const mk = new THREE.Mesh(new THREE.RingGeometry(R + 0.35, R + 0.5, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdedede }));
      mk.position.set(pd.x, pd.y + 0.01, pd.z); scene.add(mk);
    });
    const g = new THREE.Group();
    g.position.set(x, y0 - 0.05, z);
    const lin = (h) => new THREE.Color(h).convertSRGBToLinear().multiplyScalar(dark);
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85 }, o));
    const cv = (w, h, fn) => { const c = Tex.canvas(w, h); fn(c.getContext('2d'), w, h); return Tex.make(c, true); };
    const noise = (g2, w, h, col, n, a) => { for (let k = 0; k < n; k++) { g2.fillStyle = col.replace('A', (Math.random() * a).toFixed(2)); const r = 2 + Math.random() * 10; g2.beginPath(); g2.arc(Math.random() * w, Math.random() * h, r, 0, 7); g2.fill(); } };
    const add = (m, cast = true) => { m.castShadow = shadows && cast; m.receiveShadow = shadows; g.add(m); return m; };

    // pembatas pulau: belang hitam-putih + bibir paving
    const stripe = cv(256, 32, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#26282b' : '#e6e6e0'; c.fillRect(i * 32, 0, 32, h); } noise(c, w, h, 'rgba(90,110,80,A)', 60, 0.25); });
    stripe.repeat.set(Math.round(R * 0.9), 1);
    const pave = cv(128, 128, (c, w, h) => { c.fillStyle = '#b9b6ad'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(60,60,60,0.35)'; c.lineWidth = 2; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); } noise(c, w, h, 'rgba(70,90,60,A)', 40, 0.3); });
    pave.repeat.set(R / 2, R / 2);
    add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.45, 64, 1, true).translate(0, 0.225, 0), std({ map: stripe, color: new THREE.Color(dark, dark, dark), side: THREE.DoubleSide })), false);
    const paveRing = add(new THREE.Mesh(new THREE.RingGeometry(R - 1.5, R, 64), std({ map: pave, color: new THREE.Color(dark, dark, dark) })), false);
    paveRing.rotation.x = -Math.PI / 2; paveRing.position.y = 0.45;
    // bibir hijau & rumput
    add(new THREE.Mesh(new THREE.CylinderGeometry(R - 1.5, R - 1.5, 0.62, 64, 1, true).translate(0, 0.31, 0), std({ color: lin(0x6f9a5a), side: THREE.DoubleSide })), false);
    const grass = add(new THREE.Mesh(new THREE.CircleGeometry(R - 1.5, 64), std({ color: lin(0x6f7d45) })), false);
    grass.rotation.x = -Math.PI / 2; grass.position.y = 0.58;

    // pilar kecil hijau-putih dengan emblem berlian
    const emb = cv(64, 64, (c, w, h) => { c.fillStyle = '#e9ebe4'; c.fillRect(0, 0, w, h); noise(c, w, h, 'rgba(90,150,70,A)', 30, 0.5);
      c.fillStyle = '#4d8a3c'; c.beginPath(); c.moveTo(32, 14); c.lineTo(50, 32); c.lineTo(32, 50); c.lineTo(14, 32); c.closePath(); c.fill();
      c.fillStyle = '#e9ebe4'; c.beginPath(); c.arc(32, 32, 7, 0, 7); c.fill(); });
    const pm = std({ map: emb, color: new THREE.Color(dark, dark, dark) }), cap = std({ color: lin(0x5f9a48) });
    const nP = 8;
    for (let i = 0; i < nP; i++) {
      const a = (i / nP) * Math.PI * 2 + 0.2, r = R - 1.1;
      const p = add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.62), pm));
      p.position.set(Math.cos(a) * r, 0.58 + 0.42, Math.sin(a) * r); p.rotation.y = -a + Math.PI / 2;
      const c = add(new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.12, 0.74), cap));
      c.position.set(p.position.x, 1.06, p.position.z); c.rotation.y = p.rotation.y;
    }

    // bingkai segi enam putih rendah di sekeliling tangga
    const white = std({ color: lin(0xdedbd2) });
    const hexR = Math.min(4.4, R - 2.2);
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
      const ax = Math.cos(a0) * hexR, az = Math.sin(a0) * hexR, bx = Math.cos(a1) * hexR, bz = Math.sin(a1) * hexR;
      const L = Math.hypot(bx - ax, bz - az);
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(L, 0.45, 0.22), white), false);
      m.position.set((ax + bx) / 2, 0.8, (az + bz) / 2); m.rotation.y = -Math.atan2(bz - az, bx - ax);
    }

    // tangga piramida (6 anak tangga) dengan tulisan prasasti samar
    const conc = cv(128, 64, (c, w, h) => { c.fillStyle = '#cfcbc0'; c.fillRect(0, 0, w, h); noise(c, w, h, 'rgba(80,80,70,A)', 50, 0.18);
      c.fillStyle = 'rgba(60,60,60,0.35)'; for (let k = 0; k < 6; k++) c.fillRect(10 + k * 19, 26, 12, 4); });
    const stepM = std({ map: conc, color: new THREE.Color(dark, dark, dark) });
    const base0 = Math.min(5.2, (hexR - 0.6) * 1.35), top0 = 1.4, nS = 7, sh = 0.32;
    for (let k = 0; k < nS; k++) {
      const wdt = base0 - (base0 - top0) * (k / (nS - 1));
      add(new THREE.Mesh(new THREE.BoxGeometry(wdt, sh, wdt).translate(0, sh / 2, 0), stepM)).position.y = 0.58 + k * sh;
    }
    const topY = 0.58 + nS * sh;

    // tiang putih bertekstur sambungan ubin
    const colH = 8.2;
    const tile = cv(64, 256, (c, w, h) => { c.fillStyle = '#e4e1d8'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(120,115,100,0.5)'; c.lineWidth = 2;
      for (let yy = 0; yy < h; yy += 32) { c.beginPath(); c.moveTo(0, yy); c.lineTo(w, yy); c.stroke(); } c.beginPath(); c.moveTo(32, 0); c.lineTo(32, h); c.stroke(); noise(c, w, h, 'rgba(110,100,80,A)', 30, 0.15); });
    add(new THREE.Mesh(new THREE.BoxGeometry(0.95, colH, 0.95).translate(0, colH / 2, 0), std({ map: tile, color: new THREE.Color(dark, dark, dark) }))).position.y = topY;

    // kepala kubus hijau (lapuk) dengan bagian bawah miring
    const moss = cv(128, 128, (c, w, h) => { c.fillStyle = '#5f9a45'; c.fillRect(0, 0, w, h); noise(c, w, h, 'rgba(225,230,215,A)', 70, 0.55); noise(c, w, h, 'rgba(40,80,30,A)', 40, 0.4); });
    const greenM = std({ map: moss, color: new THREE.Color(dark, dark, dark), roughness: 0.9 });
    const hy = topY + colH;
    const bevel = add(new THREE.Mesh(new THREE.CylinderGeometry(1.13, 0.68, 0.4, 4, 1).rotateY(Math.PI / 4), greenM));
    bevel.position.y = hy + 0.2;
    const head = add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.45, 1.6), greenM));
    head.position.y = hy + 0.4 + 0.72;
    const headTop = hy + 0.4 + 1.45;

    // penyangga kecil + ornamen berlian hijau di puncak
    const rod = std({ color: lin(0x3f6e35), metalness: 0.4, roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const r = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 5), rod), false);
      r.position.set(Math.cos(a) * 0.22, headTop + 0.45, Math.sin(a) * 0.22); r.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    }
    const dia = std({ color: lin(0x4f8c42), roughness: 0.6, flatShading: true });
    const up = add(new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.95, 4), dia));
    up.position.y = headTop + 0.95 + 0.47; up.rotation.y = Math.PI / 4;
    const dn = add(new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.35, 4).rotateX(Math.PI), dia));
    dn.position.y = headTop + 0.95 - 0.17; dn.rotation.y = Math.PI / 4;

    // tanaman: yucca/palem kecil & semak puring
    const leafM = std({ color: lin(0x3f7a3a), flatShading: true }), trunkM = std({ color: lin(0x7a6a52) });
    const bushCols = [0x4d7f36, 0x8a5a2a, 0x6c8f3a, 0x9a3a2a].map(lin);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2, r = hexR + 0.6 + rnd() * Math.max(0.3, R - hexR - 2.6);
      const px = Math.cos(a) * r, pz = Math.sin(a) * r;
      if (i % 3 === 0) {
        const hh = 1.2 + rnd() * 1.6;
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, hh, 5).translate(0, hh / 2, 0), trunkM)).position.set(px, 0.58, pz);
        const crown = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0).scale(1, 0.6, 1), leafM));
        crown.position.set(px, 0.58 + hh + 0.2, pz);
      } else {
        const b = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + rnd() * 0.35, 0), std({ color: bushCols[i % 4], flatShading: true })));
        b.position.set(px, 0.75, pz);
      }
    }
    if (night && World.quality !== 'low') { // Rendah: tanpa PointLight (tiap lampu menambah biaya semua shader)
      const spot = new THREE.PointLight(0xfff0d0, 1.2, 22, 2);
      spot.position.set(0, 2.5, 0); g.add(spot);
    }
    scene.add(g);
  },

  // alat bantu kecil untuk landmark detail
  _kit(dark, shadows) {
    const lin = (h) => new THREE.Color(h).convertSRGBToLinear().multiplyScalar(dark);
    const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85 }, o));
    const cv = (w, h, fn, rep) => { const c = Tex.canvas(w, h); fn(c.getContext('2d'), w, h); return Tex.make(c, rep); };
    const grey = new THREE.Color(dark, dark, dark);
    const box = (grp, w, h, d, mat, x, y, z, cast = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = shadows && cast; m.receiveShadow = shadows; grp.add(m); return m;
    };
    const plane = (grp, w, h, mat, x, y, z, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.position.set(x, y, z); m.rotation.y = ry; grp.add(m); return m;
    };
    return { lin, std, cv, grey, box, plane };
  },

  // ---------------- IJEN COMPUTER + Indomaret di sebelahnya (dari foto)
  _ijenComputer(scene, dark, shadows, night) {
    const J = this.ijen;
    if (!J) return;
    const K = this._kit(dark, shadows), { lin, std, cv, grey, box, plane } = K;
    const glow = night ? 1.5 : 1;
    // sumbu lokal +x mengarah ke utara (arah Indomaret)?
    const sgn = Math.sign(Math.cos(J.rot) * J.tx - Math.sin(J.rot) * J.tz) || 1;
    const W = 17, D = 13;
    const g = new THREE.Group();
    g.position.set(J.ic.x, J.y - 0.02, J.ic.z); g.rotation.y = J.rot;
    // halaman paving di depan (sampai trotoar)
    const pav = cv(128, 128, (c, w, h) => { c.fillStyle = '#9d9a94'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(40,40,40,0.35)'; c.lineWidth = 2;
      for (let i = 0; i <= 128; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); } for (let j = 0; j <= 128; j += 32) { c.beginPath(); c.moveTo(0, j); c.lineTo(w, j); c.stroke(); } }, true);
    pav.repeat.set(10, 4);
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 30, 8.5), std({ map: pav, color: grey }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(sgn * 13, 0.2, D / 2 + 4.2); apron.receiveShadow = shadows; g.add(apron);
    // badan bangunan
    const wall = std({ color: lin(0xd6d6d2) });
    box(g, W, 5, D, wall, 0, 2.5, 0);
    // kanopi abu-abu dengan huruf emas "IJEN COMPUTER"
    const fasc = cv(1024, 160, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#e9eaeb'); gr.addColorStop(1, '#b9bcbf'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.font = 'bold 96px "Arial Black", Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 6; c.strokeStyle = '#6b4c12'; c.strokeText('IJEN COMPUTER', w / 2 - 40, h / 2 + 4);
      const g2 = c.createLinearGradient(0, 40, 0, 120); g2.addColorStop(0, '#ffe08a'); g2.addColorStop(1, '#c8901e'); c.fillStyle = g2; c.fillText('IJEN COMPUTER', w / 2 - 40, h / 2 + 4);
    });
    const canW = W - 2.4;
    const canopy = box(g, canW, 2.6, 1.6, std({ color: lin(0xcfd1d3) }), -sgn * 1.2, 5.6, D / 2 + 0.3);
    plane(g, canW, 2.6, new THREE.MeshStandardMaterial({ map: fasc, emissiveMap: fasc, emissive: 0xffffff, emissiveIntensity: night ? 0.55 : 0.05, color: grey, roughness: 0.6 }), -sgn * 1.2, 5.6, D / 2 + 1.12);
    // bukaan toko (gelap, rak & poster) + tiang samping
    const inside = cv(512, 192, (c, w, h) => { c.fillStyle = '#1c1f24'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) { c.fillStyle = ['#2f6fd0', '#e9eef5', '#0a3d7a', '#f2c230', '#3a3f48'][i % 5]; c.fillRect(20 + i * 54, 40 + (i % 3) * 8, 34, 90); }
      c.fillStyle = '#c9a86a'; c.fillRect(0, 150, w, 14); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(0, 0, w, 24); });
    plane(g, canW - 1.2, 4.2, new THREE.MeshStandardMaterial({ map: inside, emissiveMap: inside, emissive: 0xffffff, emissiveIntensity: night ? 0.8 : 0.15, color: grey }), -sgn * 1.2, 2.25, D / 2 + 0.02);
    box(g, 0.6, 4.4, 0.6, wall, -sgn * (W / 2 - 0.3), 2.2, D / 2 + 0.2);
    // pylon cokelat berusuk dengan papan merek
    const rib = cv(64, 256, (c, w, h) => { c.fillStyle = '#7d4f42'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x, 0, 3, h); } }, true);
    const brands = cv(256, 1024, (c, w, h) => {
      c.fillStyle = '#7d4f42'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(x, 0, 5, h); }
      c.fillStyle = '#f4f4f4'; c.beginPath(); c.arc(w / 2, 150, 92, 0, 7); c.fill();
      c.fillStyle = '#b8232f'; c.font = 'italic bold 72px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('iC', w / 2, 150);
      const pan = (y, bg, txt, col, f) => { c.fillStyle = bg; c.fillRect(22, y, w - 44, 96); c.fillStyle = col; c.font = f; c.fillText(txt, w / 2, y + 50); };
      pan(300, '#1a64c8', 'ASUS', '#ffffff', 'bold 64px Arial');
      pan(410, '#d42e35', 'Lenovo', '#ffffff', 'bold 52px Arial');
      pan(520, '#4b2f9c', 'axioo', '#ffffff', 'bold 58px Arial');
      c.fillStyle = '#ffffff'; c.font = 'italic bold 70px Arial'; c.fillText('acer', w / 2, 720);
    });
    const pyl = new THREE.Group(); pyl.position.set(sgn * (W / 2 - 0.2), 0, D / 2 + 1.6); g.add(pyl);
    box(pyl, 2.2, 10, 1.3, std({ map: rib, color: grey }), 0, 5, 0);
    plane(pyl, 2.2, 8.6, new THREE.MeshStandardMaterial({ map: brands, emissiveMap: brands, emissive: 0xffffff, emissiveIntensity: night ? 0.6 : 0.04, color: grey, roughness: 0.7 }), 0, 5.4, 0.66);
    box(pyl, 2.6, 0.5, 1.6, std({ color: lin(0x8c8a86) }), 0, 0.25, 0);
    // gapura abu-hijau di sisi kiri toko
    const gate = std({ color: lin(0x9fb3aa) });
    box(g, 1.8, 6.5, 1.8, gate, -sgn * (W / 2 + 3.5), 3.25, D / 2 + 2.5);
    box(g, 2.3, 0.6, 2.3, gate, -sgn * (W / 2 + 3.5), 6.8, D / 2 + 2.5);
    scene.add(g);

    // ---- Indomaret di sebelahnya (atap rendah, pita warna merah-kuning-biru)
    const m = new THREE.Group();
    m.position.set(J.im.x, J.y - 0.02, J.im.z); m.rotation.y = J.rot;
    const MW = 26, MD = 14;
    box(m, MW, 4.6, MD, std({ color: lin(0xefeee9) }), 0, 2.3, 0);
    box(m, MW + 0.4, 0.35, MD + 2, std({ color: lin(0xdedcd5) }), 0, 4.75, 0.9);
    const stripe = cv(512, 64, (c, w, h) => { c.fillStyle = '#f3f1ea'; c.fillRect(0, 0, w, h);
      [['#d6312d', 10], ['#f2c12e', 24], ['#2b4fa8', 38], ['#ef8a23', 50]].forEach(([col, y]) => { c.fillStyle = col; c.fillRect(0, y, w, 7); }); });
    plane(m, MW + 0.4, 1.6, new THREE.MeshBasicMaterial({ map: stripe, color: grey.clone().multiplyScalar(glow) }), 0, 4.0, MD / 2 + 1.92);
    const shop = cv(512, 128, (c, w, h) => { c.fillStyle = '#2a3a3a'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 12; i++) { c.fillStyle = ['#e6e6e6', '#45b649', '#f2c12e', '#2b4fa8'][i % 4]; c.fillRect(8 + i * 42, 30, 30, 70); }
      c.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) c.fillRect(i * 86, 0, 6, h); });
    plane(m, MW - 2, 3, new THREE.MeshStandardMaterial({ map: shop, emissiveMap: shop, emissive: 0xffffff, emissiveIntensity: night ? 0.9 : 0.25, color: grey }), 0, 1.6, MD / 2 + 0.02);
    for (let i = -2; i <= 2; i++) box(m, 0.4, 3.5, 0.4, std({ color: lin(0xf3f1ea) }), i * (MW / 4.4), 1.75, MD / 2 + 1.7);
    // papan nama berdiri di tepi jalan
    const logo = cv(512, 256, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      [['#d6312d', 0], ['#f2c12e', 22]].forEach(([col, y]) => { c.fillStyle = col; c.fillRect(0, y, w, 16); });
      c.fillStyle = '#2b4fa8'; c.fillRect(0, 196, w, 60);
      c.fillStyle = '#c8282b'; c.font = 'italic bold 92px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Indomaret', w / 2, 116);
      c.fillStyle = '#fff'; c.font = 'bold 34px Arial'; c.fillText('24 JAM', w / 2, 226); });
    const sg = new THREE.Group(); sg.position.set(-sgn * (MW / 2 - 1), 0, MD / 2 + 6.5); m.add(sg);
    box(sg, 0.25, 6.5, 0.25, World.metalMat, -1.9, 3.25, 0); box(sg, 0.25, 6.5, 0.25, World.metalMat, 1.9, 3.25, 0);
    const lb = new THREE.MeshBasicMaterial({ map: logo, side: THREE.DoubleSide, color: grey.clone().multiplyScalar(glow) });
    plane(sg, 4.4, 2.2, lb, 0, 5.5, 0.15);
    const apr2 = new THREE.Mesh(new THREE.PlaneGeometry(MW + 2, 9), std({ map: pav, color: grey }));
    apr2.rotation.x = -Math.PI / 2; apr2.position.set(0, 0.21, MD / 2 + 4.5); apr2.receiveShadow = shadows; m.add(apr2);
    scene.add(m);
  },

  // ---------------- TAMAN SIMPANG BALAPAN (dari foto): taman bundar berpagar tanaman, patung di tengah
  _tamanBalapan(scene, dark, shadows, night) {
    const T = this.balapan, R = T.R;
    const K = this._kit(dark, shadows), { lin, std, cv, grey } = K;
    const g = new THREE.Group();
    g.position.set(T.x, T.y0 - 0.05, T.z);
    const add = (m, cast = true) => { m.castShadow = shadows && cast; m.receiveShadow = shadows; g.add(m); return m; };
    const noise = (c, w, h, col, n, a) => { for (let k = 0; k < n; k++) { c.fillStyle = col.replace('A', (Math.random() * a).toFixed(2)); c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 0, 7); c.fill(); } };
    // arah ke Ijen Computer (untuk menghadapkan tulisan & patung)
    const J = this.ijen;
    const face = J ? Math.atan2(J.ic.x - T.x, J.ic.z - T.z) : 0;
    // bibir belang hitam-putih
    const stripe = cv(256, 32, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#26282b' : '#ecece6'; c.fillRect(i * 32, 0, 32, h); } }, true);
    stripe.repeat.set(Math.round(R * 1.2), 1);
    add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.32, 96, 1, true).translate(0, 0.16, 0), std({ map: stripe, color: grey, side: THREE.DoubleSide })), false);
    // jalur paving melingkar
    const pave = cv(128, 128, (c, w, h) => { c.fillStyle = '#a9a69f'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(50,50,50,0.3)'; c.lineWidth = 2;
      for (let i = 0; i <= 128; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); } }, true);
    pave.repeat.set(R, R);
    const walk = add(new THREE.Mesh(new THREE.RingGeometry(R - 2.4, R, 96), std({ map: pave, color: grey })), false);
    walk.rotation.x = -Math.PI / 2; walk.position.y = 0.32;
    // bibir dalam dicat biru muda
    add(new THREE.Mesh(new THREE.CylinderGeometry(R - 2.4, R - 2.4, 0.55, 96, 1, true).translate(0, 0.27, 0), std({ color: lin(0x9cc3d6), side: THREE.DoubleSide })), false);
    // rumput
    const lawn = add(new THREE.Mesh(new THREE.CircleGeometry(R - 2.4, 96), std({ color: lin(0x5f8a3a) })), false);
    lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.5;
    // pagar tanaman melingkar dengan 4 celah masuk
    const hedgeM = std({ color: lin(0x3f6e2c), roughness: 0.95 });
    const nH = Math.round((2 * Math.PI * (R - 3.1)) / 1.4);
    const gaps = [face, face + Math.PI / 2, face + Math.PI, face - Math.PI / 2];
    const hedge = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.0, 1.1), hedgeM, nH);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    let hn = 0;
    for (let i = 0; i < nH; i++) {
      const a = (i / nH) * Math.PI * 2;
      const ang = Math.atan2(Math.sin(a), Math.cos(a));
      if (gaps.some((gp) => Math.abs(U.angDiff(Math.atan2(Math.sin(a), Math.cos(a)), Math.atan2(Math.cos(gp), Math.sin(gp)))) < 0.075)) continue;
      q.setFromAxisAngle(Y, -a + Math.PI / 2);
      mm.compose(v.set(Math.cos(ang) * (R - 3.1), 1.0, Math.sin(ang) * (R - 3.1)), q, one); hedge.setMatrixAt(hn++, mm);
    }
    hedge.count = hn; hedge.castShadow = shadows; g.add(hedge);
    // bounding sphere seluas taman (bawaan r128 = kotak dasar di pusat → bisa hilang saat pusat taman di luar layar)
    const ring = (im, y) => { im.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, y, 0), R + 1); };
    ring(hedge, 1);
    // jalan setapak dari celah depan ke patung
    for (const gp of gaps) {
      const path = add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, R - 7), std({ map: pave, color: grey })), false);
      path.rotation.x = -Math.PI / 2; path.rotation.z = gp + Math.PI; path.position.set(Math.sin(gp) * (R + 4) / 2, 0.53, Math.cos(gp) * (R + 4) / 2);
    }
    // bedeng bunga (merah, kuning, ungu, jingga) & semak berbentuk kerucut
    let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const bedCols = [0xb8322a, 0xd8b52a, 0x7a3a7a, 0xd8742a, 0x9a2a3a, 0x6f9a3a].map(lin);
    const beds = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.35, 14), std({ roughness: 1, color: new THREE.Color(1, 1, 1) }), 22);
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2, r = 7.5 + rnd() * (R - 12);
      q.setFromAxisAngle(Y, rnd() * 3);
      mm.compose(v.set(Math.cos(a) * r, 0.62, Math.sin(a) * r), q, new THREE.Vector3(1.6 + rnd() * 2.2, 1, 0.8 + rnd() * 1.2)); beds.setMatrixAt(i, mm); beds.setColorAt(i, bedCols[i % bedCols.length]);
    }
    beds.receiveShadow = shadows; ring(beds, 0.6); g.add(beds);
    const topi = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 2.2, 8).translate(0, 1.1, 0), std({ flatShading: true, color: new THREE.Color(1, 1, 1) }), 30);
    const topiCols = [0x4f7f30, 0x8a4a2a, 0x5c8a34, 0x9c5a2a].map(lin);
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + rnd() * 0.1, r = i % 2 ? R - 4.6 : 6 + rnd() * (R - 11);
      const sc = 0.7 + rnd() * 0.6;
      mm.compose(v.set(Math.cos(a) * r, 0.5, Math.sin(a) * r), q.identity(), new THREE.Vector3(sc, sc, sc)); topi.setMatrixAt(i, mm); topi.setColorAt(i, topiCols[i % 4]);
    }
    topi.castShadow = shadows; ring(topi, 1.5); g.add(topi);
    // palem kecil & cemara norfolk (tinggi meruncing)
    const trunkM = std({ color: lin(0x8d8577) }), palmM = std({ color: lin(0x4f8a3a), side: THREE.DoubleSide, flatShading: true });
    for (let i = 0; i < 8; i++) {
      const a = rnd() * Math.PI * 2, r = 6 + rnd() * (R - 10), h = 4 + rnd() * 2.5;
      const t = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, h, 6).translate(0, h / 2, 0), trunkM)); t.position.set(Math.cos(a) * r, 0.5, Math.sin(a) * r);
      for (let k = 0; k < 7; k++) {
        const f = add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.4).translate(0, 1.2, 0), palmM), false);
        f.position.set(t.position.x, 0.5 + h, t.position.z); f.rotation.set(1.0 + rnd() * 0.3, (k / 7) * Math.PI * 2, 0, 'YXZ');
      }
    }
    const pineM = std({ color: lin(0x2f5a2c), flatShading: true });
    for (let i = 0; i < 5; i++) {
      const a = face + Math.PI + (i - 2) * 0.45, r = R - 6;
      const px = Math.sin(a) * r, pz = Math.cos(a) * r, H = 13 + rnd() * 5;
      const t = add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.25, H, 6).translate(0, H / 2, 0), trunkM)); t.position.set(px, 0.5, pz);
      for (let k = 0; k < 6; k++) {
        const c = add(new THREE.Mesh(new THREE.ConeGeometry(2.3 - k * 0.33, 2.6, 7), pineM));
        c.position.set(px, 0.5 + H * 0.3 + k * (H * 0.12), pz);
      }
    }
    // gundukan rumput, alas & patung (gaya sederhana, warna tembaga kemerahan)
    const mound = add(new THREE.Mesh(new THREE.SphereGeometry(6, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.22, 1), std({ color: lin(0x6c9a3e) })), false);
    mound.position.y = 0.45;
    const st = new THREE.Group(); st.position.set(0, 1.75, 0); st.rotation.y = face; g.add(st);
    const stone = std({ color: lin(0x8f8a80) });
    const ped = new THREE.Mesh(new THREE.BoxGeometry(2, 2.2, 2).translate(0, 1.1, 0), stone); ped.castShadow = shadows; st.add(ped);
    const bronze = std({ color: lin(0xb4643e), metalness: 0.35, roughness: 0.55 });
    const part = (geo, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, bronze); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = shadows; st.add(m); return m; };
    const b0 = 2.2, S = 1.9; // figur ± 3,6 m di atas alas 2,2 m
    part(new THREE.CylinderGeometry(0.12 * S, 0.1 * S, 0.95 * S, 8).translate(0, -0.47 * S, 0), -0.14 * S, b0 + 0.95 * S, 0.02, 0, 0.04);
    part(new THREE.CylinderGeometry(0.12 * S, 0.1 * S, 0.95 * S, 8).translate(0, -0.47 * S, 0), 0.14 * S, b0 + 0.95 * S, -0.04, 0, -0.04);
    part(new THREE.CylinderGeometry(0.24 * S, 0.17 * S, 0.75 * S, 10), 0, b0 + 1.32 * S, 0);
    part(new THREE.SphereGeometry(0.13 * S, 12, 10), 0, b0 + 1.86 * S, 0.01);
    part(new THREE.CylinderGeometry(0.06 * S, 0.05 * S, 0.7 * S, 8).translate(0, -0.35 * S, 0), -0.3 * S, b0 + 1.62 * S, 0, 0, -0.15);
    part(new THREE.CylinderGeometry(0.06 * S, 0.05 * S, 0.7 * S, 8).translate(0, -0.35 * S, 0), 0.3 * S, b0 + 1.62 * S, 0, -0.35, 0.12);
    part(new THREE.CylinderGeometry(0.03, 0.03, 2.0 * S, 6), 0.42 * S, b0 + 0.75 * S, 0.22, 0.15, 0); // tongkat
    // tulisan merah "SIMPANG BALAPAN" di tepi depan (menghadap Jl. Ijen)
    const sign = cv(1024, 160, (c, w, h) => { c.clearRect(0, 0, w, h); c.font = 'bold 100px Georgia, "Times New Roman", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 8; c.strokeStyle = '#5a0f0f'; c.strokeText('SIMPANG BALAPAN', w / 2, h / 2 + 6, w - 30); c.fillStyle = '#c62a22'; c.fillText('SIMPANG BALAPAN', w / 2, h / 2 + 6, w - 30); });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.7), new THREE.MeshStandardMaterial({ map: sign, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: grey, emissive: 0x551010, emissiveIntensity: night ? 0.6 : 0 }));
    const sr = R - 1.85; sm.position.set(Math.sin(face + 0.3) * sr, 1.25, Math.cos(face + 0.3) * sr); sm.rotation.y = face + 0.3; g.add(sm);
    // lampu taman bola putih
    const lampM = new THREE.MeshBasicMaterial({ color: night ? 0xfff6dd : 0xe8e8e0 });
    for (let i = 0; i < 6; i++) {
      const a = face + 0.6 + i * (Math.PI / 3), r = R - 5;
      const lp = add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6).translate(0, 1.3, 0), World.metalMat), false); lp.position.set(Math.sin(a) * r, 0.5, Math.cos(a) * r);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), lampM); ball.position.set(lp.position.x, 3.2, lp.position.z); g.add(ball);
    }
    if (night && World.quality !== 'low') { const L = new THREE.PointLight(0xffe2b0, 1.4, 30, 2); L.position.set(0, 6, 0); g.add(L); }
    scene.add(g);
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
  // hanya potongan peta yang terlihat di kanvas tujuan yang digambar (minimap: ±500×500 px,
  // bukan seluruh peta ±2400×3750 px tiap frame); API tetap drawMap(ctx) dengan transform dunia
  drawMap(c) {
    const B = this.bounds, M = this.map, kx = (B.x1 - B.x0) / M.width, kz = (B.z1 - B.z0) / M.height;
    let sx = 0, sy = 0, ex = M.width, ey = M.height;
    const inv = c.getTransform && c.canvas ? c.getTransform().invertSelf() : null;
    if (inv && isFinite(inv.a) && isFinite(inv.e)) {
      const W = c.canvas.width, H = c.canvas.height;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      [[0, 0], [W, 0], [0, H], [W, H]].forEach(([u, v]) => {
        const x = inv.a * u + inv.c * v + inv.e, z = inv.b * u + inv.d * v + inv.f;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      });
      sx = U.clamp(Math.floor((x0 - B.x0) / kx) - 2, 0, M.width); ex = U.clamp(Math.ceil((x1 - B.x0) / kx) + 2, 0, M.width);
      sy = U.clamp(Math.floor((z0 - B.z0) / kz) - 2, 0, M.height); ey = U.clamp(Math.ceil((z1 - B.z0) / kz) + 2, 0, M.height);
      if (ex <= sx || ey <= sy) return;
    }
    c.drawImage(M, sx, sy, ex - sx, ey - sy, B.x0 + sx * kx, B.z0 + sy * kz, (ex - sx) * kx, (ey - sy) * kz);
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

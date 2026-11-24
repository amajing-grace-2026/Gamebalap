/* =========================================================================
   LALU LINTAS KOTA (lajur kiri), PARTIKEL, dan TABRAKAN ANTAR-MOBIL
   ========================================================================= */
const Traffic = {
  cars: [],
  LANE: 5,
  DIRS: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  COLORS: ['#9aa3ad', '#f2f2f2', '#2b2f36', '#4a0d1a', '#0d3b2e', '#6b5a3e', '#1d2c4d', '#c9c2a8', '#d9b400', '#3c3c44'],

  spawn(scene, count, avoid) {
    this.clear(scene);
    const models = ['pixel', 'rondo', 'vespera', 'van', 'orion', 'rondo', 'bus', 'pixel', 'kitsune', 'rondo'];
    let tries = 0;
    while (this.cars.length < count && tries++ < 200) {
      const i = U.randi(0, World.N), j = U.randi(0, World.N);
      const n = World.node(i, j);
      if (avoid && Math.hypot(n.x - avoid.x, n.z - avoid.z) < 60) continue;
      const opts = this.DIRS.filter((d) => this._valid(i + d[0], j + d[1]));
      const d = U.pick(opts);
      const model = U.pick(models);
      const color = model === 'pixel' && Math.random() < 0.4 ? '#d9b400' : U.pick(this.COLORS);
      const entry = { model, up: {}, style: Object.assign(DATA.defaultStyle(color), { finish: 'gloss', rim: '#777777', tint: 2 }) };
      const mesh = CarFactory.build(entry, { lite: true });
      scene.add(mesh);
      const sh = DATA.carById(model).shape;
      const c = {
        mesh, ud: mesh.userData, x: n.x, z: n.z, h: 0, vx: 0, vz: 0,
        speed: 0, cruise: model === 'bus' ? 10 : U.rand(11, 16), stun: 0, honk: 0,
        node: [i, j], dir: d, seg: null, s: Math.random() * 60,
        circles: sh.len > 6 ? [-1, 0, 1] : [-1, 1], cOff: sh.len / 2 - sh.wid / 2, cRad: sh.wid / 2 + 0.1,
        wheelRot: 0, len: sh.len,
      };
      this._straight(c);
      this.cars.push(c);
    }
  },
  clear(scene) {
    this.cars.forEach((c) => { scene.remove(c.mesh); CarFactory.dispose(c.mesh); });
    this.cars = [];
  },
  _valid(i, j) { return i >= 0 && j >= 0 && i <= World.N && j <= World.N; },
  _left(d) { return [d[1], -d[0]]; },
  _straight(c) {
    const H = World.W / 2, off = this.LANE;
    const A = World.node(c.node[0], c.node[1]);
    const L = this._left(c.dir);
    const p0 = [A.x + c.dir[0] * H + L[0] * off, A.z + c.dir[1] * H + L[1] * off];
    const p1 = [A.x + c.dir[0] * (World.P - H) + L[0] * off, A.z + c.dir[1] * (World.P - H) + L[1] * off];
    c.seg = { type: 'line', p0, p1, len: World.P - 2 * H };
  },
  _turn(c) {
    const H = World.W / 2, off = this.LANE;
    const bi = c.node[0] + c.dir[0], bj = c.node[1] + c.dir[1];
    const B = World.node(bi, bj);
    let opts = this.DIRS.filter((d) => !(d[0] === -c.dir[0] && d[1] === -c.dir[1]) && this._valid(bi + d[0], bj + d[1]));
    if (!opts.length) opts = [[-c.dir[0], -c.dir[1]]];
    let d2 = U.pick(opts);
    if (Math.random() < 0.45 && opts.some((d) => d[0] === c.dir[0] && d[1] === c.dir[1])) d2 = c.dir;
    const L1 = this._left(c.dir), L2 = this._left(d2);
    const p0 = [B.x - c.dir[0] * H + L1[0] * off, B.z - c.dir[1] * H + L1[1] * off];
    const p2 = [B.x + d2[0] * H + L2[0] * off, B.z + d2[1] * H + L2[1] * off];
    let ctrl;
    if (d2[0] === c.dir[0] && d2[1] === c.dir[1]) ctrl = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
    else if (d2[0] === -c.dir[0] && d2[1] === -c.dir[1]) ctrl = [B.x + c.dir[0] * 4, B.z + c.dir[1] * 4];
    else ctrl = [B.x + L1[0] * off + L2[0] * off, B.z + L1[1] * off + L2[1] * off];
    let len = 0, px = p0[0], pz = p0[1];
    for (let k = 1; k <= 10; k++) {
      const q = this._bez(p0, ctrl, p2, k / 10);
      len += Math.hypot(q[0] - px, q[1] - pz); px = q[0]; pz = q[1];
    }
    c.seg = { type: 'curve', p0, c: ctrl, p2, len: Math.max(1, len) };
    c.node = [bi, bj];
    c.dir = d2;
  },
  _bez(p0, c, p2, t) {
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]];
  },
  _pose(c) {
    const sg = c.seg, t = U.clamp(c.s / sg.len, 0, 1);
    if (sg.type === 'line') {
      return { x: U.lerp(sg.p0[0], sg.p1[0], t), z: U.lerp(sg.p0[1], sg.p1[1], t), tx: sg.p1[0] - sg.p0[0], tz: sg.p1[1] - sg.p0[1] };
    }
    const q = this._bez(sg.p0, sg.c, sg.p2, t);
    const u = 1 - t;
    const tx = 2 * u * (sg.c[0] - sg.p0[0]) + 2 * t * (sg.p2[0] - sg.c[0]);
    const tz = 2 * u * (sg.c[1] - sg.p0[1]) + 2 * t * (sg.p2[1] - sg.c[1]);
    return { x: q[0], z: q[1], tx, tz };
  },

  // mobil yang terlalu jauh dipindah ke sekitar pemain, agar jalan sekitar tidak sepi
  _recycle(p) {
    for (const c of this.cars) {
      if (Math.hypot(c.x - p.x, c.z - p.z) < 340) continue;
      for (let k = 0; k < 12; k++) {
        const i = U.randi(0, World.N), j = U.randi(0, World.N);
        const n = World.node(i, j);
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (d < 110 || d > 280) continue;
        const opts = this.DIRS.filter((dd) => this._valid(i + dd[0], j + dd[1]));
        c.node = [i, j]; c.dir = U.pick(opts); c.s = 0; c.speed = c.cruise * 0.6; c.stun = 0;
        this._straight(c);
        break;
      }
      break; // satu per panggilan
    }
  },
  update(dt, obstacles) {
    const cars = this.cars;
    this._rt = (this._rt || 0) - dt;
    if (this._rt <= 0 && obstacles[0]) { this._rt = 0.5; this._recycle(obstacles[0]); }
    for (const c of cars) {
      let target = c.cruise;
      if (c.stun > 0) { c.stun -= dt; target = 0; } else {
        const fx = Math.sin(c.h), fz = Math.cos(c.h);
        const check = (o) => {
          const rx = o.x - c.x, rz = o.z - c.z;
          const ahead = rx * fx + rz * fz;
          if (ahead <= 0 || ahead > 16) return;
          const lat = Math.abs(rx * fz - rz * fx);
          if (lat < 2.8) target = Math.min(target, Math.max(0, (ahead - 6.5) * 1.6));
        };
        obstacles.forEach(check);
        cars.forEach((o) => { if (o !== c) check(o); });
        // patuhi lampu lalu lintas di simpang berikutnya
        if (c.seg.type === 'line') {
          const remain = c.seg.len - c.s;
          const bi = c.node[0] + c.dir[0], bj = c.node[1] + c.dir[1];
          if (remain < 32 && remain > 0.5 && TrafficLights.hasLight(bi, bj)) {
            const st = TrafficLights.state(c.dir[0] !== 0 ? 'ew' : 'ns');
            if (st === 'r' || (st === 'y' && remain > 9)) target = Math.min(target, Math.max(0, (remain - 1.5) * 1.1));
          }
        }
      }
      c.speed += U.clamp(target - c.speed, -14 * dt, 4 * dt);
      c.s += c.speed * dt;
      let guard = 0;
      while (c.s >= c.seg.len && guard++ < 4) {
        c.s -= c.seg.len;
        if (c.seg.type === 'line') this._turn(c); else this._straight(c);
      }
      const p = this._pose(c);
      c.x = p.x; c.z = p.z;
      const tl = Math.hypot(p.tx, p.tz) || 1;
      c.h = Math.atan2(p.tx / tl, p.tz / tl);
      c.vx = (p.tx / tl) * c.speed; c.vz = (p.tz / tl) * c.speed;
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.h;
      c.wheelRot += (c.speed / c.ud.wr) * dt;
      c.ud.wheels.forEach((w) => { w.spin.rotation.x = c.wheelRot; });
      c.ud.tailMat.color.setHex(target < c.speed - 0.5 ? 0xff1030 : 0x8a0010);
      if (c.honk > 0) c.honk -= dt;
    }
  },
};

/* ---------------- LAMPU LALU LINTAS ----------------
   Semua simpang (>=3 cabang) punya lampu. Fase global:
   Utara-Selatan hijau 10 dtk → kuning 2 → merah semua 1 → Timur-Barat hijau 10 → kuning 2 → merah 1 */
const TrafficLights = {
  CYCLE: 26,
  t: 0,
  build(scene) {
    const N = World.N, P = World.P, H = World.W / 2;
    const pole = new GeoBatch();
    const lamps = { ns: { r: new GeoBatch(), y: new GeoBatch(), g: new GeoBatch() }, ew: { r: new GeoBatch(), y: new GeoBatch(), g: new GeoBatch() } };
    const valid = (i, j) => i >= 0 && j >= 0 && i <= N && j <= N;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        let roads = 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { if (valid(i + a, j + b)) roads++; });
        if (roads < 3) continue;
        const cx = i * P, cz = j * P;
        [[1, 1], [-1, -1], [1, -1], [-1, 1]].forEach(([sx, sz]) => {
          // lajur kiri: tiang di sudut (sx,sz) melayani arus dari arah x (jika sx==sz) atau z
          const ew = sx === sz;
          const from = ew ? [i + sx, j] : [i, j + sz];
          if (!valid(from[0], from[1])) return;
          const bi = i + (sx > 0 ? 0 : -1), bj = j + (sz > 0 ? 0 : -1);
          if (bi < 0 || bj < 0 || bi >= N || bj >= N) return; // sudut tanpa trotoar
          const px = cx + sx * (H + 1.2), pz = cz + sz * (H + 1.2);
          pole.box(px, 2.9, pz, 0.22, 5.8, 0.22);
          // kepala lampu menghadap arus yang datang
          const fx = ew ? sx : 0, fz = ew ? 0 : sz;
          const hx = px - (ew ? 0 : sx) * 0, hz = pz;
          const back = [hx + fx * 0.05, hz + fz * 0.05];
          pole.box(back[0], 5.0, back[1], ew ? 0.3 : 0.55, 1.7, ew ? 0.55 : 0.3);
          const L = lamps[ew ? 'ew' : 'ns'];
          const ox = back[0] + fx * 0.17, oz = back[1] + fz * 0.17;
          L.r.box(ox, 5.55, oz, ew ? 0.06 : 0.36, 0.36, ew ? 0.36 : 0.06);
          L.y.box(ox, 5.05, oz, ew ? 0.06 : 0.36, 0.36, ew ? 0.36 : 0.06);
          L.g.box(ox, 4.55, oz, ew ? 0.06 : 0.36, 0.36, ew ? 0.36 : 0.06);
          // garis henti di jalan
        });
      }
    }
    scene.add(new THREE.Mesh(pole.build(), new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6, metalness: 0.5 })));
    this.mats = {};
    const cols = { r: [3, 0.15, 0.1], y: [3, 1.8, 0.1], g: [0.2, 3, 0.6] };
    ['ns', 'ew'].forEach((ax) => {
      this.mats[ax] = {};
      ['r', 'y', 'g'].forEach((k) => {
        const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(...cols[k]) });
        this.mats[ax][k] = m;
        if (lamps[ax][k].count) scene.add(new THREE.Mesh(lamps[ax][k].build(), m));
      });
    });
    this.update(0);
  },
  // status untuk sumbu 'ns' (bergerak di sumbu z) atau 'ew' (sumbu x): 'g' | 'y' | 'r'
  state(ax) {
    const t = this.t % this.CYCLE;
    const local = ax === 'ns' ? t : (t + 13) % this.CYCLE;
    if (local < 10) return 'g';
    if (local < 12) return 'y';
    return 'r';
  },
  update(dt) {
    this.t += dt;
    if (!this.mats) return;
    ['ns', 'ew'].forEach((ax) => {
      const s = this.state(ax);
      const on = { r: [3, 0.15, 0.1], y: [3, 1.8, 0.1], g: [0.2, 3, 0.6] };
      ['r', 'y', 'g'].forEach((k) => {
        const c = on[k], f = s === k ? 1 : 0.08;
        this.mats[ax][k].color.setRGB(c[0] * f, c[1] * f, c[2] * f);
      });
    });
  },
  hasLight(i, j) {
    const N = World.N;
    let roads = 0;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => { const x = i + a, y = j + b; if (x >= 0 && y >= 0 && x <= N && y <= N) roads++; });
    return roads >= 3;
  },
};

/* ---------------- tabrakan mobil vs mobil ---------------- */
function collideCars(a, b, bKinematic) {
  let maxV = 0;
  const afx = Math.sin(a.h), afz = Math.cos(a.h);
  const bfx = Math.sin(b.h), bfz = Math.cos(b.h);
  if (Math.abs(a.x - b.x) > 9 || Math.abs(a.z - b.z) > 9) return 0;
  for (const ka of a.circles) {
    for (const kb of b.circles) {
      const ax = a.x + afx * a.cOff * ka, az = a.z + afz * a.cOff * ka;
      const bx = b.x + bfx * b.cOff * kb, bz = b.z + bfz * b.cOff * kb;
      const dx = ax - bx, dz = az - bz;
      const d = Math.hypot(dx, dz);
      const minD = a.cRad + b.cRad;
      if (d < minD && d > 1e-4) {
        const nx = dx / d, nz = dz / d, pen = minD - d;
        if (bKinematic) { a.x += nx * pen; a.z += nz * pen; } else {
          a.x += nx * pen / 2; a.z += nz * pen / 2; b.x -= nx * pen / 2; b.z -= nz * pen / 2;
        }
        const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (vn < 0) {
          const e = 0.35;
          if (bKinematic) {
            const j = -(1 + e) * vn;
            a.vx += j * nx; a.vz += j * nz;
          } else {
            const j = -(1 + e) * vn / 2;
            a.vx += j * nx; a.vz += j * nz; b.vx -= j * nx; b.vz -= j * nz;
            if (b.w !== undefined) b.w += (bfx * nz - bfz * nx) * kb * 0.08 * -vn;
          }
          if (a.w !== undefined) a.w += (afx * nz - afz * nx) * ka * 0.08 * -vn;
          maxV = Math.max(maxV, -vn);
        }
      }
    }
  }
  return maxV;
}

/* ---------------- partikel: asap ban & percikan ---------------- */
const FX = {
  pool: [],
  init(scene) {
    const smokeTex = Tex.radial('rgba(200,200,220,0.55)', 'rgba(200,200,220,0)', 64);
    const sparkTex = Tex.radial('rgba(255,220,120,1)', 'rgba(255,120,0,0)', 32);
    for (let i = 0; i < 180; i++) {
      const spark = i >= 150;
      const m = new THREE.SpriteMaterial({ map: spark ? sparkTex : smokeTex, transparent: true, depthWrite: false, blending: spark ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: 0 });
      const s = new THREE.Sprite(m);
      s.visible = false;
      scene.add(s);
      this.pool.push({ s, m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, spark, size: 1 });
    }
    this.next = 0; this.nextSpark = 150;
  },
  smoke(x, z, amount, tint) {
    if (!this.pool.length) return;
    const p = this.pool[this.next];
    this.next = this.next + 1 >= 150 ? 0 : this.next + 1;
    p.s.position.set(x + U.rand(-0.3, 0.3), 0.4 + World.heightAt(x, z), z + U.rand(-0.3, 0.3));
    p.vx = U.rand(-0.8, 0.8); p.vy = U.rand(0.6, 1.4); p.vz = U.rand(-0.8, 0.8);
    p.life = p.max = 1.2 + amount;
    p.size = 1.2 + amount;
    p.m.color.set(tint || 0xffffff);
    p.s.visible = true;
  },
  sparks(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const p = this.pool[this.nextSpark];
      this.nextSpark = this.nextSpark + 1 >= 180 ? 150 : this.nextSpark + 1;
      p.s.position.set(x, y, z);
      p.vx = U.rand(-7, 7); p.vy = U.rand(1, 6); p.vz = U.rand(-7, 7);
      p.life = p.max = U.rand(0.25, 0.6);
      p.size = 0.35;
      p.s.visible = true;
    }
  },
  update(dt) {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = p.life / p.max;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      if (p.spark) { p.vy -= 18 * dt; p.m.opacity = k; p.s.scale.setScalar(p.size); } else {
        p.m.opacity = k * 0.5;
        const sc = p.size * (1 + (1 - k) * 3);
        p.s.scale.set(sc, sc, 1);
      }
    }
  },
  clear() { this.pool.forEach((p) => { p.life = 0; p.s.visible = false; }); },
};

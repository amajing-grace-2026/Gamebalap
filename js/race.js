/* =========================================================================
   SISTEM BALAP: lintasan, AI lawan, Sirkuit / Sprint / Drift / Drag
   ========================================================================= */
class Path {
  constructor(pts, closed) {
    this.pts = pts; this.closed = closed;
    this.cum = [0];
    const n = pts.length;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      this.cum.push(this.cum[i] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.cum[segs];
    this.segs = segs;
  }
  _norm(s) {
    if (this.closed) return U.mod(s, this.length);
    return U.clamp(s, 0, this.length - 0.001);
  }
  _seg(s) {
    let lo = 0, hi = this.segs - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  pointAt(s) {
    s = this._norm(s);
    const i = this._seg(s);
    const a = this.pts[i], b = this.pts[(i + 1) % this.pts.length];
    const l = this.cum[i + 1] - this.cum[i] || 1;
    const t = (s - this.cum[i]) / l;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
  }
  dirAt(s) {
    s = this._norm(s);
    const i = this._seg(s);
    const a = this.pts[i], b = this.pts[(i + 1) % this.pts.length];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  }
  // proyeksikan posisi ke lintasan; hint = segmen terakhir (pencarian lokal)
  project(x, z, hint) {
    let best = Infinity, bs = 0, bseg = 0, blat = 0;
    const n = this.pts.length;
    const test = (i) => {
      const a = this.pts[i], b = this.pts[(i + 1) % n];
      const dx = b.x - a.x, dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const t = U.clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
      const px = a.x + dx * t, pz = a.z + dz * t;
      const d = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d < best) {
        best = d; bseg = i; bs = this.cum[i] + Math.sqrt(l2) * t;
        const l = Math.sqrt(l2);
        blat = ((x - a.x) * (dz / l) - (z - a.z) * (dx / l));
      }
    };
    if (hint == null || hint < 0) { for (let i = 0; i < this.segs; i++) test(i); } else {
      for (let k = -4; k <= 8; k++) {
        let i = hint + k;
        if (this.closed) i = U.mod(i, this.segs); else if (i < 0 || i >= this.segs) continue;
        test(i);
      }
    }
    return { s: bs, seg: bseg, dist: Math.sqrt(best), lat: blat };
  }
}

// Bangun titik lintasan dari daftar simpang, dengan tikungan dibulatkan
function buildRoute(ev) {
  // peta Malang: lintasan sudah berupa titik rapat di sepanjang jalan asli
  if (ev.path) return { path: new Path(ev.path.map((p) => ({ x: p[0], z: p[1] })), ev.loop), barriers: [], nodes: [] };
  const nodes = [];
  let wp;
  if (ev.points) {
    wp = ev.points.map((p) => ({ x: p[0], z: p[1] }));
  } else {
    const corners = ev.route;
    const n = corners.length;
    const segCount = ev.loop ? n : n - 1;
    for (let k = 0; k < segCount; k++) {
      const a = corners[k], b = corners[(k + 1) % n];
      const di = Math.sign(b[0] - a[0]), dj = Math.sign(b[1] - a[1]);
      let i = a[0], j = a[1];
      while (i !== b[0] || j !== b[1]) { nodes.push([i, j]); i += di; j += dj; }
    }
    if (!ev.loop) nodes.push(corners[n - 1]);
    wp = nodes.map((nd) => World.node(nd[0], nd[1]));
    if (ev.tail) wp = wp.concat(ev.tail.map((p) => ({ x: p[0], z: p[1] })));
  }
  // titik halus (tikungan dibulatkan)
  const R = 11;
  const pts = [];
  const nw = wp.length;
  for (let k = 0; k < nw; k++) {
    const p = wp[k];
    const hasPrev = ev.loop || k > 0, hasNext = ev.loop || k < nw - 1;
    if (hasPrev && hasNext) {
      const pv = wp[U.mod(k - 1, nw)], nx = wp[(k + 1) % nw];
      const l1 = Math.hypot(p.x - pv.x, p.z - pv.z) || 1, l2 = Math.hypot(nx.x - p.x, nx.z - p.z) || 1;
      const din = [(p.x - pv.x) / l1, (p.z - pv.z) / l1];
      const dout = [(nx.x - p.x) / l2, (nx.z - p.z) / l2];
      if (din[0] * dout[0] + din[1] * dout[1] < 0.999) {
        const a = { x: p.x - din[0] * R, z: p.z - din[1] * R };
        const b = { x: p.x + dout[0] * R, z: p.z + dout[1] * R };
        for (let t = 0; t <= 6; t++) {
          const u = t / 6, v = 1 - u;
          pts.push({ x: v * v * a.x + 2 * v * u * p.x + u * u * b.x, z: v * v * a.z + 2 * v * u * p.z + u * u * b.z });
        }
        continue;
      }
    }
    pts.push({ x: p.x, z: p.z });
  }
  const nn = nodes.length;
  // barikade di cabang yang tidak dipakai
  const H = World.W / 2;
  const used = {};
  const key = (i, j) => i + ',' + j;
  for (let k = 0; k < nn; k++) {
    const kk = key(nodes[k][0], nodes[k][1]);
    used[kk] = used[kk] || [];
    if (ev.loop || k > 0) { const pv = nodes[U.mod(k - 1, nn)]; used[kk].push([Math.sign(pv[0] - nodes[k][0]), Math.sign(pv[1] - nodes[k][1])]); }
    if (ev.loop || k < nn - 1) { const nx = nodes[(k + 1) % nn]; used[kk].push([Math.sign(nx[0] - nodes[k][0]), Math.sign(nx[1] - nodes[k][1])]); }
  }
  const barriers = [];
  Object.keys(used).forEach((kk) => {
    const [i, j] = kk.split(',').map(Number);
    const p = World.node(i, j);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((d) => {
      if (used[kk].some((u) => u[0] === d[0] && u[1] === d[1])) return;
      const ni = i + d[0], nj = j + d[1];
      if (ni < 0 || nj < 0 || ni > World.N || nj > World.N) return;
      const cx = p.x + d[0] * (H + 0.8), cz = p.z + d[1] * (H + 0.8);
      if (d[0] !== 0) barriers.push({ x0: cx - 0.5, x1: cx + 0.5, z0: cz - H, z1: cz + H });
      else barriers.push({ x0: cx - H, x1: cx + H, z0: cz - 0.5, z1: cz + 0.5 });
    });
  });
  return { path: new Path(pts, ev.loop), barriers, nodes };
}

/* ---------------------------- AI PEMBALAP ---------------------------- */
class AIDriver {
  constructor(veh, race, lane, skill) {
    this.v = veh; this.race = race; this.lane = lane; this.baseLane = lane; this.skill = skill;
    this.stuck = 0; this.laneTimer = 0;
    this.shiftAt = U.rand(0.88, 0.95);
  }
  update(dt) {
    const v = this.v, r = this.race, path = r.path, t = v.track;
    const inp = v.inp;
    if (t.finished && r.ev.loop === false) { inp.throttle = 0; inp.brake = v.vF > 0.5 ? 1 : 0; inp.steer = 0; inp.nitro = false; return; }
    const sp = v.speed;
    const s = t.s;
    // hindari mobil di depan dengan pindah lajur
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 0.4;
      let blocked = false;
      for (const o of r.cars) {
        if (o === v) continue;
        const ds = o.track.total - t.total;
        if (ds > 2 && ds < 14 && Math.abs(o.track.lat - (t.lat || 0)) < 2.6 && o.speed < sp + 2) blocked = true;
      }
      if (blocked) this.lane = this.lane > 0 ? this.lane - 5 : this.lane + 5;
      else this.lane += (this.baseLane - this.lane) * 0.2;
      this.lane = U.clamp(this.lane, -7, 7);
    }
    const look = 7 + sp * 0.42;
    const tp = path.pointAt(s + look);
    const td = path.dirAt(s + look);
    const lane = r.ev.type === 'drag' ? this.baseLane : this.lane;
    const tx = tp.x + (-td.z) * lane, tz = tp.z + td.x * lane; // lateral: kanan lintasan
    const desired = Math.atan2(tx - v.x, tz - v.z);
    const diff = U.angDiff(v.h, desired);
    inp.steer = U.clamp(-diff * 2.4, -1, 1);
    // perencanaan kecepatan berdasarkan tikungan di depan
    let maxSafe = v.stats.top * 1.2;
    const d0 = path.dirAt(s + 3);
    const a0 = Math.atan2(d0.x, d0.z);
    for (let d = 10; d <= 30 + sp * 2.2; d += 8) {
      const dd = path.dirAt(s + d);
      const turn = Math.abs(U.angDiff(a0, Math.atan2(dd.x, dd.z)));
      if (turn > 0.5) {
        const corner = Math.sqrt(v.stats.grip * 9.81 * 1.55 * 21) * (turn > 1.2 ? 1 : 1.25) * (0.92 + this.skill * 0.1);
        const lim = Math.sqrt(corner * corner + 2 * 11 * Math.max(0, d - 12));
        maxSafe = Math.min(maxSafe, lim);
      }
    }
    if (sp > maxSafe + 1) { inp.throttle = 0; inp.brake = U.clamp((sp - maxSafe) / 6, 0.2, 1); } else { inp.throttle = 1; inp.brake = 0; }
    inp.handbrake = 0;
    inp.nitro = Math.abs(diff) < 0.08 && maxSafe > sp + 12 && v.nitro > 0.4 && r.time > 3;
    // shifting manual di drag
    if (v.manual) {
      if (v.rpm > this.shiftAt && v.gear < v.stats.gears) { v.shiftUp(); this.shiftAt = U.rand(0.86, 0.95); }
    }
    // macet → reset ke lintasan
    if (r.state === 'racing' && sp < 1.5) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 2.5) { r.resetToTrack(v); this.stuck = 0; }
  }
}

/* ---------------------------- MANAJER BALAPAN ---------------------------- */
const Race = {
  active: false,
  ev: null,
  cars: [],
  ai: [],

  start(ev, game) {
    // batalkan timer hasil dari balapan sebelumnya; id balapan baru membuat timer lama tidak berlaku
    clearTimeout(this._finishTimer); this._finishTimer = null;
    this._raceId = (this._raceId || 0) + 1;
    this.spinTime = 0; this._offT = 0;
    this.game = game;
    this.ev = ev;
    const tier = DATA.TIER[ev.tier];
    const built = buildRoute(ev);
    this.path = built.path;
    this.nodes = built.nodes;
    World.setBarriers(built.barriers);
    if (DATA.usesAirport(ev) && typeof Airport !== 'undefined') Airport.clearRunway();
    this.active = true;
    this.state = 'countdown';
    this.count = 3.99;
    this.time = 0;
    this.lapStart = 0;
    this.bestLap = Infinity;
    this.wrongWay = 0;
    this.drift = { score: 0, chain: 0, mult: 1, chainTime: 0, idle: 0, banked: 0, lastText: '' };
    this.results = null;
    this.finishedOrder = [];
    this.startOffset = ev.type === 'drag' ? 20 : 45;
    this.laps = ev.loop ? ev.laps || 2 : 1;
    this.finishDist = ev.loop ? this.startOffset + this.laps * this.path.length : this.path.length - 8;

    // mobil-mobil
    const player = game.player;
    this.cars = [player];
    this.ai = [];
    const nOpp = ev.type === 'drift' ? 0 : ev.opp || 3;
    const rivals = DATA.RIVALS.slice().sort(() => Math.random() - 0.5);
    // daftar mobil tier diacak (Fisher-Yates) agar semua mobil bisa muncul, tanpa duplikat bila cukup
    const pool = tier.cars.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = U.randi(0, i); const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
    for (let k = 0; k < nOpp; k++) {
      const model = pool[k % pool.length];
      const lv = U.randi(tier.up[0], tier.up[1]);
      const entry = DATA.newCarEntry(model, U.pick(DATA.STYLE.paints));
      Object.keys(entry.up).forEach((p) => { entry.up[p] = Math.min(3, lv + (ev.tier > 1 && Math.random() < 0.25 ? 1 : 0)); });
      entry.style.glow = U.pick(DATA.STYLE.glows.slice(1));
      entry.style.spoiler = U.randi(0, 4);
      entry.style.kit = U.randi(0, 2);
      entry.style.vinyl = U.randi(0, 6);
      entry.style.finish = U.pick(DATA.STYLE.finishes).id;
      entry.style.rim = U.pick(DATA.STYLE.rims);
      const v = new Vehicle(entry, { name: rivals[k] });
      game.scene.add(v.mesh);
      this.cars.push(v);
    }
    // posisi start
    const isDrag = ev.type === 'drag';
    const slots = [];
    if (isDrag) {
      (World.isMalang ? [-5.1, -1.7, 1.7, 5.1] : [-7.5, -2.5, 2.5, 7.5]).forEach((lat) => slots.push({ s: this.startOffset, lat }));
    } else {
      for (let row = 0; row < 2; row++) [-3.5, 3.5].forEach((lat) => slots.push({ s: this.startOffset - 5 - row * 9, lat }));
    }
    // pemain di slot belakang (atau acak di drag)
    const order = this.cars.slice(1);
    const playerSlot = isDrag ? 1 : Math.min(slots.length - 1, this.cars.length - 1);
    const assign = [];
    let oi = 0;
    for (let k = 0; k < this.cars.length; k++) assign[k] = null;
    slots.slice(0, this.cars.length).forEach((sl, idx) => {
      if (idx === playerSlot) assign[idx] = player; else assign[idx] = order[oi++];
    });
    assign.forEach((v, idx) => {
      if (!v) return;
      const sl = slots[idx];
      const p = this.path.pointAt(sl.s), d = this.path.dirAt(sl.s);
      v.place(p.x + (-d.z) * sl.lat, p.z + d.x * sl.lat, Math.atan2(d.x, d.z));
      v.nitro = v.stats.nitroCap;
      v.frozen = true;
      v.manual = isDrag ? true : (v === player ? game.settings.trans === 'manual' : false);
      v.powerMul = 1;
      v.track = { s: sl.s, seg: -1, lap: 0, total: sl.s, finished: false, time: 0, lat: sl.lat, lapTimes: [], run: 0, off: 0 };
      const pr = this.path.project(v.x, v.z, -1);
      v.track.seg = pr.seg;
      if (v !== player) this.ai.push(new AIDriver(v, this, sl.lat, tier.skill));
    });
    this.ai.forEach((a) => { a.v.powerMul = tier.skill; });
    this._buildGate();
    AudioSys.beep(440, 0.2, 0.2);
  },

  _buildGate() {
    const g = new THREE.Group();
    const s = this.ev.loop ? this.startOffset : this.path.length - 8;
    const p = this.path.pointAt(s), d = this.path.dirAt(s);
    const H = World.W / 2;
    const c = Tex.canvas(64, 64);
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#fff' : '#111'; x.fillRect(i * 8, j * 8, 8, 8); }
    const tex = Tex.make(c, true);
    tex.repeat.set(12, 1);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(World.W, 2), new THREE.MeshBasicMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: -3 }));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = Math.atan2(d.x, d.z);
    const gy = World.heightAt(p.x, p.z);
    line.position.set(p.x, gy + 0.1, p.z);
    g.add(line);
    const col = DATA.TYPE_INFO[this.ev.type].color;
    const pm = new THREE.MeshBasicMaterial({ color: col });
    [-1, 1].forEach((sd) => {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), pm);
      pil.position.set(p.x + (-d.z) * sd * (H - 0.5), gy + 4.5, p.z + d.x * sd * (H - 0.5));
      g.add(pil);
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(World.W, 1.4, 0.6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    bar.position.set(p.x, gy + 9, p.z);
    bar.rotation.y = Math.atan2(d.x, d.z) + Math.PI / 2;
    g.add(bar);
    const cv = Tex.canvas(512, 64);
    const cx = cv.getContext('2d');
    cx.fillStyle = '#0b0712'; cx.fillRect(0, 0, 512, 64);
    cx.font = 'bold 40px Orbitron, Arial'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = col; cx.shadowColor = col; cx.shadowBlur = 12;
    cx.fillText(this.ev.loop ? 'START / FINISH' : 'FINISH', 256, 34);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(World.W - 1, 1.3), new THREE.MeshBasicMaterial({ map: Tex.make(cv), side: THREE.DoubleSide }));
    sign.position.set(p.x, gy + 9, p.z);
    sign.rotation.y = Math.atan2(d.x, d.z) + Math.PI;
    sign.position.x -= d.x * 0.35; sign.position.z -= d.z * 0.35;
    g.add(sign);
    this.gate = g;
    this.game.scene.add(g);
  },

  resetToTrack(v) {
    const s = v.track.s;
    const p = this.path.pointAt(s), d = this.path.dirAt(s);
    const lat = v === this.game.player ? 0 : (this.ai.find((a) => a.v === v) || { lane: 0 }).lane;
    v.place(p.x + (-d.z) * lat, p.z + d.x * lat, Math.atan2(d.x, d.z));
    v.gear = 1;
    // cari lintasan lokal mulai dari titik progres (bukan posisi lama mobil)
    v.track.seg = this.path._seg(this.path._norm(s));
    v.track.run = 0; v.track.off = 0;
  },

  _track(v, dt) {
    const t = v.track;
    const L = this.path.length;
    const pr = this.path.project(v.x, v.z, t.seg);
    const prevS = t.s;
    t.seg = pr.seg;
    t.lat = pr.lat;
    // anti potong jalan: progres hanya diterima bila mobil dekat lintasan (setengah lebar jalan + 14 m)
    // dan tidak melebihi jarak yang benar-benar ditempuh (+5 m). Keluar sedikit di tikungan = progres
    // dibekukan sementara; jarak tempuh tetap dihitung sehingga progres menyusul saat kembali ke lintasan.
    t.run = (t.run || 0) + v.speed * dt;
    let ds = pr.s - prevS;
    if (this.ev.loop) { if (ds > L / 2) ds -= L; else if (ds < -L / 2) ds += L; }
    let ok = pr.dist < World.W / 2 + 14 && ds <= t.run + 5;
    if (!this.ev.loop && ds < -60) ok = false; // cegah lompatan besar (mis. jalur yang berdekatan)
    if (ok) {
      if (this.ev.loop) {
        const raw = prevS + ds;
        if (raw >= L) t.lap++; else if (raw < 0) t.lap--;
      }
      t.s = pr.s;
      t.run = 0;
      t.off = 0;
    } else t.off = (t.off || 0) + dt;
    t.total = this.ev.loop ? t.lap * L + t.s : t.s;
    // peringatan bila pemain lama di luar lintasan (progres beku)
    if (v === this.game.player && this.state === 'racing' && !t.finished) {
      if (t.off > 3) {
        this._offT = (this._offT || 0) - dt;
        if (this._offT <= 0) { this._offT = 1; UI.banner('KEMBALI KE LINTASAN', 'Progres dibekukan · tekan R / ↺ untuk kembali ke jalur', 1.2); }
      } else this._offT = 0;
    }
    if (!t.finished && t.total >= this.finishDist) {
      t.finished = true;
      t.time = this.time;
      this.finishedOrder.push(v);
      if (v === this.game.player) this._playerFinished();
    }
    // waktu putaran
    if (this.ev.loop && v === this.game.player) {
      const lapNow = Math.floor((t.total - this.startOffset) / this.path.length);
      if (this._lastLap == null) this._lastLap = lapNow;
      if (lapNow > this._lastLap && lapNow >= 1) {
        const lt = this.time - this.lapStart;
        this.lapStart = this.time;
        if (lt < this.bestLap) this.bestLap = lt;
        if (lapNow < this.laps) UI.banner('PUTARAN ' + (lapNow + 1) + '/' + this.laps, U.fmtTime(lt), 1.5);
      }
      this._lastLap = Math.max(this._lastLap, lapNow);
    }
  },

  update(dt) {
    if (!this.active) return;
    const player = this.game.player;
    if (this.state === 'countdown') {
      const prev = Math.ceil(this.count);
      this.count -= dt;
      const now = Math.ceil(this.count);
      if (now !== prev && now > 0) { UI.countdown(now); AudioSys.beep(440, 0.2, 0.25); }
      if (this.count <= 0) {
        this.state = 'racing';
        UI.countdown('GO!');
        AudioSys.beep(880, 0.45, 0.3);
        this.cars.forEach((v) => { v.frozen = false; });
        // start sempurna (drag & semua mode): rpm di zona hijau
        if (player.rpm > 0.55 && player.rpm < 0.8) { player.launch = 1.2; UI.popText('START SEMPURNA!', '#7cff00'); } else if (player.rpm >= 0.92) { UI.popText('Ban selip...', '#ff6a00'); this.spinTime = 0.5; }
        this.ai.forEach((a) => { if (Math.random() < 0.5 + a.skill * 0.3) a.v.launch = 0.8; });
      }
    } else if (this.state === 'racing' || this.state === 'finished') {
      this.time += dt;
    }
    // hukuman ban selip saat start: gas pemain dipotong selama 0,5 detik
    // (input pemain sudah dibaca main.js sebelum Race.update, jadi aman diubah di sini)
    if (this.spinTime > 0) { this.spinTime -= dt; player.inp.throttle *= 0.3; }
    this.ai.forEach((a) => { if (this.state !== 'countdown') a.update(dt); else { a.v.inp.throttle = Math.random() < 0.7 ? 0.7 : 0; } });
    // rubber band ringan
    if (this.state === 'racing') {
      const tier = DATA.TIER[this.ev.tier];
      this.ai.forEach((a) => {
        const gap = a.v.track.total - player.track.total;
        let m = tier.skill;
        if (gap > 70) m *= 0.92; else if (gap < -70) m *= 1.07;
        a.v.powerMul += (m - a.v.powerMul) * Math.min(1, dt);
      });
    }
    this.cars.forEach((v) => this._track(v, dt));
    // arah salah
    if (this.state === 'racing' && !player.track.finished) {
      const d = this.path.dirAt(player.track.s);
      const dot = Math.sin(player.h) * d.x + Math.cos(player.h) * d.z;
      if (dot < -0.3 && player.speed > 3) this.wrongWay += dt; else this.wrongWay = 0;
    } else this.wrongWay = 0;
    // drift
    if (this.ev.type === 'drift' && this.state === 'racing' && !player.track.finished) this._drift(dt, player);
  },

  _drift(dt, p) {
    const D = this.drift;
    const fwd = Math.sin(p.h) * p.vx + Math.cos(p.h) * p.vz;
    if (p.speed > 9 && p.slip > 12 && p.slip < 110 && fwd > 0) {
      D.chain += (p.slip / 10) * p.speed * dt * 4;
      D.chainTime += dt;
      D.mult = Math.min(5, 1 + Math.floor(D.chainTime / 2));
      D.idle = 0;
      if (p.nitro < p.stats.nitroCap) p.nitro = Math.min(p.stats.nitroCap, p.nitro + dt * 0.4);
    } else if (D.chain > 0) {
      D.idle += dt;
      if (D.idle > 0.7) {
        const pts = Math.round(D.chain * D.mult);
        D.score += pts;
        UI.popText('+' + pts.toLocaleString('id-ID') + (D.mult > 1 ? '  x' + D.mult : ''), '#ff2bd6');
        D.chain = 0; D.chainTime = 0; D.mult = 1; D.idle = 0;
      }
    }
  },
  driftCrash() {
    if (!this.active || this.ev.type !== 'drift') return;
    const D = this.drift;
    if (D.chain > 50) UI.popText('DRIFT GAGAL!', '#ff3355');
    D.chain = 0; D.chainTime = 0; D.mult = 1;
  },

  standings() {
    return this.cars.slice().sort((a, b) => {
      if (a.track.finished && b.track.finished) return a.track.time - b.track.time;
      if (a.track.finished) return -1;
      if (b.track.finished) return 1;
      return b.track.total - a.track.total;
    });
  },
  position(v) { return this.standings().indexOf(v) + 1; },

  _playerFinished() {
    this.state = 'finished';
    const p = this.game.player;
    if (this.ev.type === 'drift') {
      const D = this.drift;
      if (D.chain > 0) { D.score += Math.round(D.chain * D.mult); D.chain = 0; }
    }
    UI.banner(this.ev.type === 'drift' ? 'SELESAI!' : 'FINISH!', '', 2);
    const id = this._raceId;
    clearTimeout(this._finishTimer);
    this._finishTimer = setTimeout(() => { this._finishTimer = null; if (this._raceId === id) this.finish(); }, 2200);
    p.inp.throttle = 0;
  },

  // silent = hitung & simpan hadiah tanpa membuka layar hasil (dipakai end() saat pemain keluar di jeda finis)
  finish(silent) {
    if (!this.active || this.results) return;
    const ev = this.ev, tier = DATA.TIER[ev.tier];
    const player = this.game.player;
    let rows = [];
    let place;
    if (ev.type === 'drift') {
      const score = this.drift.score;
      const rivals = DATA.RIVALS.slice(4, 7);
      rows = ev.targets.map((t, i) => ({ name: rivals[i], car: '-', value: t, isPlayer: false }));
      rows.push({ name: DB.user || 'Kamu', car: player.model.name, value: score, isPlayer: true });
      rows.sort((a, b) => b.value - a.value);
      place = rows.findIndex((r) => r.isPlayer) + 1;
      rows = rows.map((r) => Object.assign(r, { text: r.value.toLocaleString('id-ID') + ' poin' }));
    } else {
      // estimasi waktu untuk AI yang belum finis
      const t = this.time;
      this.cars.forEach((v) => {
        if (!v.track.finished) {
          const remain = Math.max(0, this.finishDist - v.track.total);
          const avg = Math.max(15, (v.track.total - this.startOffset) / Math.max(1, t));
          v.track.time = t + remain / avg;
          v.track.est = true;
        }
      });
      const order = this.cars.slice().sort((a, b) => a.track.time - b.track.time);
      place = order.indexOf(player) + 1;
      rows = order.map((v) => ({ name: v === player ? (DB.user || 'Kamu') : v.name, car: v.model.name, text: U.fmtTime(v.track.time) + (v.track.est ? '*' : ''), isPlayer: v === player }));
    }
    const d = DB.data;
    const wonBefore = d.done[ev.id] === 1;
    let money = place <= 3 ? tier.money[place - 1] : 200;
    let rep = place <= 3 ? tier.rep[place - 1] : 10;
    if (wonBefore) { rep = Math.round(rep * 0.5); money = Math.round(money * 0.7); }
    d.money += money; d.rep += rep; d.races++;
    if (place === 1) { d.wins++; d.done[ev.id] = 1; } else if (d.done[ev.id] == null) d.done[ev.id] = 0;
    const bestKey = ev.id;
    let newBest = false;
    if (ev.type === 'drift') { if (!d.best[bestKey] || this.drift.score > d.best[bestKey]) { d.best[bestKey] = this.drift.score; newBest = true; } } else if (!d.best[bestKey] || player.track.time < d.best[bestKey]) { d.best[bestKey] = Math.round(player.track.time * 100) / 100; newBest = true; }
    DB.save(true);
    this.results = { place, rows, money, rep, newBest, bestLap: this.bestLap };
    if (silent) { UI.toast('Hadiah balapan: +' + U.fmtMoney(money) + ' · +' + rep + ' REP', 'good'); return; }
    UI.showResults(ev, this.results);
    if (place === 1) AudioSys.cash();
  },

  end() {
    if (!this.active) return;
    clearTimeout(this._finishTimer); this._finishTimer = null;
    // pemain sudah finis tapi keluar/ulangi sebelum layar hasil muncul: hadiah tetap dihitung & disimpan
    const pl = this.game.player;
    if (!this.results && pl && pl.track && pl.track.finished) this.finish(true);
    this._raceId = (this._raceId || 0) + 1;
    this.active = false;
    World.clearBarriers();
    if (this.gate) {
      // gerbang dibuat baru tiap balapan (tekstur kanvas, material, geometri) → bebaskan agar memori GPU tidak naik terus
      this.game.scene.remove(this.gate);
      this.gate.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (m) { if (m.map) m.map.dispose(); m.dispose(); }
      });
      this.gate = null;
    }
    this.cars.forEach((v) => {
      if (v !== this.game.player) { this.game.scene.remove(v.mesh); CarFactory.dispose(v.mesh); }
    });
    this.cars = []; this.ai = [];
    this._lastLap = null;
    const p = this.game.player;
    p.frozen = false; p.manual = this.game.settings.trans === 'manual'; p.powerMul = 1; p.launch = 0;
    AudioSys.updateOpp(0, 0, -1);
  },
};

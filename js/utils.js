/* Utilitas umum */
const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  mod: (a, n) => ((a % n) + n) % n,
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  angDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  fmtTime(s) {
    if (!isFinite(s)) return '--:--.--';
    const m = Math.floor(s / 60);
    const sec = s - m * 60;
    return String(m).padStart(2, '0') + ':' + sec.toFixed(2).padStart(5, '0');
  },
  fmtMoney: (n) => '$' + Math.round(n).toLocaleString('id-ID'),
  uid: () => Math.random().toString(36).slice(2, 10),
  // RNG dengan seed (agar kota selalu sama)
  rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  escape(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  // SHA-256 (hex) murni JavaScript — dipakai untuk hash password di sisi klien
  sha256(str) {
    const ascii = unescape(encodeURIComponent(str));
    const rr = (v, n) => (v >>> n) | (v << (32 - n));
    const maxWord = Math.pow(2, 32);
    let result = '';
    const words = [];
    const bitLen = ascii.length * 8;
    let hash = [];
    const k = [];
    let pc = 0;
    const isComp = {};
    for (let c = 2; pc < 64; c++) {
      if (!isComp[c]) {
        for (let i = 0; i < 313; i += c) isComp[i] = c;
        hash[pc] = (Math.pow(c, 0.5) * maxWord) | 0;
        k[pc++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
      }
    }
    let s = ascii + '\x80';
    while ((s.length % 64) - 56) s += '\x00';
    for (let i = 0; i < s.length; i++) {
      const j = s.charCodeAt(i);
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, (j += 16));
      const old = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? '0' : '') + b.toString(16);
      }
    }
    return result;
  },
};

/* Penggabung geometri statis (agar kota ringan: ribuan kotak jadi beberapa mesh saja) */
class GeoBatch {
  constructor(useColor) {
    this.pos = []; this.nor = []; this.uv = []; this.col = useColor ? [] : null;
  }
  _push(p, n, uv, c) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    if (this.col) this.col.push(c ? c[0] : 1, c ? c[1] : 1, c ? c[2] : 1);
  }
  // quad: 4 sudut CCW (dilihat dari luar), normal, ukuran uv
  quad(a, b, c, d, n, us, vs, col) {
    const uvs = [[0, 0], [us, 0], [us, vs], [0, vs]];
    const v = [a, b, c, d];
    [0, 1, 2, 0, 2, 3].forEach((i) => this._push(v[i], n, uvs[i], col));
  }
  // kotak sejajar sumbu. faces: string berisi huruf "xXyYzZ" (X = +x, x = -x, dst). tile = ukuran ubin tekstur
  box(cx, cy, cz, w, h, d, opt = {}) {
    const hx = w / 2, hy = h / 2, hz = d / 2;
    const faces = opt.faces || 'XxYyZz';
    const tw = opt.tileW || 0, th = opt.tileH || 0;
    const col = opt.color;
    const P = (x, y, z) => [cx + x, cy + y, cz + z];
    const us = (len) => (tw ? len / tw : 1);
    const vs = (len) => (th ? len / th : 1);
    if (faces.includes('X')) this.quad(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), [1, 0, 0], us(d), vs(h), col);
    if (faces.includes('x')) this.quad(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), [-1, 0, 0], us(d), vs(h), col);
    if (faces.includes('Y')) this.quad(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), [0, 1, 0], us(w), vs(d), col);
    if (faces.includes('y')) this.quad(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), [0, -1, 0], us(w), vs(d), col);
    if (faces.includes('Z')) this.quad(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), [0, 0, 1], us(w), vs(h), col);
    if (faces.includes('z')) this.quad(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), [0, 0, -1], us(w), vs(h), col);
  }
  // bidang datar menghadap atas
  flat(cx, y, cz, w, d, col) {
    const hx = w / 2, hz = d / 2;
    this.quad([cx - hx, y, cz + hz], [cx + hx, y, cz + hz], [cx + hx, y, cz - hz], [cx - hx, y, cz - hz], [0, 1, 0], 1, 1, col);
  }
  // bidang tegak menghadap arah normal (nx,nz)
  wall(cx, cy, cz, w, h, nx, nz, col) {
    const hw = w / 2, hh = h / 2;
    const rx = nz, rz = -nx; // arah kanan bidang (dilihat dari depan)
    const a = [cx - rx * hw, cy - hh, cz - rz * hw];
    const b = [cx + rx * hw, cy - hh, cz + rz * hw];
    const c = [cx + rx * hw, cy + hh, cz + rz * hw];
    const d = [cx - rx * hw, cy + hh, cz - rz * hw];
    this.quad(a, b, c, d, [nx, 0, nz], 1, 1, col);
  }
  // kerucut low-poly (pohon cemara, gunung)
  cone(cx, y, cz, r, h, segs, col, colTop) {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0 = [cx + Math.sin(a0) * r, y, cz + Math.cos(a0) * r];
      const p1 = [cx + Math.sin(a1) * r, y, cz + Math.cos(a1) * r];
      const tp = [cx, y + h, cz];
      const am = (a0 + a1) / 2;
      const sl = r / Math.hypot(r, h);
      const n = [Math.sin(am) * (1 - sl * 0.5), sl, Math.cos(am) * (1 - sl * 0.5)];
      this._push(p0, n, [0, 0], col);
      this._push(p1, n, [1, 0], col);
      this._push(tp, n, [0.5, 1], colTop || col);
    }
  }
  get count() { return this.pos.length / 3; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/* Pembuat tekstur kanvas */
const Tex = {
  canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  },
  make(c, repeat) {
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return t;
  },
  radial(color0, color1, size = 128) {
    const c = this.canvas(size, size);
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, color0);
    gr.addColorStop(1, color1);
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    return this.make(c);
  },
  cache: {},
  get(key, fn) {
    if (!this.cache[key]) this.cache[key] = fn();
    return this.cache[key];
  },
};

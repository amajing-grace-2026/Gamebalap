/* =========================================================================
   DATA GAME — semua mobil, merek, nama, dan event adalah KARANGAN ORISINAL.
   ========================================================================= */
const DATA = {};

// shape: len=panjang, wid=lebar, hgt=tinggi bodi, clear=ground clearance, nose=kemiringan kap,
// tail=kemiringan buntut, cabLen/cabOff/cabH=kabin, ws/rs=kemiringan kaca depan/belakang, wr=radius roda
DATA.CARS = [
  // Mobil dari foto mainan pemain: supercar mesin tengah hijau mint, kanopi kaca biru, atap belakang hitam
  { id: 'jade', name: 'Jade Blade RS', maker: 'Jade', cls: 'D', price: 18000, desc: 'Supercar mungil hijau mint — mobil pertamamu.',
    accel: 6.5, top: 192, grip: 1.0, handling: 1.08, special: 'jade',
    shape: { len: 4.45, wid: 1.92, hgt: 0.5, clear: 0.16, nose: 1.35, tail: 0.3, cabLen: 1.75, cabOff: 0.0, cabH: 0.5, ws: 1.0, rs: 0.05, wr: 0.36 } },
  { id: 'pixel', name: 'Kogane Pixel', maker: 'Kogane', cls: 'D', price: 9000, desc: 'Hatchback lincah, gampang dikendalikan.',
    accel: 6.2, top: 178, grip: 1.0, handling: 1.12,
    shape: { len: 4.1, wid: 1.8, hgt: 0.6, clear: 0.2, nose: 0.9, tail: 0.2, cabLen: 2.5, cabOff: -0.3, cabH: 0.58, ws: 1.0, rs: 0.35, wr: 0.34 } },
  { id: 'vespera', name: 'Vespera GT-1', maker: 'Vespera', cls: 'D', price: 11000, desc: 'Coupe ringan dengan keseimbangan baik.',
    accel: 6.5, top: 188, grip: 0.98, handling: 1.02,
    shape: { len: 4.4, wid: 1.85, hgt: 0.52, clear: 0.18, nose: 1.1, tail: 0.35, cabLen: 2.3, cabOff: -0.3, cabH: 0.5, ws: 1.0, rs: 1.0, wr: 0.35 } },
  { id: 'rondo', name: 'Rondo Sedan S', maker: 'Rondo', cls: 'D', price: 10000, desc: 'Sedan stabil, top speed lumayan.',
    accel: 6.0, top: 196, grip: 0.96, handling: 0.95,
    shape: { len: 4.75, wid: 1.86, hgt: 0.56, clear: 0.2, nose: 1.0, tail: 0.45, cabLen: 2.6, cabOff: -0.2, cabH: 0.54, ws: 1.0, rs: 0.8, wr: 0.35 } },
  { id: 'kitsune', name: 'Kitsune RS', maker: 'Kitsune', cls: 'C', price: 24000, desc: 'Coupe sport, cocok untuk drift.',
    accel: 7.4, top: 214, grip: 1.05, handling: 1.08,
    shape: { len: 4.45, wid: 1.86, hgt: 0.5, clear: 0.17, nose: 1.15, tail: 0.4, cabLen: 2.15, cabOff: -0.35, cabH: 0.47, ws: 1.0, rs: 1.05, wr: 0.36 } },
  { id: 'bravado', name: 'Bravado V8', maker: 'Bravado', cls: 'C', price: 28000, desc: 'Muscle car bertenaga besar, raja drag.',
    accel: 8.3, top: 228, grip: 0.92, handling: 0.9,
    shape: { len: 4.85, wid: 1.98, hgt: 0.6, clear: 0.2, nose: 0.9, tail: 0.3, cabLen: 2.0, cabOff: -0.5, cabH: 0.48, ws: 0.9, rs: 1.05, wr: 0.37 } },
  { id: 'hayate', name: 'Hayate Type-Z', maker: 'Hayate', cls: 'B', price: 48000, desc: 'Sport coupe presisi tinggi.',
    accel: 8.7, top: 242, grip: 1.1, handling: 1.1,
    shape: { len: 4.5, wid: 1.92, hgt: 0.47, clear: 0.15, nose: 1.3, tail: 0.4, cabLen: 2.0, cabOff: -0.35, cabH: 0.44, ws: 1.05, rs: 0.9, wr: 0.37 } },
  { id: 'orion', name: 'Orion Turbo 4', maker: 'Orion', cls: 'B', price: 52000, desc: 'Sedan turbo 4WD, akselerasi brutal.',
    accel: 9.0, top: 246, grip: 1.06, handling: 1.0,
    shape: { len: 4.65, wid: 1.9, hgt: 0.55, clear: 0.18, nose: 1.05, tail: 0.45, cabLen: 2.4, cabOff: -0.2, cabH: 0.5, ws: 1.0, rs: 0.9, wr: 0.37 } },
  { id: 'spectre', name: 'Spectre ZR', maker: 'Spectre', cls: 'A', price: 95000, desc: 'Supercar mesin tengah.',
    accel: 10.2, top: 278, grip: 1.16, handling: 1.1,
    shape: { len: 4.55, wid: 2.0, hgt: 0.4, clear: 0.13, nose: 1.6, tail: 0.35, cabLen: 1.9, cabOff: -0.3, cabH: 0.42, ws: 0.95, rs: 0.85, wr: 0.38 } },
  { id: 'nebula', name: 'Nebula X-9', maker: 'Nebula', cls: 'S', price: 160000, desc: 'Hypercar puncak. Hanya untuk legenda.',
    accel: 11.2, top: 305, grip: 1.2, handling: 1.12,
    shape: { len: 4.75, wid: 2.04, hgt: 0.36, clear: 0.12, nose: 1.75, tail: 0.3, cabLen: 1.75, cabOff: -0.28, cabH: 0.4, ws: 0.9, rs: 0.75, wr: 0.39 } },
  // kendaraan lalu lintas (tidak dijual)
  { id: 'van', name: 'Van Kota', cls: 'T', price: 0, hidden: true, accel: 4.5, top: 140, grip: 0.85, handling: 0.8,
    shape: { len: 4.9, wid: 1.95, hgt: 0.9, clear: 0.3, nose: 0.4, tail: 0.1, cabLen: 3.9, cabOff: -0.4, cabH: 0.95, ws: 0.9, rs: 0.1, wr: 0.34 } },
  { id: 'bus', name: 'Bus Malam', cls: 'T', price: 0, hidden: true, accel: 3, top: 110, grip: 0.8, handling: 0.7,
    shape: { len: 8, wid: 2.4, hgt: 1.1, clear: 0.4, nose: 0.2, tail: 0.05, cabLen: 7.4, cabOff: -0.2, cabH: 1.4, ws: 0.3, rs: 0.05, wr: 0.48 } },
];
DATA.carById = (id) => DATA.CARS.find((c) => c.id === id);
DATA.STARTERS = ['pixel', 'vespera', 'rondo'];
DATA.CLASS_FACTOR = { D: 1.3, C: 1.3, B: 1.7, A: 2.2, S: 3, T: 1 };

DATA.PARTS = {
  engine:     { name: 'Mesin',            desc: 'Akselerasi & top speed naik',        prices: [1500, 4500, 11000] },
  turbo:      { name: 'Turbo',            desc: 'Dorongan tenaga di putaran tinggi',  prices: [2000, 5500, 13000] },
  nitro:      { name: 'Nitrous (NOS)',    desc: 'Kapasitas & daya dorong nitro',      prices: [1200, 3500, 8000] },
  tires:      { name: 'Ban',              desc: 'Cengkeraman di tikungan',            prices: [800, 2500, 6000] },
  suspension: { name: 'Suspensi',         desc: 'Respons setir lebih tajam',          prices: [1000, 3000, 7000] },
  weight:     { name: 'Pengurangan Bobot',desc: 'Akselerasi & kelincahan',            prices: [900, 2800, 6500] },
  gearbox:    { name: 'Transmisi',        desc: 'Perpindahan gigi lebih cepat',       prices: [1100, 3200, 7500] },
};
DATA.PART_LEVELS = ['Standar', 'Jalanan', 'Sport', 'Ekstrem'];

DATA.STYLE = {
  paints: ['#e8173c', '#ff6a00', '#ffd400', '#7cff00', '#00e5a0', '#00c8ff', '#2a5bff', '#7a2cff', '#ff2bd6',
    '#f2f2f2', '#9aa3ad', '#2b2f36', '#0c0c10', '#6b3a1e', '#0d3b2e', '#4a0d1a'],
  finishes: [
    { id: 'gloss', name: 'Glossy', rough: 0.22, metal: 0.25 },
    { id: 'metallic', name: 'Metalik', rough: 0.3, metal: 0.75 },
    { id: 'pearl', name: 'Mutiara', rough: 0.15, metal: 0.5 },
    { id: 'matte', name: 'Doff (Matte)', rough: 0.85, metal: 0.05 },
    { id: 'chrome', name: 'Krom', rough: 0.06, metal: 1.0 },
  ],
  rims: ['#c9ced6', '#1a1a1a', '#d4a017', '#ff2bd6', '#00e5ff', '#e8173c', '#7cff00', '#ffffff'],
  glows: [null, '#00e5ff', '#ff2bd6', '#7a2cff', '#7cff00', '#ff6a00', '#ffd400', '#e8173c', '#ffffff'],
  spoilers: ['Tanpa', 'Lip', 'Ducktail', 'GT Wing', 'Twin Deck'],
  kits: ['Standar', 'Street Kit', 'Wide Body'],
  vinyls: ['Tanpa', 'Garis Balap', 'Petir', 'Lidah Api', 'Pecahan Kaca', 'Nomor Balap', 'Gelombang'],
  tints: ['Bening', 'Ringan', 'Gelap', 'Hitam Pekat'],
  prices: { paint: 400, finish: 600, rim: 500, glow: 1500, spoiler: [0, 700, 1100, 1900, 2400], kit: [0, 2200, 4200], vinyl: 1000, vinylColor: 300, tint: 300, livery: 1500 },
};

DATA.defaultStyle = (paint) => ({
  paint: paint || '#e8173c', finish: 'gloss', rim: '#c9ced6', glow: null,
  spoiler: 0, kit: 0, vinyl: 0, vinylColor: '#ffffff', tint: 1,
});

DATA.newCarEntry = (model, paint) => ({
  uid: U.uid(), model,
  up: { engine: 0, turbo: 0, nitro: 0, tires: 0, suspension: 0, weight: 0, gearbox: 0 },
  style: DATA.defaultStyle(paint),
});

DATA.partPrice = (carEntry, part, level) => {
  const car = DATA.carById(carEntry.model);
  return Math.round(DATA.PARTS[part].prices[level - 1] * (DATA.CLASS_FACTOR[car.cls] || 1) / 50) * 50;
};

// Statistik akhir mobil setelah upgrade
DATA.computeStats = (entry) => {
  const c = DATA.carById(entry.model);
  const u = entry.up || {};
  const L = (k) => u[k] || 0;
  const st = {
    accel: c.accel * (1 + 0.12 * L('engine') + 0.08 * L('turbo') + 0.05 * L('weight')),
    top: (c.top / 3.6) * (1 + 0.04 * L('engine') + 0.03 * L('turbo') + 0.025 * L('gearbox')),
    grip: c.grip * (1 + 0.08 * L('tires') + 0.03 * L('suspension')),
    steer: c.handling * (1 + 0.07 * L('suspension') + 0.03 * L('weight')),
    nitroCap: 3.2 * (1 + 0.35 * L('nitro')),
    nitroPow: 5.5 * (1 + 0.12 * L('nitro')),
    shiftTime: 0.34 - 0.07 * L('gearbox'),
    gears: 6,
  };
  st.rating = {
    accel: U.clamp(((st.accel - 4.5) / 9.5) * 10, 0.5, 10),
    top: U.clamp(((st.top * 3.6 - 150) / 190) * 10, 0.5, 10),
    handling: U.clamp(((st.grip * st.steer - 0.75) / 0.9) * 10, 0.5, 10),
    nitro: U.clamp((st.nitroCap * st.nitroPow) / 6, 0.5, 10),
  };
  st.overall = (st.rating.accel + st.rating.top + st.rating.handling + st.rating.nitro) / 4;
  return st;
};

DATA.sellPrice = (entry) => {
  const c = DATA.carById(entry.model);
  let v = c.price * 0.55;
  Object.keys(entry.up || {}).forEach((p) => {
    for (let l = 1; l <= entry.up[p]; l++) v += DATA.partPrice(entry, p, l) * 0.4;
  });
  return Math.round(v / 50) * 50;
};

/* ---------------- EVENT BALAP -----------------
   Kota berupa grid 8x8 blok, simpang (i,j) dengan i,j = 0..8.
   route: daftar titik sudut (harus segaris), loop = sirkuit tertutup */
DATA.EVENTS = [
  // ---- Tier 1
  { id: 'c1', type: 'circuit', name: 'Lingkar Pelabuhan', tier: 1, req: 0, laps: 2, opp: 3,
    route: [[1, 1], [4, 1], [4, 3], [1, 3]], loop: true },
  { id: 's1', type: 'sprint', name: 'Sprint Pasar Malam', tier: 1, req: 0, opp: 3,
    route: [[7, 1], [7, 5], [5, 5], [5, 7], [8, 7]], loop: false },
  { id: 'd1', type: 'drift', name: 'Drift Gudang Tua', tier: 1, req: 0, laps: 2,
    route: [[2, 5], [4, 5], [4, 7], [2, 7]], loop: true, targets: [4500, 3000, 1800] },
  { id: 'g1', type: 'drag', name: 'Drag Jalan Layang', tier: 1, req: 0, opp: 3,
    route: [[0, 4], [8, 4]], loop: false },
  // ---- Tier 2
  { id: 'c2', type: 'circuit', name: 'Sirkuit Distrik Tengah', tier: 2, req: 400, laps: 2, opp: 3,
    route: [[2, 2], [6, 2], [6, 4], [5, 4], [5, 6], [2, 6]], loop: true },
  { id: 's2', type: 'sprint', name: 'Sprint Jembatan Ungu', tier: 2, req: 400, opp: 3,
    route: [[0, 7], [3, 7], [3, 4], [6, 4], [6, 0]], loop: false },
  { id: 'd2', type: 'drift', name: 'Drift Taman Kanal', tier: 2, req: 400, laps: 2,
    route: [[6, 5], [8, 5], [8, 8], [7, 8], [7, 6], [6, 6]], loop: true, targets: [7000, 4800, 3000] },
  { id: 'g2', type: 'drag', name: 'Drag Bulevar Utara', tier: 2, req: 400, opp: 3,
    route: [[4, 0], [4, 8]], loop: false },
  { id: 'x1', type: 'sprint', name: 'Sprint Terowongan Kabut', tier: 2, req: 400, opp: 3,
    route: [[2, 4], [8, 4]], tail: [[1240, 400], [1311, 400], [1311, 622.5], [1900, 622.5]], loop: false },
  { id: 'g3', type: 'drag', name: 'Drag Landasan Pacu', tier: 2, req: 400, opp: 3,
    points: [[1290, 622.5], [1940, 622.5]], loop: false },
  // ---- Tier 3
  { id: 'c3', type: 'circuit', name: 'Lingkar Luar Kota', tier: 3, req: 1200, laps: 2, opp: 3,
    route: [[0, 0], [8, 0], [8, 8], [0, 8]], loop: true },
  { id: 's3', type: 'sprint', name: 'Sprint Lintas Kota', tier: 3, req: 1200, opp: 3,
    route: [[8, 2], [5, 2], [5, 0], [2, 0], [2, 4], [0, 4]], loop: false },
  { id: 'd3', type: 'drift', name: 'Drift Zig-Zag Neon', tier: 3, req: 1200, laps: 2,
    route: [[3, 3], [4, 3], [4, 4], [5, 4], [5, 5], [3, 5]], loop: true, targets: [8500, 6000, 3800] },
  // ---- Final
  { id: 'c4', type: 'circuit', name: 'GRAND FINAL: Mahkota Neon', tier: 4, req: 2500, laps: 2, opp: 3,
    route: [[0, 1], [3, 1], [3, 0], [7, 0], [7, 3], [8, 3], [8, 7], [4, 7], [4, 8], [0, 8]], loop: true },
];
DATA.eventById = (id) => DATA.EVENTS.find((e) => e.id === id);
// titik awal & titik kedua event (koordinat dunia)
DATA.evPoints = (ev) => {
  if (ev.path) return [ev.path[0], ev.path[3] || ev.path[1]].map((p) => ({ x: p[0], z: p[1] }));
  if (ev.points) return ev.points.slice(0, 2).map((p) => ({ x: p[0], z: p[1] }));
  return ev.route.slice(0, 2).map((r) => World.node(r[0], r[1]));
};
DATA.usesAirport = (ev) => !!(ev.points || ev.tail);
DATA.TIER = {
  1: { money: [2500, 1200, 600], rep: [120, 60, 30], skill: 0.84, cars: ['pixel', 'vespera', 'rondo'], up: [0, 0] },
  2: { money: [5000, 2500, 1200], rep: [220, 110, 50], skill: 0.9, cars: ['kitsune', 'bravado', 'vespera', 'rondo'], up: [0, 1] },
  3: { money: [9000, 4500, 2200], rep: [360, 180, 80], skill: 0.96, cars: ['hayate', 'orion', 'bravado', 'kitsune'], up: [1, 2] },
  4: { money: [22000, 10000, 4500], rep: [900, 400, 200], skill: 0.97, cars: ['spectre', 'orion', 'hayate'], up: [1, 2] },
};
DATA.TYPE_INFO = {
  circuit: { name: 'Sirkuit', color: '#ffb000', icon: '⟳' },
  sprint: { name: 'Sprint', color: '#00e5ff', icon: '➜' },
  drift: { name: 'Drift', color: '#ff2bd6', icon: '∿' },
  drag: { name: 'Drag', color: '#7cff00', icon: '⇉' },
};
DATA.RIVALS = ['Raka "Kilat"', 'Sinta Neon', 'Bayu Turbo', 'Dewi Drift', 'Joko Nitro', 'Maya Vortex', 'Rio Blaze',
  'Nadia Ghost', 'Tono Malam', 'Laras Kobra', 'Dimas Shift', 'Kirana Voltase'];
DATA.GARAGE_NODE = [4, 4];

// Mobil awal untuk pemain baru & akun tamu: Jade Blade RS (hijau mint metalik)
DATA.DEFAULT_CAR = 'jade';
DATA.defaultCarEntry = () => {
  const e = DATA.newCarEntry(DATA.DEFAULT_CAR, '#4fcf92');
  e.style.finish = 'gloss';
  e.style.rim = '#c9ced6';
  e.style.tint = 0;
  return e;
};

/* =========================================================================
   AUDIO — semua suara dibuat dengan Web Audio API (sintesis), tanpa file.
   Musik prosedural = dikarang oleh kode secara real-time → 100% bebas hak cipta.
   Musik tambahan (opsional) bisa dari file gratis di GAME_CONFIG.MUSIC_TRACKS.
   ========================================================================= */
const AudioSys = {
  ctx: null,
  ready: false,
  musicVol: 0.6,
  sfxVol: 0.8,
  playlist: [],
  trackIdx: -1,
  playing: false,

  GEN_TRACKS: [
    { title: 'Neon Highway', style: 'synthwave', bpm: 112, root: 45, prog: [0, 5, 3, 4], seed: 11 },
    { title: 'Kilat Tengah Malam', style: 'dnb', bpm: 172, root: 41, prog: [0, 0, 5, 6], seed: 23 },
    { title: 'Chrome Pulse', style: 'house', bpm: 126, root: 43, prog: [0, 3, 5, 4], seed: 37 },
    { title: 'Asap Ban', style: 'breaks', bpm: 138, root: 40, prog: [0, 6, 5, 6], seed: 51 },
    { title: 'Kota Ungu', style: 'chill', bpm: 96, root: 38, prog: [0, 5, 2, 6], seed: 67 },
    { title: 'Garis Finis', style: 'synthwave', bpm: 124, root: 47, prog: [5, 3, 0, 4], seed: 79 },
  ],
  SCALE: [0, 2, 3, 5, 7, 8, 10],
  PATTERNS: {
    synthwave: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', b: 'x.x.x.x.x.x.x.x.', arp: true, pad: true },
    dnb:       { k: 'x.........x.....', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.', b: 'x.......x.....x.', arp: false, pad: true },
    house:     { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', b: '..x...x...x..xx.', arp: true, pad: false },
    breaks:    { k: 'x.....x...x.....', s: '....x.......x..x', h: 'x.xxx.x.x.xxx.x.', b: 'x..x..x...x.x...', arp: false, pad: true },
    chill:     { k: 'x......x..x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', b: 'x.......x...x...', arp: true, pad: true },
  },

  init() {
    if (this.dead) return;
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.musicGain = c.createGain();
    this.musicGain.gain.value = this.musicVol * 0.55;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.musicGain.connect(comp); comp.connect(this.master);
    this.musicBus = c.createGain();
    this.musicBus.connect(this.musicGain);
    // efek delay untuk arp/lead
    this.delay = c.createDelay(1.0);
    this.delayFb = c.createGain(); this.delayFb.gain.value = 0.32;
    this.delayWet = c.createGain(); this.delayWet.gain.value = 0.35;
    this.delay.connect(this.delayFb); this.delayFb.connect(this.delay);
    this.delay.connect(this.delayWet); this.delayWet.connect(this.musicBus);
    this.sfxGain = c.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.master);
    // buffer noise
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.engine = this._makeEngine(1);
    this.engine2 = this._makeEngine(0.5);
    this.skid = this._makeLoop('bandpass', 1100, 1.2);
    this.nos = this._makeLoop('highpass', 1800, 0.7);
    this.wind = this._makeLoop('lowpass', 500, 0.5);
    this.jet = this._makeLoop('lowpass', 380, 0.9); // gemuruh pesawat
    this.ready = true;
    this._buildPlaylist();
    setInterval(() => this._tick(), 25);
  },

  setVolumes(m, s) {
    this.musicVol = m; this.sfxVol = s;
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(m * 0.55, this.ctx.currentTime, 0.1);
    this.sfxGain.gain.setTargetAtTime(s, this.ctx.currentTime, 0.1);
    if (this.fileAudio) this.fileAudio.volume = U.clamp(m, 0, 1);
  },

  // ---------------- MUSIK ----------------
  _buildPlaylist() {
    const custom = (GAME_CONFIG.MUSIC_TRACKS || []).filter((t) => t && t.url)
      .map((t) => ({ type: 'file', title: t.title || 'Tanpa Judul', artist: t.artist || '', url: t.url, license: t.license || '' }));
    const gen = this.GEN_TRACKS.map((t) => Object.assign({ type: 'gen', artist: 'Neon Rush Synth (prosedural)' }, t));
    this.playlist = custom.concat(gen);
  },

  playTrack(i) {
    if (!this.ready) return;
    this.stopMusic();
    this.trackIdx = U.mod(i, this.playlist.length);
    const t = this.playlist[this.trackIdx];
    this.playing = true;
    if (t.type === 'file') {
      const a = new Audio(t.url);
      a.volume = U.clamp(this.musicVol, 0, 1);
      a.onended = () => this.nextTrack();
      a.onerror = () => { UI.toast('Gagal memutar ' + t.title + ' — lanjut ke lagu berikutnya', 'warn'); this.nextTrack(); };
      a.play().catch(() => {});
      this.fileAudio = a;
    } else {
      this.gen = { t, step: 0, next: this.ctx.currentTime + 0.1, rng: U.rng(t.seed), melody: null, bars: 0 };
      this._makeMelody();
    }
    UI.toast('♪ ' + t.title + (t.artist ? ' — ' + t.artist : ''), 'music');
  },
  nextTrack() { this.playTrack(this.trackIdx + 1); },
  randomTrack() { this.playTrack(Math.floor(Math.random() * this.playlist.length)); },
  stopMusic() {
    this.playing = false;
    this.gen = null;
    if (this.fileAudio) { this.fileAudio.onended = null; this.fileAudio.pause(); this.fileAudio = null; }
  },
  // jeda semua suara saat tab disembunyikan / diminimalkan
  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    if (this.fileAudio) this.fileAudio.pause();
  },
  resume() {
    if (this.dead) return;
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.fileAudio && this.playing) this.fileAudio.play().catch(() => {});
  },
  // matikan total (keluar game / tab ditutup)
  shutdown() {
    this.dead = true;
    this.stopMusic();
    if (this.ctx) { try { this.ctx.close(); } catch (e) { /* */ } }
    this.ready = false;
  },
  currentTitle() {
    const t = this.playlist[this.trackIdx];
    return t ? t.title + (t.artist ? ' — ' + t.artist : '') : '-';
  },

  _makeMelody() {
    const g = this.gen;
    const r = g.rng;
    const penta = [0, 2, 3, 4, 6]; // indeks skala (nada minor pentatonik-ish)
    const mel = [];
    for (let i = 0; i < 32; i++) {
      const on = (i % 4 === 0) ? r() < 0.8 : (i % 2 === 0 ? r() < 0.45 : r() < 0.15);
      mel.push(on ? { deg: penta[Math.floor(r() * penta.length)] + (r() < 0.3 ? 7 : 0), len: r() < 0.3 ? 4 : 2 } : null);
    }
    g.melody = mel;
  },

  _tick() {
    if (!this.ctx) return;
    const g = this.gen;
    if (!g || !this.playing) return;
    const spb = 60 / g.t.bpm / 4; // detik per 16th
    while (g.next < this.ctx.currentTime + 0.15) {
      this._step(g, g.step, g.next, spb);
      g.next += spb;
      g.step++;
    }
  },

  _note(midi) { return 440 * Math.pow(2, (midi - 69) / 12); },
  _deg(root, deg) {
    const o = Math.floor(deg / 7);
    return root + this.SCALE[U.mod(deg, 7)] + o * 12;
  },

  _step(g, step, t, spb) {
    const P = this.PATTERNS[g.t.style];
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const sect = bar % 32;
    const chordDeg = g.t.prog[bar % g.t.prog.length];
    const root = g.t.root;
    const intro = sect < 2;
    if (s === 0 && sect === 0 && bar > 0) this._makeMelody();
    // drum
    if (!intro || g.t.style === 'house') {
      if (P.k[s] === 'x') this._kick(t);
    }
    if (!intro && P.s[s] === 'x') this._snare(t, g.t.style === 'house');
    if (P.h[s] === 'x') this._hat(t, (s % 4 === 2) ? 0.09 : 0.05);
    // bass
    if (!intro && P.b[s] === 'x') {
      const oct = g.t.style === 'synthwave' && s % 4 === 2 ? 12 : 0;
      const len = g.t.style === 'dnb' ? spb * 6 : spb * 1.6;
      this._bass(t, this._note(this._deg(root, chordDeg) + oct), len, g.t.style);
    }
    // pad
    if (P.pad && s === 0) {
      const notes = [0, 2, 4].map((i) => this._note(this._deg(root + 24, chordDeg + i)));
      this._pad(t, notes, spb * 16);
    }
    // arp
    if (P.arp && sect >= 4 && (s % 2 === 0 || g.t.style === 'synthwave')) {
      const seq = [0, 2, 4, 7, 4, 2];
      const deg = chordDeg + seq[(step) % seq.length];
      this._pluck(t, this._note(this._deg(root + 24, deg)), spb * 0.9, 0.045);
    }
    // lead
    const leadOn = (sect >= 8 && sect < 16) || (sect >= 24 && sect < 32);
    if (leadOn && g.melody) {
      const m = g.melody[step % 32];
      if (m) this._lead(t, this._note(this._deg(root + 36, m.deg)), spb * m.len);
    }
  },

  _env(gainNode, t, a, peak, dur) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + a);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  },
  _kick(t) {
    const c = this.ctx;
    const o = c.createOscillator(); const g = c.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this._env(g, t, 0.003, 0.9, 0.32);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.35);
  },
  _snare(t, clap) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = clap ? 1400 : 1900; f.Q.value = 0.8;
    const g = c.createGain();
    this._env(g, t, 0.002, clap ? 0.35 : 0.45, clap ? 0.16 : 0.22);
    n.connect(f); f.connect(g); g.connect(this.musicBus);
    n.start(t, Math.random()); n.stop(t + 0.25);
    if (!clap) {
      const o = c.createOscillator(); const og = c.createGain();
      o.frequency.setValueAtTime(190, t);
      this._env(og, t, 0.002, 0.25, 0.1);
      o.connect(og); og.connect(this.musicBus); o.start(t); o.stop(t + 0.12);
    }
  },
  _hat(t, dur) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain();
    this._env(g, t, 0.001, 0.18, dur);
    n.connect(f); f.connect(g); g.connect(this.musicBus);
    n.start(t, Math.random()); n.stop(t + dur + 0.02);
  },
  _bass(t, freq, dur, style) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = style === 'dnb' ? 'sawtooth' : 'square'; o2.frequency.value = freq * (style === 'dnb' ? 1.007 : 0.5);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(style === 'dnb' ? 300 : 900, t);
    f.frequency.exponentialRampToValueAtTime(140, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
    g.gain.setValueAtTime(0.32, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.musicBus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  },
  _pad(t, freqs, dur) {
    const c = this.ctx;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(this.musicBus);
    freqs.forEach((fr) => {
      [-6, 6].forEach((det) => {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
        o.connect(f); o.start(t); o.stop(t + dur + 0.05);
      });
    });
  },
  _pluck(t, freq, dur, vol) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3500, t); f.frequency.exponentialRampToValueAtTime(600, t + dur);
    const g = c.createGain();
    this._env(g, t, 0.003, vol, dur);
    o.connect(f); f.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    o.start(t); o.stop(t + dur + 0.05);
  },
  _lead(t, freq, dur) {
    const c = this.ctx;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600; f.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
    g.gain.setValueAtTime(0.06, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g); g.connect(this.musicBus); g.connect(this.delay);
    [-8, 8].forEach((det) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
    });
  },

  // ---------------- MESIN & SFX ----------------
  _makeEngine(vol) {
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0;
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 2.5); }
    shaper.curve = curve;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = 3; filt.frequency.value = 800;
    const mk = (type, g) => {
      const o = c.createOscillator(); o.type = type;
      const gn = c.createGain(); gn.gain.value = g;
      o.connect(gn); gn.connect(shaper); o.start();
      return o;
    };
    const o1 = mk('sawtooth', 0.5), o2 = mk('square', 0.35), o3 = mk('triangle', 0.25);
    // getaran "chug"
    const lfo = c.createOscillator(); lfo.type = 'square';
    const lfoG = c.createGain(); lfoG.gain.value = 0.3;
    const am = c.createGain(); am.gain.value = 1;
    lfo.connect(lfoG); lfoG.connect(am.gain); lfo.start();
    shaper.connect(filt); filt.connect(am); am.connect(out); out.connect(this.sfxGain);
    return {
      update: (rpm, thr, on, vmul = 1) => {
        const t = c.currentTime;
        const f = 30 + rpm * 185;
        o1.frequency.setTargetAtTime(f, t, 0.03);
        o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
        o3.frequency.setTargetAtTime(f * 2.01, t, 0.03);
        lfo.frequency.setTargetAtTime(f * 0.5, t, 0.03);
        lfoG.gain.setTargetAtTime(0.15 + (1 - rpm) * 0.35, t, 0.05);
        filt.frequency.setTargetAtTime(350 + thr * 1700 + rpm * 1700, t, 0.05);
        out.gain.setTargetAtTime(on ? (0.05 + thr * 0.07 + rpm * 0.05) * vol * vmul : 0, t, 0.06);
      },
    };
  },
  _makeLoop(type, freq, q) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    n.connect(f); f.connect(g); g.connect(this.sfxGain); n.start();
    return { set: (v) => g.gain.setTargetAtTime(v, c.currentTime, 0.05), filter: f };
  },
  updateCar(p) {
    if (!this.ready) return;
    this.engine.update(p.rpm, p.throttle, p.on);
    this.skid.set(U.clamp(p.skid, 0, 1) * 0.22);
    this.nos.set(p.nitro ? 0.12 : 0);
    this.wind.set(U.clamp(p.speed / 80, 0, 1) * 0.12);
  },
  updateOpp(rpm, thr, dist) {
    if (!this.ready) return;
    const v = dist < 0 ? 0 : U.clamp(1 - dist / 60, 0, 1);
    this.engine2.update(rpm, thr, v > 0.01, v);
  },
  silence() {
    if (!this.ready) return;
    this.engine.update(0, 0, false); this.engine2.update(0, 0, false);
    this.skid.set(0); this.nos.set(0); this.wind.set(0); this.jet.set(0);
  },
  trainHorn() {
    if (!this.ready) return;
    [[311, 0.12], [370, 0.1]].forEach(([f, v]) => this.beep(f, 1.4, v, 'sawtooth'));
  },
  setJet(v) { if (this.ready) this.jet.set(v * 0.4); },
  crash(intensity) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const v = U.clamp(intensity / 20, 0.05, 1);
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + v * 1500;
    const g = c.createGain(); this._env(g, t, 0.002, 0.6 * v, 0.4);
    n.connect(f); f.connect(g); g.connect(this.sfxGain); n.start(t, Math.random()); n.stop(t + 0.45);
    const o = c.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const og = c.createGain(); this._env(og, t, 0.002, 0.7 * v, 0.25);
    o.connect(og); og.connect(this.sfxGain); o.start(t); o.stop(t + 0.3);
  },
  blowoff() {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(4000, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    const g = c.createGain(); this._env(g, t, 0.005, 0.25, 0.3);
    n.connect(f); f.connect(g); g.connect(this.sfxGain); n.start(t, Math.random()); n.stop(t + 0.35);
  },
  beep(freq = 880, dur = 0.15, vol = 0.25, type = 'square') {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain(); this._env(g, t, 0.005, vol, dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + dur + 0.02);
  },
  click() { this.beep(1400, 0.05, 0.08, 'triangle'); },
  cash() { this.beep(1318, 0.08, 0.15, 'triangle'); setTimeout(() => this.beep(1760, 0.18, 0.15, 'triangle'), 80); },
  horn() {
    if (!this.ready) return;
    this.beep(392, 0.35, 0.08, 'square'); this.beep(494, 0.35, 0.06, 'square');
  },
};

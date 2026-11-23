/* =========================================================================
   ANTARMUKA: login, garasi, dealer, tuning, HUD, peta, hasil, menu
   ========================================================================= */
const CLASS_REP = { D: 0, C: 300, B: 1000, A: 2000, S: 3500 };
const OVERLAYS = ['pause', 'eventinfo', 'map', 'results', 'leader', 'settings', 'help'];

const UI = {
  $(id) { return document.getElementById(id); },
  setText(el, s) { if (el._t !== s) { el.textContent = s; el._t = s; } },

  init(game) {
    this.g = game;
    this.el = {};
    ['hud', 'hud-money', 'hud-rep', 'hud-district', 'hud-roam', 'hud-race', 'hud-pos', 'hud-posof', 'hud-lap', 'hud-time', 'hud-best', 'hud-best-wrap',
      'hud-board', 'minimap', 'spd', 'gear', 'nos-bar', 'shiftlight', 'speedo-c', 'banner', 'banner-t', 'banner-s', 'countdown', 'pop',
      'wrongway', 'prompt', 'gps', 'gps-arrow', 'gps-dist', 'drift-box', 'drift-total', 'drift-chain', 'fps', 'hud-music', 'bigmap']
      .forEach((id) => { this.el[id] = this.$(id); });
    this.mm = this.el.minimap.getContext('2d');
    this.sp = this.el['speedo-c'].getContext('2d');
    this._boardT = 0; this._distT = 0;

    // ---- auth
    this.authTab = 'login';
    this.$('auth-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.authTab = b.dataset.tab;
      [...this.$('auth-tabs').children].forEach((c) => c.classList.toggle('active', c === b));
      this.$('au-pass2-wrap').classList.toggle('hidden', this.authTab !== 'register');
      this.$('au-go').textContent = this.authTab === 'register' ? 'DAFTAR & MAIN' : 'MASUK';
      this.authMsg('');
    });
    this.$('au-go').addEventListener('click', () => this.doAuth());
    ['au-user', 'au-pass', 'au-pass2'].forEach((id) => this.$(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') this.doAuth(); }));
    this.$('au-guest').addEventListener('click', () => { AudioSys.init(); DB.guest(); this.g.onLogin(); });
    this.$('au-quit').addEventListener('click', () => { if (confirm('Keluar dari game?')) this.g.quit(); });
    try { this.$('au-user').value = localStorage.getItem('nr_lastuser') || ''; } catch (e) { /* */ }

    // ---- starter
    this.stIdx = 0;
    this.$('st-prev').addEventListener('click', () => { this.stIdx = U.mod(this.stIdx - 1, 3); this.renderStarter(); AudioSys.click(); });
    this.$('st-next').addEventListener('click', () => { this.stIdx = U.mod(this.stIdx + 1, 3); this.renderStarter(); AudioSys.click(); });
    this.$('st-pick').addEventListener('click', () => this.pickStarter());

    // ---- tombol tutup overlay
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closeOverlay(b.dataset.close)));
    this.$('btn-menu').addEventListener('click', () => this.g.togglePause());

    // ---- garasi
    this.gTab = 'mine';
    this.$('g-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.gTab = b.dataset.tab;
      [...this.$('g-tabs').children].forEach((c) => c.classList.toggle('active', c === b));
      this.gSel = null; this.styleDraft = null;
      this.renderGarage();
      AudioSys.click();
    });
    this.$('g-back').addEventListener('click', () => this.g.leaveGarage());

    // ---- peta
    this.el.bigmap.addEventListener('click', (e) => this.mapClick(e));

    // ---- pengaturan
    const S = this.g.settings;
    const sm = this.$('set-music'), sf = this.$('set-sfx'), sq = this.$('set-quality'), st = this.$('set-trans'), sc = this.$('set-cam'), stf = this.$('set-traffic'), sfps = this.$('set-fps');
    const stime = this.$('set-time');
    stime.value = S.time;
    stime.onchange = () => { S.time = stime.value; this.g.saveSettings(); if (confirm('Muat ulang sekarang agar suasana waktu berubah? (Progres sudah tersimpan)')) location.reload(); };
    sm.value = S.music; sf.value = S.sfx; sq.value = S.quality; st.value = S.trans; sc.value = S.cam; stf.checked = S.traffic; sfps.checked = S.fps;
    sm.oninput = () => { S.music = +sm.value; this.g.applySettings(); };
    sf.oninput = () => { S.sfx = +sf.value; this.g.applySettings(); };
    sq.onchange = () => { S.quality = sq.value; this.g.saveSettings(); if (confirm('Muat ulang sekarang agar kualitas grafis berubah? (Progres sudah tersimpan)')) location.reload(); };
    st.onchange = () => { S.trans = st.value; this.g.applySettings(); };
    sc.onchange = () => { S.cam = +sc.value; this.g.applySettings(); };
    stf.onchange = () => { S.traffic = stf.checked; this.g.applySettings(); this.g.setTraffic(); };
    sfps.onchange = () => { S.fps = sfps.checked; this.g.applySettings(); };

    // ---- sentuh
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    document.querySelectorAll('#touch button').forEach((b) => {
      const k = b.dataset.k;
      const on = (e) => { e.preventDefault(); b.classList.add('on'); if (k === 'act') this.g.onKey('KeyE'); else Input.touch[k] = true; };
      const off = (e) => { e.preventDefault(); b.classList.remove('on'); Input.touch[k] = false; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
    });
  },

  // ------------------------------------------------------------ dasar
  show(id) { this.$(id).classList.add('show'); },
  hide(id) { this.$(id).classList.remove('show'); },
  isOpen(id) { return this.$(id).classList.contains('show'); },
  anyOverlay() { return OVERLAYS.some((o) => this.isOpen(o)); },
  openOverlay(id) {
    OVERLAYS.forEach((o) => { if (o !== id) this.hide(o); });
    this.show(id);
    this.g.paused = true;
    AudioSys.click();
  },
  closeOverlay(id) {
    this.hide(id);
    if (!this.anyOverlay()) this.g.paused = false;
    AudioSys.click();
  },
  toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    this.$('toasts').appendChild(t);
    setTimeout(() => t.remove(), type === 'music' ? 3500 : 3000);
    if (type === 'music') this.setText(this.el['hud-music'], msg);
  },
  saveIndicator(on) { this.$('saving').classList.toggle('hidden', !on); },
  loading(p, txt) {
    this.$('loadbar').style.width = Math.round(p * 100) + '%';
    if (txt) this.$('loadtxt').textContent = txt;
  },

  // ------------------------------------------------------------ auth
  authMsg(m, cls) { const e = this.$('au-msg'); e.textContent = m; e.className = 'msg ' + (cls || ''); },
  showAuth() {
    this.show('auth');
    this.$('au-mode').innerHTML = DB.mode === 'sheets'
      ? 'Database: <b>Google Sheets (online)</b>'
      : 'Database: <b>Lokal (browser ini)</b> — isi <code>SHEETS_URL</code> di <code>js/config.js</code> untuk mode online.';
  },
  async doAuth() {
    AudioSys.init();
    const u = this.$('au-user').value.trim(), p = this.$('au-pass').value;
    if (this.authTab === 'register' && p !== this.$('au-pass2').value) { this.authMsg('Password tidak sama.', 'err'); return; }
    this.authMsg(DB.mode === 'sheets' ? 'Menghubungkan ke Google Sheets…' : 'Memproses…');
    this.$('au-go').disabled = true;
    try {
      if (this.authTab === 'register') await DB.register(u, p); else await DB.login(u, p);
      this.authMsg('Berhasil!', 'ok');
      this.g.onLogin();
    } catch (e) {
      this.authMsg(e.message || String(e), 'err');
    }
    this.$('au-go').disabled = false;
  },

  // ------------------------------------------------------------ starter
  showStarter() {
    this.show('starter');
    this.stColors = ['#ffd400', '#e8173c', '#00c8ff'];
    this.renderStarter();
  },
  renderStarter() {
    const id = DATA.STARTERS[this.stIdx];
    const car = DATA.carById(id);
    const entry = DATA.newCarEntry(id, this.stColors[this.stIdx]);
    this.stEntry = entry;
    Showroom.setCar(entry);
    const st = DATA.computeStats(entry);
    this.$('st-card').innerHTML = `
      <div class="car-name">${car.name}<span class="car-cls cls-${car.cls}">${car.cls}</span></div>
      <div class="desc">${car.desc}</div>${this.statBars(st)}
      <div class="kv"><span>Top speed</span><b>${Math.round(st.top * 3.6)} km/j</b></div>`;
  },
  pickStarter() {
    AudioSys.cash();
    DB.data.cars.push(this.stEntry);
    DB.data.current = 0;
    DB.save(true);
    this.hide('starter');
    this.toast('Selamat datang di Neopolis! Kunjungi penanda event untuk balapan.', 'good');
    this.g.enterRoam(true);
  },

  statBars(st, cmp) {
    const r = st.rating;
    return [['Akselerasi', 'accel'], ['Top Speed', 'top'], ['Handling', 'handling'], ['Nitro', 'nitro']].map(([n, k]) => {
      const up = cmp && cmp.rating[k] > r[k] + 0.01 ? `<u style="width:${cmp.rating[k] * 10}%"></u>` : '';
      return `<div class="stat"><span>${n}</span><div class="bar">${up}<i style="width:${r[k] * 10}%"></i></div><b>${(cmp ? cmp.rating[k] : r[k]).toFixed(1)}</b></div>`;
    }).join('');
  },

  // ------------------------------------------------------------ HUD
  hudMode(mode) {
    this.$('hud').classList.toggle('hidden', mode === 'none');
    this.$('touch').classList.toggle('hidden', mode === 'none' || !this.isTouch);
    this.el['hud-roam'].classList.toggle('hidden', mode !== 'roam');
    this.el['hud-race'].classList.toggle('hidden', mode !== 'race');
    this.el['drift-box'].classList.add('hidden');
    this.el.wrongway.classList.add('hidden');
    this.el.prompt.classList.add('hidden');
    if (mode === 'race') {
      const ev = Race.ev;
      this.el['drift-box'].classList.toggle('hidden', ev.type !== 'drift');
      this.el['hud-best-wrap'].classList.toggle('hidden', !ev.loop);
      this.$('hud-board').classList.toggle('hidden', ev.type === 'drift');
      this.$('hud-pos').parentElement.classList.toggle('hidden', ev.type === 'drift');
    }
  },
  banner(t, s, dur) {
    const b = this.el.banner;
    this.setText(this.el['banner-t'], t);
    this.setText(this.el['banner-s'], s || '');
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this._bt);
    this._bt = setTimeout(() => b.classList.add('hidden'), (dur || 2) * 1000);
  },
  countdown(v) {
    const c = this.el.countdown;
    c.textContent = v;
    c.style.color = v === 'GO!' ? '#7cff00' : '#fff';
    c.classList.remove('go'); void c.offsetWidth; c.classList.add('go');
  },
  popText(t, color) {
    const p = this.el.pop;
    p.textContent = t;
    p.style.color = color || '#fff';
    p.style.textShadow = `0 0 16px ${color || '#fff'}`;
    p.classList.remove('go'); void p.offsetWidth; p.classList.add('go');
  },
  prompt(html) {
    const p = this.el.prompt;
    if (!html) { p.classList.add('hidden'); this._prompt = ''; return; }
    if (this._prompt !== html) { p.innerHTML = html; this._prompt = html; }
    p.classList.remove('hidden');
  },

  updateHUD(dt) {
    const g = this.g, p = g.player;
    if (!p) return;
    const E = this.el;
    this.setText(E.spd, String(Math.round(p.kmh)));
    const gear = p.gear === -1 ? 'R' : (p.speed < 0.5 && p.inp.throttle === 0 ? 'N' : String(p.gear));
    this.setText(E.gear, gear + (p.manual ? ' M' : ''));
    E['nos-bar'].style.width = (p.nitro / p.stats.nitroCap * 100).toFixed(1) + '%';
    const sl = E.shiftlight;
    const want = p.manual && p.gear > 0 ? (p.rpm > 0.97 ? 'red' : p.rpm > 0.86 ? 'on' : '') : '';
    if (sl._c !== want) { sl.className = want; sl._c = want; }
    this.drawSpeedo(p);

    if (g.state === 'roam') {
      this.setText(E['hud-money'], U.fmtMoney(DB.data.money));
      this.setText(E['hud-rep'], String(DB.data.rep));
      this._distT -= dt;
      if (this._distT <= 0) { this._distT = 0.5; this.setText(E['hud-district'], World.districtName(p.x, p.z)); }
    } else if (g.state === 'race' && Race.active) {
      const ev = Race.ev, t = p.track;
      this.setText(E['hud-time'], U.fmtTime(Race.time));
      if (ev.loop) {
        const lap = U.clamp(Math.floor((t.total - Race.startOffset) / Race.path.length) + 1, 1, Race.laps);
        this.setText(E['hud-lap'], lap + '/' + Race.laps);
        this.setText(E['hud-best'], isFinite(Race.bestLap) ? U.fmtTime(Race.bestLap) : '--');
      } else {
        const remain = Math.max(0, Race.finishDist - t.total);
        this.setText(E['hud-lap'], remain >= 1000 ? (remain / 1000).toFixed(2) + ' km' : Math.round(remain) + ' m');
      }
      this._boardT -= dt;
      if (this._boardT <= 0 && ev.type !== 'drift') {
        this._boardT = 0.25;
        const st = Race.standings();
        this.setText(E['hud-pos'], String(st.indexOf(p) + 1));
        this.setText(E['hud-posof'], '/' + st.length);
        E['hud-board'].innerHTML = st.map((v, i) => `<div class="${v === p ? 'me' : ''}"><i>${i + 1}</i>${U.escape(v === p ? (DB.user || 'Kamu') : v.name)}</div>`).join('');
      }
      if (ev.type === 'drift') {
        const D = Race.drift;
        this.setText(E['drift-total'], D.score.toLocaleString('id-ID'));
        this.setText(E['drift-chain'], D.chain > 0 ? '+' + Math.round(D.chain).toLocaleString('id-ID') + '  x' + D.mult : '');
        this.setText(E['hud-lap'], U.clamp(Math.floor((t.total - Race.startOffset) / Race.path.length) + 1, 1, Race.laps) + '/' + Race.laps);
      }
      E.wrongway.classList.toggle('hidden', Race.wrongWay < 1);
    }
    // GPS
    const tgt = g.gpsTarget();
    if (tgt) {
      E.gps.classList.remove('hidden');
      const ang = U.angDiff(p.h, Math.atan2(tgt.x - p.x, tgt.z - p.z));
      E['gps-arrow'].style.transform = `rotate(${(-ang * 180 / Math.PI).toFixed(1)}deg)`;
      this.setText(E['gps-dist'], tgt.label || (Math.round(Math.hypot(tgt.x - p.x, tgt.z - p.z)) + ' m'));
    } else E.gps.classList.add('hidden');
    this.drawMinimap(p);
    if (g.settings.fps) { E.fps.classList.remove('hidden'); this.setText(E.fps, g.fps + ' FPS'); } else E.fps.classList.add('hidden');
  },

  drawSpeedo(p) {
    const c = this.sp, W = 240, cx = 120, cy = 120, R = 100;
    c.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    c.lineCap = 'round';
    c.lineWidth = 12;
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();
    c.strokeStyle = 'rgba(255,51,85,0.45)';
    c.beginPath(); c.arc(cx, cy, R, a0 + (a1 - a0) * 0.88, a1); c.stroke();
    const rpm = U.clamp(p.rpm, 0, 1);
    const gr = c.createLinearGradient(20, 0, 220, 0);
    gr.addColorStop(0, '#00e5ff'); gr.addColorStop(0.7, '#ff2bd6'); gr.addColorStop(1, '#ff3355');
    c.strokeStyle = gr;
    c.shadowColor = '#ff2bd6'; c.shadowBlur = 12;
    c.beginPath(); c.arc(cx, cy, R, a0, a0 + (a1 - a0) * rpm); c.stroke();
    c.shadowBlur = 0;
    // zona hijau start (saat hitung mundur)
    if (this.g.state === 'race' && Race.state === 'countdown') {
      c.strokeStyle = 'rgba(124,255,0,0.8)'; c.lineWidth = 4;
      c.beginPath(); c.arc(cx, cy, R - 14, a0 + (a1 - a0) * 0.55, a0 + (a1 - a0) * 0.8); c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.font = '10px Orbitron, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i <= 9; i++) {
      const a = a0 + (a1 - a0) * (i / 9);
      c.fillText(String(i), cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22));
    }
  },

  drawMinimap(p) {
    const c = this.mm, S = 220, half = S / 2;
    const sc = 0.5;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(half, half, half, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(8,5,18,0.85)'; c.fillRect(0, 0, S, S);
    const ch = Math.cos(p.h), sh = Math.sin(p.h);
    const a = -ch * sc, b = -sh * sc, cc = sh * sc, d = -ch * sc;
    c.setTransform(a, b, cc, d, half - (a * p.x + cc * p.z), half - (b * p.x + d * p.z));
    this._drawRoads(c);
    this._drawOverlay(c, 9);
    c.restore();
    // pemain
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#fff'; c.shadowColor = '#00e5ff'; c.shadowBlur = 8;
    c.beginPath(); c.moveTo(half, half - 12); c.lineTo(half + 7, half + 9); c.lineTo(half, half + 4); c.lineTo(half - 7, half + 9); c.closePath(); c.fill();
    c.shadowBlur = 0;
  },
  _drawRoads(c) {
    const N = World.N, P = World.P, W = World.W, sz = World.size;
    const A = Airport.AREA, R = Airport.RWY, Ap = Airport.APRON, C = Airport.CORR, TU = Airport.TUN;
    // bandara
    c.fillStyle = '#16261a'; c.fillRect(A.x0, A.z0, A.x1 - A.x0, A.z1 - A.z0);
    c.fillStyle = '#4a4658'; c.fillRect(Ap.x0, Ap.z0, Ap.x1 - Ap.x0, Ap.z1 - Ap.z0);
    Airport.TAXI.forEach((t) => c.fillRect(t.x0, t.z0, t.x1 - t.x0, t.z1 - t.z0));
    c.fillStyle = '#5c5870'; c.fillRect(R.x0, R.z0, R.x1 - R.x0, R.z1 - R.z0);
    c.fillStyle = '#9a96aa'; c.fillRect(R.x0 + 20, R.zc - 1.5, R.x1 - R.x0 - 40, 3);
    c.fillStyle = '#2a2433';
    c.fillRect(1200, 190, 240, 75); c.fillRect(1560, 140, 80, 90); c.fillRect(1680, 140, 80, 90);
    // stasiun & rel kereta
    const S = Landmarks.ST;
    c.fillStyle = '#3b3557'; c.fillRect(S.plaza.x0, S.plaza.z0, S.plaza.x1 - S.plaza.x0, S.plaza.z1 - S.plaza.z0 + 2);
    c.fillStyle = '#5a4a3a'; c.fillRect(S.bld.x0, S.bld.z0, S.bld.x1 - S.bld.x0, S.bld.z1 - S.bld.z0);
    c.fillStyle = '#555'; c.fillRect(230, S.trackZ + 6, 340, 12);
    c.strokeStyle = '#8a8478'; c.lineWidth = 3; c.setLineDash([6, 4]);
    c.beginPath(); c.moveTo(-1500, S.trackZ); c.lineTo(2800, S.trackZ); c.stroke(); c.setLineDash([]);
    // mall (lingkaran)
    c.fillStyle = '#4a2a2a'; c.beginPath(); c.arc(452, 650, 30, 0, Math.PI * 2); c.fill();
    // jalan kota + jalan lintas
    c.strokeStyle = '#3b3557';
    c.lineWidth = W;
    c.lineCap = 'square';
    c.beginPath();
    for (let i = 0; i <= N; i++) {
      c.moveTo(i * P, 0); c.lineTo(i * P, sz);
      c.moveTo(0, i * P); c.lineTo(sz, i * P);
    }
    c.moveTo(sz, C.z); c.lineTo(C.x1 + 10, C.z);
    c.stroke();
    // terowongan (lebih gelap, bergaris)
    c.strokeStyle = '#211c2e'; c.lineWidth = W + 6; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(TU.x0, C.z); c.lineTo(TU.x1, C.z); c.stroke();
    c.strokeStyle = '#ffb000'; c.lineWidth = 2; c.setLineDash([10, 8]);
    c.beginPath(); c.moveTo(TU.x0, C.z); c.lineTo(TU.x1, C.z); c.stroke();
    c.setLineDash([]);
  },
  _drawOverlay(c, rad) {
    const g = this.g;
    if (g.state === 'race' && Race.active) {
      const pts = Race.path.pts;
      c.strokeStyle = DATA.TYPE_INFO[Race.ev.type].color;
      c.lineWidth = 7; c.lineJoin = 'round';
      c.beginPath();
      pts.forEach((pt, i) => (i ? c.lineTo(pt.x, pt.z) : c.moveTo(pt.x, pt.z)));
      if (Race.ev.loop) c.closePath();
      c.stroke();
      Race.cars.forEach((v) => {
        if (v === g.player) return;
        c.fillStyle = '#ff3355';
        c.beginPath(); c.arc(v.x, v.z, rad, 0, Math.PI * 2); c.fill();
      });
    } else {
      g.markers.forEach((m) => {
        c.fillStyle = m.locked ? '#555' : m.color;
        c.beginPath(); c.arc(m.x, m.z, rad * 1.4, 0, Math.PI * 2); c.fill();
      });
      c.fillStyle = 'rgba(200,200,220,0.6)';
      Traffic.cars.forEach((t) => { c.fillRect(t.x - 3, t.z - 3, 6, 6); });
      Landmarks.pois.forEach((p) => { c.fillStyle = p.color; c.fillRect(p.x - rad, p.z - rad, rad * 2, rad * 2); });
      if (Landmarks.train) { c.fillStyle = '#ffd400'; c.fillRect(Landmarks.trainState.x - Landmarks.trainLen, Landmarks.ST.trackZ - 4, Landmarks.trainLen, 8); }
    }
  },

  // ------------------------------------------------------------ peta besar
  openMap() {
    if (this.g.state === 'race') return;
    this.openOverlay('map');
    this.drawBigMap();
    const d = DB.data;
    this.$('event-list').innerHTML = DATA.EVENTS.map((ev) => {
      const ti = DATA.TYPE_INFO[ev.type];
      const locked = d.rep < ev.req;
      const won = d.done[ev.id] === 1;
      return `<div class="ev-item ${locked ? 'locked' : ''}" data-ev="${ev.id}">
        <div class="dot" style="background:${ti.color}">${ti.icon}</div>
        <div class="t"><b>${ev.name}</b><small>${ti.name} · Tier ${ev.tier}${locked ? ' · 🔒 ' + ev.req + ' REP' : ''}</small></div>
        ${won ? '<span class="won">🏆</span>' : ''}</div>`;
    }).join('') + Landmarks.pois.map((po) => `<div class="ev-item" data-poi="${po.id}">
        <div class="dot" style="background:${po.color}">${po.icon}</div>
        <div class="t"><b>${U.escape(po.label)}</b><small>Tempat · klik untuk GPS</small></div></div>`).join('');
    this.$('event-list').querySelectorAll('.ev-item[data-ev]').forEach((e) => e.addEventListener('click', () => this.openEvent(DATA.eventById(e.dataset.ev), true)));
    this.$('event-list').querySelectorAll('.ev-item[data-poi]').forEach((e) => e.addEventListener('click', () => this.gpsPoi(e.dataset.poi)));
  },
  drawBigMap() {
    const cv = this.el.bigmap, c = cv.getContext('2d');
    const CW = cv.width, CH = cv.height;
    const minX = -30, maxX = 2000, minZ = -150, maxZ = 800;
    const s = Math.min((CW - 30) / (maxX - minX), (CH - 30) / (maxZ - minZ));
    const ox = (CW - (maxX - minX) * s) / 2, oy = (CH - (maxZ - minZ) * s) / 2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#07050f'; c.fillRect(0, 0, CW, CH);
    // diputar 180° agar konsisten dengan minimap (arah +z ke atas)
    const T = (x, z) => [ox + (maxX - x) * s, oy + (maxZ - z) * s];
    this._bmT = T;
    c.setTransform(-s, 0, 0, -s, ox + maxX * s, oy + maxZ * s);
    this._drawRoads(c);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.font = 'bold 13px Rajdhani, Arial'; c.fillStyle = 'rgba(255,255,255,0.55)'; c.textAlign = 'center';
    const lb = (t, x, z) => { const q = T(x, z); c.fillText(t, q[0], q[1]); };
    lb('KOTA NEOPOLIS', 400, 830 > maxZ ? 790 : 830);
    lb('TEROWONGAN', 1000, 440);
    lb('BANDARA NEOPOLIS', 1580, 790);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const g = this.g;
    // rute GPS
    if (g.gps) {
      const ev = DATA.eventById(g.gps);
      if (ev) {
        const built = buildRoute(ev);
        c.strokeStyle = DATA.TYPE_INFO[ev.type].color; c.lineWidth = 3; c.globalAlpha = 0.6;
        c.beginPath();
        built.path.pts.forEach((pt, i) => { const q = T(pt.x, pt.z); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
        if (ev.loop) c.closePath();
        c.stroke(); c.globalAlpha = 1;
      }
    }
    g.markers.forEach((m) => {
      const q = T(m.x, m.z);
      c.fillStyle = m.locked ? '#444' : m.color;
      c.shadowColor = m.color; c.shadowBlur = m.locked ? 0 : 12;
      c.beginPath(); c.arc(q[0], q[1], 11, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = '#111'; c.font = 'bold 13px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(m.icon, q[0], q[1] + 1);
    });
    // tempat penting (landmark)
    Landmarks.pois.forEach((po) => {
      const q = T(po.x, po.z);
      c.fillStyle = po.color; c.shadowColor = po.color; c.shadowBlur = 10;
      c.fillRect(q[0] - 9, q[1] - 9, 18, 18);
      c.shadowBlur = 0;
      c.fillStyle = '#111'; c.font = 'bold 12px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(po.icon, q[0], q[1] + 1);
      c.fillStyle = '#fff'; c.font = 'bold 11px Rajdhani, Arial'; c.textBaseline = po.above ? 'bottom' : 'top';
      c.fillText(po.label, q[0], po.above ? q[1] - 11 : q[1] + 11);
    });
    const p = g.player;
    if (p) {
      const q = T(p.x, p.z);
      c.save(); c.translate(q[0], q[1]); c.rotate(-p.h + Math.PI);
      c.fillStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 10;
      c.beginPath(); c.moveTo(0, 13); c.lineTo(8, -9); c.lineTo(0, -4); c.lineTo(-8, -9); c.closePath(); c.fill();
      c.restore();
    }
  },
  mapClick(e) {
    const r = this.el.bigmap.getBoundingClientRect();
    const cv = this.el.bigmap;
    const x = (e.clientX - r.left) * (cv.width / r.width), y = (e.clientY - r.top) * (cv.height / r.height);
    let best = null, bd = 20;
    this.g.markers.forEach((m) => {
      const q = this._bmT(m.x, m.z);
      const d = Math.hypot(q[0] - x, q[1] - y);
      if (d < bd) { bd = d; best = m; }
    });
    let bestPoi = null;
    Landmarks.pois.forEach((po) => {
      const q = this._bmT(po.x, po.z);
      const d = Math.hypot(q[0] - x, q[1] - y);
      if (d < bd) { bd = d; bestPoi = po; best = null; }
    });
    if (bestPoi) { this.gpsPoi(bestPoi.id); return; }
    if (best) { if (best.ev) this.openEvent(best.ev, true); else { this.g.gps = 'garage'; this.toast('GPS diarahkan ke Garasi'); this.closeOverlay('map'); } }
  },
  gpsPoi(id) {
    const po = Landmarks.pois.find((q) => q.id === id);
    if (!po) return;
    this.g.gps = 'poi:' + id;
    this.toast('GPS diarahkan ke ' + po.label);
    this.closeOverlay('map');
  },

  // ------------------------------------------------------------ info event
  openEvent(ev, fromMap) {
    const d = DB.data, tier = DATA.TIER[ev.tier], ti = DATA.TYPE_INFO[ev.type];
    const locked = d.rep < ev.req;
    const best = d.best[ev.id];
    const route = buildRoute(ev);
    const lenKm = (route.path.length * (ev.loop ? ev.laps : 1) / 1000).toFixed(2);
    const p = this.$('event-panel');
    p.innerHTML = `
      <div class="ev-head"><div class="ev-icon" style="background:${ti.color}">${ti.icon}</div>
        <div><div class="ev-title">${ev.name}</div><div class="ev-type">${ti.name} · Tier ${ev.tier}${d.done[ev.id] === 1 ? ' · 🏆 Sudah dimenangkan' : ''}</div></div></div>
      <div class="kv"><span>Jarak total</span><b>${lenKm} km${ev.loop ? ' (' + ev.laps + ' putaran)' : ''}</b></div>
      <div class="kv"><span>Lawan</span><b>${ev.type === 'drift' ? 'Skor target' : (ev.opp || 3) + ' pembalap'}</b></div>
      <div class="kv"><span>Hadiah juara 1/2/3</span><b>${tier.money.map(U.fmtMoney).join(' / ')}</b></div>
      <div class="kv"><span>Reputasi</span><b>+${tier.rep[0]} REP</b></div>
      ${ev.type === 'drift' ? `<div class="kv"><span>Target emas</span><b>${ev.targets[0].toLocaleString('id-ID')} poin</b></div>` : ''}
      <div class="kv"><span>Rekor kamu</span><b>${best ? (ev.type === 'drift' ? best.toLocaleString('id-ID') + ' poin' : U.fmtTime(best)) : '-'}</b></div>
      ${ev.type === 'drag' ? '<p class="small muted">Drag memakai transmisi MANUAL: <kbd>E</kbd> naik gigi, <kbd>Q</kbd> turun gigi. Oper saat lampu hijau!</p>' : ''}
      ${ev.type === 'drift' ? '<p class="small muted">Gunakan rem tangan (<kbd>Spasi</kbd>) dan gas untuk drift. Drift panjang = pengali skor. Menabrak = skor rantai hangus.</p>' : ''}
      ${locked ? `<p class="lock">🔒 Butuh ${ev.req} REP (kamu: ${d.rep})</p>` : ''}
      <div class="ev-actions">
        <button class="btn primary" id="ev-start" ${locked ? 'disabled' : ''}>MULAI BALAPAN</button>
        ${fromMap ? '<button class="btn ghost" id="ev-gps">ATUR GPS</button>' : ''}
        <button class="btn ghost" id="ev-cancel">BATAL</button>
      </div>`;
    this.openOverlay('eventinfo');
    this.$('ev-start').onclick = () => { this.closeOverlay('eventinfo'); this.g.startRace(ev); };
    this.$('ev-cancel').onclick = () => this.closeOverlay('eventinfo');
    const gb = this.$('ev-gps');
    if (gb) gb.onclick = () => { this.g.gps = ev.id; this.toast('GPS diarahkan ke ' + ev.name); this.closeOverlay('eventinfo'); };
  },

  // ------------------------------------------------------------ hasil
  showResults(ev, r) {
    const p = this.$('results-panel');
    const isDrift = ev.type === 'drift';
    const title = r.place === 1 ? 'JUARA 1!' : 'POSISI ' + r.place;
    p.innerHTML = `
      <div class="res-place ${r.place === 1 ? 'win' : ''}">${title}</div>
      <p style="text-align:center;margin:4px 0 0" class="muted">${ev.name}${r.newBest ? ' · <b style="color:#7cff00">REKOR BARU!</b>' : ''}</p>
      <table class="res-table">${r.rows.map((row, i) => `<tr class="${row.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${U.escape(row.name)}<br><small class="muted">${row.car}</small></td><td>${row.text}</td></tr>`).join('')}</table>
      ${!isDrift && isFinite(r.bestLap) ? `<div class="kv"><span>Putaran tercepat</span><b>${U.fmtTime(r.bestLap)}</b></div>` : ''}
      ${!isDrift ? '<p class="small muted">* = estimasi waktu (belum finis)</p>' : ''}
      <div class="reward"><span class="m">+${U.fmtMoney(r.money)}</span><span class="r">+${r.rep} REP</span></div>
      <div class="ev-actions"><button class="btn ghost" id="rs-retry">ULANGI</button><button class="btn primary" id="rs-ok">LANJUT</button></div>`;
    this.openOverlay('results');
    this.$('rs-ok').onclick = () => { this.closeOverlay('results'); this.g.endRace(); };
    this.$('rs-retry').onclick = () => { this.closeOverlay('results'); this.g.restartRace(); };
    // cek event baru terbuka
    const newly = DATA.EVENTS.filter((e) => e.req > DB.data.rep - r.rep && e.req <= DB.data.rep);
    if (newly.length) setTimeout(() => this.toast('🔓 Event baru terbuka: ' + newly.map((e) => e.name).join(', '), 'good'), 600);
  },

  // ------------------------------------------------------------ menu jeda
  openPause() {
    const g = this.g;
    const inRace = g.state === 'race';
    this.$('pause-title').textContent = inRace ? 'BALAPAN DIJEDA' : 'MENU';
    const btns = inRace
      ? [['LANJUTKAN', 'resume', 'primary'], ['ULANGI BALAPAN', 'restart'], ['KELUAR BALAPAN', 'quit', 'danger'], ['LAGU BERIKUTNYA ♪', 'music'], ['PENGATURAN', 'settings'], ['KONTROL', 'help'], ['⏻ KELUAR GAME', 'exit', 'danger']]
      : [['LANJUTKAN', 'resume', 'primary'], ['PETA & EVENT', 'map'], ['KE GARASI', 'garage', 'cyan'], ['PAPAN PERINGKAT', 'leader'], ['LAGU BERIKUTNYA ♪', 'music'], ['PENGATURAN', 'settings'], ['KONTROL', 'help'], ['SIMPAN & KE MENU AWAL', 'logout'], ['⏻ KELUAR GAME', 'exit', 'danger']];
    const box = this.$('pause-btns');
    box.innerHTML = btns.map(([t, a, c]) => `<button class="btn ${c || ''}" data-a="${a}">${t}</button>`).join('');
    box.querySelectorAll('button').forEach((b) => b.onclick = () => this.pauseAction(b.dataset.a));
    this.$('pause-user').innerHTML = `Pemain: <b>${U.escape(DB.user || '-')}</b> · ${DB.isGuest ? 'Tamu (lokal)' : DB.mode === 'sheets' ? 'Google Sheets' : 'Lokal'}<br>♪ ${U.escape(AudioSys.currentTitle())}`;
    this.openOverlay('pause');
  },
  pauseAction(a) {
    const g = this.g;
    if (a === 'resume') this.closeOverlay('pause');
    else if (a === 'restart') { this.closeOverlay('pause'); g.restartRace(); }
    else if (a === 'quit') { this.closeOverlay('pause'); g.endRace(true); }
    else if (a === 'map') this.openMap();
    else if (a === 'garage') { this.closeOverlay('pause'); g.enterGarage(); }
    else if (a === 'leader') this.openLeader();
    else if (a === 'music') { AudioSys.nextTrack(); this.openPause(); }
    else if (a === 'settings') this.openOverlay('settings');
    else if (a === 'help') this.openOverlay('help');
    else if (a === 'logout') { this.closeOverlay('pause'); g.logout(); }
    else if (a === 'exit') { if (confirm('Keluar dari game sepenuhnya? Progres akan disimpan.')) { this.hide('pause'); g.quit(); } }
  },

  async openLeader() {
    this.openOverlay('leader');
    const body = this.$('leader-body');
    body.innerHTML = '<p class="muted">Memuat…</p>';
    try {
      const rows = await DB.leaderboard();
      if (!rows.length) { body.innerHTML = '<p class="muted">Belum ada data.</p>'; return; }
      body.innerHTML = `<table><tr><th>#</th><th>PEMAIN</th><th>REP</th><th>MENANG</th><th>MOBIL</th></tr>${rows.map((r, i) => `<tr class="${String(r.username).toLowerCase() === String(DB.user).toLowerCase() ? 'me' : ''}"><td>${i + 1}</td><td>${U.escape(r.username)}</td><td>${r.rep}</td><td>${r.wins}</td><td>${U.escape(r.car || '-')}</td></tr>`).join('')}</table>
        ${DB.mode === 'local' ? '<p class="small muted">Mode lokal: hanya akun di browser ini. Hubungkan Google Sheets untuk peringkat online.</p>' : ''}`;
    } catch (e) {
      body.innerHTML = `<p class="lock">Gagal memuat: ${U.escape(e.message)}</p>`;
    }
  },

  // ------------------------------------------------------------ garasi
  openGarage() {
    this.show('garage');
    this.gTab = 'mine';
    [...this.$('g-tabs').children].forEach((c) => c.classList.toggle('active', c.dataset.tab === 'mine'));
    this.gSel = null; this.styleDraft = null;
    this.renderGarage();
  },
  closeGarage() { this.hide('garage'); },
  curEntry() { return DB.data.cars[DB.data.current]; },
  wallet() {
    this.$('g-money').textContent = U.fmtMoney(DB.data.money);
    this.$('g-rep').textContent = DB.data.rep;
  },
  renderGarage() {
    this.wallet();
    const box = this.$('g-content');
    const d = DB.data;
    const tab = this.gTab;
    if (tab === 'mine') {
      if (this.gSel == null) this.gSel = d.current;
      box.innerHTML = d.cars.map((c, i) => {
        const car = DATA.carById(c.model), st = DATA.computeStats(c);
        return `<div class="item ${i === this.gSel ? 'sel' : ''}" data-i="${i}">
          <div class="row"><span class="name">${car.name}<span class="car-cls cls-${car.cls}">${car.cls}</span></span>${i === d.current ? '<span class="sub">● DIPAKAI</span>' : ''}</div>
          <div class="sub">Rating ${st.overall.toFixed(1)} · ${Math.round(st.top * 3.6)} km/j</div>
          ${i === this.gSel ? `<div class="row" style="margin-top:8px">
            ${i !== d.current ? `<button class="btn sm primary" data-use="${i}">PAKAI</button>` : '<span></span>'}
            ${d.cars.length > 1 ? `<button class="btn sm danger" data-sell="${i}">JUAL ${U.fmtMoney(DATA.sellPrice(c))}</button>` : ''}</div>` : ''}
        </div>`;
      }).join('');
      box.querySelectorAll('.item').forEach((e) => e.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        this.gSel = +e.dataset.i; this.renderGarage();
      }));
      box.querySelectorAll('[data-use]').forEach((b) => b.onclick = () => { d.current = +b.dataset.use; DB.save(); AudioSys.click(); this.renderGarage(); });
      box.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => {
        const i = +b.dataset.sell, c = d.cars[i];
        const car = DATA.carById(c.model);
        if (!confirm(`Jual ${car.name} seharga ${U.fmtMoney(DATA.sellPrice(c))}?`)) return;
        d.money += DATA.sellPrice(c);
        d.cars.splice(i, 1);
        if (d.current >= i && d.current > 0) d.current--;
        this.gSel = d.current;
        DB.save(); AudioSys.cash(); this.renderGarage();
      });
      this.previewEntry(d.cars[this.gSel]);
    } else if (tab === 'dealer') {
      const cars = DATA.CARS.filter((c) => !c.hidden);
      if (this.gSel == null) this.gSel = cars[0].id;
      box.innerHTML = cars.map((car) => {
        const owned = d.cars.some((c) => c.model === car.id);
        const need = CLASS_REP[car.cls] || 0;
        const locked = d.rep < need;
        const sel = this.gSel === car.id;
        return `<div class="item ${sel ? 'sel' : ''}" data-id="${car.id}">
          <div class="row"><span class="name">${car.name}<span class="car-cls cls-${car.cls}">${car.cls}</span></span><span class="price">${U.fmtMoney(car.price)}</span></div>
          <div class="sub">${car.desc}${owned ? ' · <b>Sudah punya</b>' : ''}${locked ? ` · <span class="lock">🔒 ${need} REP</span>` : ''}</div>
          ${sel ? `<div class="row" style="margin-top:8px"><span></span><button class="btn sm primary" data-buy="${car.id}" ${locked || d.money < car.price ? 'disabled' : ''}>BELI</button></div>` : ''}
        </div>`;
      }).join('');
      box.querySelectorAll('.item').forEach((e) => e.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        this.gSel = e.dataset.id; this.renderGarage();
      }));
      box.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => {
        const car = DATA.carById(b.dataset.buy);
        if (d.money < car.price) { this.toast('Uang tidak cukup', 'warn'); return; }
        if (!confirm(`Beli ${car.name} seharga ${U.fmtMoney(car.price)}?`)) return;
        d.money -= car.price;
        d.cars.push(this._dealerEntry || DATA.newCarEntry(car.id));
        d.current = d.cars.length - 1;
        DB.save(true); AudioSys.cash();
        this.toast(car.name + ' sekarang milikmu!', 'good');
        this.gTab = 'mine'; this.gSel = d.current;
        [...this.$('g-tabs').children].forEach((c) => c.classList.toggle('active', c.dataset.tab === 'mine'));
        this._dealerEntry = null;
        this.renderGarage();
      });
      if (!this._dealerEntry || this._dealerEntry.model !== this.gSel) this._dealerEntry = DATA.newCarEntry(this.gSel, U.pick(DATA.STYLE.paints.slice(0, 9)));
      this.previewEntry(this._dealerEntry);
    } else if (tab === 'perf') {
      const e = this.curEntry();
      const car = DATA.carById(e.model);
      box.innerHTML = `<div class="sec">${car.name} <small>Upgrade dipasang langsung</small></div>` + Object.keys(DATA.PARTS).map((k) => {
        const part = DATA.PARTS[k];
        const lv = e.up[k] || 0;
        const max = lv >= 3;
        const price = max ? 0 : DATA.partPrice(e, k, lv + 1);
        return `<div class="item" data-part="${k}">
          <div class="row"><span class="name">${part.name}</span><span class="sub">${DATA.PART_LEVELS[lv]}</span></div>
          <div class="sub">${part.desc}</div>
          <div class="lvl">${[1, 2, 3].map((l) => `<i class="${l <= lv ? 'on' : ''}"></i>`).join('')}</div>
          <div class="row" style="margin-top:8px"><span class="price">${max ? 'MAKSIMAL' : U.fmtMoney(price)}</span>
          ${max ? '' : `<button class="btn sm primary" data-up="${k}" ${d.money < price ? 'disabled' : ''}>PASANG ${DATA.PART_LEVELS[lv + 1].toUpperCase()}</button>`}</div>
        </div>`;
      }).join('');
      box.querySelectorAll('[data-up]').forEach((b) => {
        const k = b.dataset.up;
        b.onmouseenter = () => { const nx = JSON.parse(JSON.stringify(e)); nx.up[k]++; this.renderStats(e, DATA.computeStats(nx)); };
        b.onmouseleave = () => this.renderStats(e);
        b.onclick = () => {
          const lv = e.up[k] || 0;
          const price = DATA.partPrice(e, k, lv + 1);
          if (d.money < price) return;
          d.money -= price; e.up[k] = lv + 1;
          DB.save(); AudioSys.cash();
          this.toast(DATA.PARTS[k].name + ' → ' + DATA.PART_LEVELS[lv + 1], 'good');
          this.renderGarage();
        };
      });
      this.previewEntry(e);
    } else if (tab === 'style') {
      this.renderStyle();
    }
  },
  previewEntry(e) {
    if (!e) return;
    const key = JSON.stringify([e.uid, e.model, e.style]);
    if (this._prevKey !== key) { Showroom.setCar(e); this._prevKey = key; }
    this.renderStats(e);
  },
  renderStats(e, cmp) {
    const car = DATA.carById(e.model), st = DATA.computeStats(e);
    this.$('g-stats').innerHTML = `
      <div class="car-name">${car.name}<span class="car-cls cls-${car.cls}">${car.cls}</span></div>
      <div class="desc">${car.desc}</div>${this.statBars(st, cmp)}
      <div class="kv"><span>Top speed</span><b>${Math.round((cmp || st).top * 3.6)} km/j</b></div>
      <div class="kv"><span>Kapasitas NOS</span><b>${(cmp || st).nitroCap.toFixed(1)} dtk</b></div>
      <div class="kv"><span>Rating total</span><b>${(cmp || st).overall.toFixed(1)}</b></div>`;
  },

  renderStyle() {
    const e = this.curEntry();
    const S = DATA.STYLE, P = S.prices;
    if (!this.styleDraft) this.styleDraft = JSON.parse(JSON.stringify(e.style));
    const dr = this.styleDraft, cur = e.style;
    const cost = this.styleCost(cur, dr);
    const sw = (field, list, allowNone) => list.map((c) => c
      ? `<div class="sw ${dr[field] === c ? 'sel' : ''}" style="background:${c}" data-f="${field}" data-v="${c}"></div>`
      : `<div class="sw none ${!dr[field] ? 'sel' : ''}" data-f="${field}" data-v="" title="Tanpa"></div>`).join('');
    const chips = (field, list, pr) => list.map((n, i) => `<button class="chip ${dr[field] === i ? 'sel' : ''}" data-f="${field}" data-n="${i}">${n}${pr && pr[i] ? ' · $' + pr[i] : ''}</button>`).join('');
    const box = this.$('g-content');
    box.innerHTML = `
      <div class="sec">DESAIN SENDIRI (LIVERY) <small>$${P.livery}</small></div>
      <div class="sub">${e.style.custom ? '✔ Mobil ini memakai desain buatanmu.' : 'Gambar livery sendiri atau impor gambar PNG/JPG.'}</div>
      <button class="btn sm cyan livery-btn" id="sty-design">🎨 BUKA STUDIO DESAIN</button>
      <div class="sec">WARNA CAT <small>$${P.paint}</small></div>
      <div class="swatches">${sw('paint', S.paints)}<input type="color" id="pc-custom" value="${dr.paint}" title="Warna bebas"></div>
      <div class="sec">FINISHING <small>$${P.finish}</small></div>
      <div class="chips">${S.finishes.map((f) => `<button class="chip ${dr.finish === f.id ? 'sel' : ''}" data-fin="${f.id}">${f.name}</button>`).join('')}</div>
      <div class="sec">VELG <small>$${P.rim}</small></div>
      <div class="swatches">${sw('rim', S.rims)}</div>
      <div class="sec">NEON BAWAH <small>$${P.glow}</small></div>
      <div class="swatches">${sw('glow', S.glows)}</div>
      <div class="sec">SPOILER</div>
      <div class="chips">${chips('spoiler', S.spoilers, P.spoiler)}</div>
      <div class="sec">BODY KIT</div>
      <div class="chips">${chips('kit', S.kits, P.kit)}</div>
      <div class="sec">VINYL / STIKER <small>$${P.vinyl}</small></div>
      <div class="chips">${chips('vinyl', S.vinyls)}</div>
      <div class="sec">WARNA VINYL <small>$${P.vinylColor}</small></div>
      <div class="swatches">${sw('vinylColor', ['#ffffff', '#111111', '#ff2bd6', '#00e5ff', '#ffd400', '#7cff00', '#e8173c', '#ff6a00', '#7a2cff'])}</div>
      <div class="sec">KACA FILM <small>$${P.tint}</small></div>
      <div class="chips">${chips('tint', S.tints)}</div>
      <div class="style-foot"><span class="cost">${cost ? 'Biaya: ' + U.fmtMoney(cost) : 'Tidak ada perubahan'}</span>
        <button class="btn sm ghost" id="sty-reset">RESET</button>
        <button class="btn sm primary" id="sty-buy" ${!cost || DB.data.money < cost ? 'disabled' : ''}>BELI & PASANG</button></div>`;
    box.querySelectorAll('.sw').forEach((s) => s.onclick = () => { dr[s.dataset.f] = s.dataset.v || null; this.renderStyle(); });
    box.querySelectorAll('[data-n]').forEach((c) => c.onclick = () => { dr[c.dataset.f] = +c.dataset.n; this.renderStyle(); });
    box.querySelectorAll('[data-fin]').forEach((c) => c.onclick = () => { dr.finish = c.dataset.fin; this.renderStyle(); });
    const pc = this.$('pc-custom');
    pc.onchange = () => { dr.paint = pc.value; this.renderStyle(); };
    this.$('sty-reset').onclick = () => { this.styleDraft = null; this.renderStyle(); };
    this.$('sty-design').onclick = () => {
      if (JSON.stringify(cur) !== JSON.stringify(dr) && !confirm('Perubahan tampilan yang belum dibeli akan dibatalkan. Lanjut ke Studio Desain?')) return;
      this.styleDraft = null;
      Designer.open(e);
    };
    this.$('sty-buy').onclick = () => {
      if (DB.data.money < cost) return;
      DB.data.money -= cost;
      e.style = JSON.parse(JSON.stringify(dr));
      DB.save(); AudioSys.cash();
      this.toast('Tampilan baru terpasang!', 'good');
      this.styleDraft = null;
      this.renderStyle(); this.wallet();
    };
    const keep = box.scrollTop;
    this.previewEntry({ uid: e.uid, model: e.model, up: e.up, style: dr });
    box.scrollTop = keep;
  },
  styleCost(a, b) {
    const P = DATA.STYLE.prices;
    let c = 0;
    if (a.paint !== b.paint) c += P.paint;
    if (a.finish !== b.finish) c += P.finish;
    if (a.rim !== b.rim) c += P.rim;
    if ((a.glow || null) !== (b.glow || null) && b.glow) c += P.glow;
    if (a.spoiler !== b.spoiler) c += P.spoiler[b.spoiler];
    if (a.kit !== b.kit) c += P.kit[b.kit];
    if (a.vinyl !== b.vinyl && b.vinyl) c += P.vinyl;
    if (a.vinylColor !== b.vinylColor && b.vinyl) c += P.vinylColor;
    if (a.tint !== b.tint) c += P.tint;
    if ((a.glow || null) !== (b.glow || null) && !b.glow) c += 0;
    return c || (JSON.stringify(a) !== JSON.stringify(b) ? 50 : 0);
  },
};

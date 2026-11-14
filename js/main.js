/* =========================================================================
   NEON RUSH — loop utama, input, kamera, free roam
   ========================================================================= */
const Input = {
  keys: {},
  touch: {},
  steer: 0,
  pad: null,
  init(game) {
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      // pakai keyboard → sembunyikan tombol sentuh (laptop layar sentuh)
      if (UI.isTouch) { UI.isTouch = false; document.getElementById('touch').classList.add('hidden'); }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) game.onKey(e.code);
      this.keys[e.code] = true;
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    this._padPrev = {};
  },
  pollPad(game) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let p = null;
    for (const g of pads) if (g && g.connected) { p = g; break; }
    this.pad = p;
    if (!p) return;
    // B=reset, Y=kamera, LB/RB=gigi (RB juga masuk event), Back=peta, Start=menu, D-pad atas=Enter
    const map = { 1: 'KeyR', 3: 'KeyC', 4: 'KeyQ', 5: 'KeyE', 8: 'KeyM', 9: 'Escape', 12: 'Enter' };
    Object.keys(map).forEach((i) => {
      const b = p.buttons[i];
      const on = !!(b && b.pressed);
      if (on && !this._padPrev[i]) game.onKey(map[i]);
      this._padPrev[i] = on;
    });
  },
  read(dt) {
    const k = this.keys, t = this.touch, p = this.pad;
    let thr = (k.KeyW || k.ArrowUp || t.gas) ? 1 : 0;
    let brk = (k.KeyS || k.ArrowDown || t.brake) ? 1 : 0;
    let target = ((k.KeyD || k.ArrowRight || t.right) ? 1 : 0) - ((k.KeyA || k.ArrowLeft || t.left) ? 1 : 0);
    let hb = (k.Space || t.hand) ? 1 : 0;
    let nos = !!(k.ShiftLeft || k.ShiftRight || k.KeyN || t.nitro);
    let analog = false;
    if (p) {
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) { target = ax; analog = true; }
      const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
      if (rt > 0.05) thr = Math.max(thr, rt);
      if (lt > 0.05) brk = Math.max(brk, lt);
      if (p.buttons[2] && p.buttons[2].pressed) hb = 1;
      if (p.buttons[0] && p.buttons[0].pressed) nos = true;
    }
    if (analog) this.steer = target;
    else {
      const rate = target === 0 ? 7 : (Math.sign(target) !== Math.sign(this.steer) ? 9 : 4.5);
      this.steer += U.clamp(target - this.steer, -rate * dt, rate * dt);
    }
    return { throttle: thr, brake: brk, steer: this.steer, handbrake: hb, nitro: nos };
  },
};

const Game = {
  state: 'boot',
  paused: false,
  settings: { music: 0.6, sfx: 0.8, quality: 'medium', trans: 'auto', cam: 0, traffic: true, fps: false, time: 'dusk' },
  markers: [],
  gps: null,
  fps: 60,

  init() {
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('nr_settings') || '{}')); } catch (e) { /* */ }
    if (!localStorage.getItem('nr_settings') && (innerWidth < 900 || navigator.maxTouchPoints > 0)) this.settings.quality = 'low';
    const q = this.settings.quality;
    const canvas = document.getElementById('game');
    let r;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: q !== 'low', powerPreference: 'high-performance' });
    } catch (e) {
      document.getElementById('loadtxt').textContent = 'Browser ini tidak mendukung WebGL. Coba Chrome/Edge/Firefox terbaru.';
      return;
    }
    this.renderer = r;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'high' ? 2 : q === 'medium' ? 1.5 : 1));
    r.setSize(innerWidth, innerHeight);
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    if (q !== 'low') { r.shadowMap.enabled = true; r.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 6000);
    this.camState = { h: 0, pos: new THREE.Vector3() };
    addEventListener('resize', () => this.resize());

    DB.init();
    CarFactory.loadCustomModels(); // model .glb buatan sendiri (jika ada di config)
    UI.loading(0.15, 'Membangun kota Neopolis…');
    setTimeout(() => {
      World.build(this.scene, r, q, this.settings.time);
      r.toneMappingExposure = World.T.exposure;
      UI.loading(0.45, 'Menggali terowongan & membangun bandara…');
      setTimeout(() => {
        Airport.build(this.scene, World.T, q);
        Landmarks.build(this.scene, World.T, q);
        TrafficLights.build(this.scene);
        UI.loading(0.8, 'Menyiapkan bengkel…');
        FX.init(this.scene);
        Showroom.init(r);
        Post.init(r, this.scene, this.camera, q, World.T);
        this.resize(); // PMREM mengubah viewport renderer → setel ulang
        this.buildMarkers();
        Input.init(this);
        UI.init(this);
        // mobil contoh di showroom saat login
        Showroom.setCar(Object.assign(DATA.newCarEntry('hayate', '#ff2bd6'), { style: Object.assign(DATA.defaultStyle('#ff2bd6'), { glow: '#00e5ff', spoiler: 3, kit: 1, vinyl: 2, finish: 'pearl' }) }));
        Showroom.active = false;
        UI.loading(1, 'Siap!');
        setTimeout(() => {
          UI.hide('loading');
          this.state = 'auth';
          UI.showAuth();
          UI.hudMode('none');
        }, 250);
        this.last = performance.now();
        requestAnimationFrame((t) => this.loop(t));
      }, 30);
    }, 30);
  },

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    Showroom.resize(w, h);
    if (typeof Post !== 'undefined') Post.resize(w, h);
  },

  saveSettings() { try { localStorage.setItem('nr_settings', JSON.stringify(this.settings)); } catch (e) { /* */ } },
  applySettings() {
    this.saveSettings();
    AudioSys.setVolumes(this.settings.music, this.settings.sfx);
    if (this.player && !(this.state === 'race' && Race.ev && Race.ev.type === 'drag')) this.player.manual = this.settings.trans === 'manual';
  },

  // ------------------------------------------------------------ alur
  onLogin() {
    AudioSys.init();
    AudioSys.setVolumes(this.settings.music, this.settings.sfx);
    if (!AudioSys.playing) AudioSys.randomTrack();
    UI.hide('auth');
    if (!DB.data.cars.length) {
      this.state = 'starter';
      Showroom.active = true;
      Showroom.setShift(0.1);
      UI.showStarter();
    } else {
      UI.toast('Selamat datang kembali, ' + DB.user + '!', 'good');
      this.enterRoam(true);
    }
  },
  logout() {
    DB.save(true);
    this.leaveWorld();
    DB.logout();
    this.state = 'auth';
    Showroom.active = false;
    UI.hudMode('none');
    UI.showAuth();
    UI.authMsg('Progres tersimpan. Sampai jumpa!', 'ok');
  },
  leaveWorld() {
    if (Race.active) Race.end();
    Traffic.clear(this.scene);
    if (this.player) { this.scene.remove(this.player.mesh); CarFactory.dispose(this.player.mesh); this.player = null; }
    this.markers.forEach((m) => { m.obj.visible = false; });
    FX.clear();
    AudioSys.silence();
  },

  buildPlayer() {
    const entry = DB.data.cars[DB.data.current];
    const old = this.player;
    const v = new Vehicle(entry, { player: true, name: DB.user });
    v.manual = this.settings.trans === 'manual';
    if (old) {
      v.place(old.x, old.z, old.h);
      this.scene.remove(old.mesh); CarFactory.dispose(old.mesh);
    }
    this.player = v;
    this.scene.add(v.mesh);
    // lampu sorot depan untuk pemain
    if (!this.headLight) {
      this.headLight = new THREE.SpotLight(0xfff2dd, 2.2, 70, 0.5, 0.6, 1.2);
      this.scene.add(this.headLight); this.scene.add(this.headLight.target);
      this.glowLight = new THREE.PointLight(0xffffff, 0, 8, 2);
      this.scene.add(this.glowLight);
    }
    this.headLight.intensity = World.T.beams ? 2.2 : 0;
    const g = entry.style.glow;
    this.glowLight.intensity = g ? (World.T.beams ? 2.2 : 0.8) : 0;
    if (g) this.glowLight.color.set(g);
  },

  enterRoam(spawnAtGarage) {
    this.state = 'roam';
    this.paused = false;
    Showroom.active = false;
    UI.closeGarage();
    UI.hide('starter');
    this.buildPlayer();
    if (spawnAtGarage) {
      const n = World.node(DATA.GARAGE_NODE[0], DATA.GARAGE_NODE[1]);
      this.player.place(n.x, n.z + 18, 0);
    }
    this.snapCamera();
    this.refreshMarkers();
    this.setTraffic();
    UI.hudMode('roam');
    this.garageCooldown = 2;
  },
  setTraffic() {
    Traffic.clear(this.scene);
    if (this.settings.traffic && this.state === 'roam' && this.player) Traffic.spawn(this.scene, this.settings.quality === 'low' ? 13 : 22, { x: this.player.x, z: this.player.z });
  },

  enterGarage() {
    if (this.state === 'race') return;
    this.state = 'garage';
    this.paused = false;
    Showroom.active = true;
    Showroom.setShift(0.06);
    UI.hudMode('none');
    AudioSys.silence();
    UI.openGarage();
  },
  leaveGarage() {
    const n = World.node(DATA.GARAGE_NODE[0], DATA.GARAGE_NODE[1]);
    this.state = 'roam';
    this.enterRoam(false);
    this.player.place(n.x, n.z + 18, 0);
    this.snapCamera();
  },

  // ------------------------------------------------------------ penanda
  buildMarkers() {
    DATA.EVENTS.forEach((ev) => {
      const ti = DATA.TYPE_INFO[ev.type];
      const n = DATA.evPoints(ev)[0];
      const obj = World.makeMarker(ti.color, ti.icon + ' ' + ti.name.toUpperCase());
      obj.position.set(n.x, 0, n.z);
      this.scene.add(obj);
      this.markers.push({ ev, obj, x: n.x, z: n.z, color: ti.color, icon: ti.icon, locked: false });
    });
    const g = World.node(DATA.GARAGE_NODE[0], DATA.GARAGE_NODE[1]);
    const obj = World.makeMarker('#4dd9ff', 'GARASI');
    obj.position.set(g.x, 0, g.z);
    this.scene.add(obj);
    this.markers.push({ ev: null, obj, x: g.x, z: g.z, color: '#4dd9ff', icon: 'G', locked: false });
    this.markers.forEach((m) => { m.obj.visible = false; });
  },
  refreshMarkers() {
    const d = DB.data;
    this.markers.forEach((m) => {
      m.locked = m.ev ? d.rep < m.ev.req : false;
      m.obj.visible = this.state === 'roam';
      const op = m.locked ? 0.05 : 0.16;
      m.obj.userData.beam.material.opacity = op;
      m.obj.userData.ring.material.opacity = m.locked ? 0.25 : 0.85;
    });
  },
  gpsTarget() {
    if (this.state === 'race' && Race.active) {
      const p = this.player;
      const tp = Race.path.pointAt(p.track.s + 35);
      return { x: tp.x, z: tp.z, label: ' ' };
    }
    if (!this.gps) return null;
    if (this.gps.startsWith('poi:')) {
      const po = Landmarks.pois.find((q) => 'poi:' + q.id === this.gps);
      if (po && Math.hypot(po.x - this.player.x, po.z - this.player.z) < 18) { this.gps = null; UI.toast('Tiba di ' + po.label, 'good'); return null; }
      return po ? { x: po.x, z: po.z } : null;
    }
    const m =this.gps === 'garage' ? this.markers.find((k) => !k.ev) : this.markers.find((k) => k.ev && k.ev.id === this.gps);
    return m ? { x: m.x, z: m.z } : null;
  },

  // ------------------------------------------------------------ balapan
  startRace(ev) {
    if (DB.data.rep < ev.req) { UI.toast('Event masih terkunci', 'warn'); return; }
    if (Race.active) Race.end();
    this.state = 'race';
    this.paused = false;
    this.gps = null;
    Traffic.clear(this.scene);
    this.markers.forEach((m) => { m.obj.visible = false; });
    FX.clear();
    Race.start(ev, this);
    this.snapCamera();
    UI.hudMode('race');
    UI.banner(ev.name, DATA.TYPE_INFO[ev.type].name + (ev.loop ? ' · ' + ev.laps + ' putaran' : ''), 2.6);
  },
  restartRace() {
    const ev = Race.ev;
    Race.end();
    this.startRace(ev);
  },
  endRace(quit) {
    const ev = Race.ev;
    Race.end();
    this.state = 'roam';
    const [n, n2] = DATA.evPoints(ev);
    const p = this.player;
    // muncul sedikit di depan penanda event
    const l = Math.hypot(n2.x - n.x, n2.z - n.z) || 1;
    const d = [(n2.x - n.x) / l, (n2.z - n.z) / l];
    p.place(n.x + d[0] * 20, n.z + d[1] * 20, Math.atan2(d[0], d[1]));
    this.snapCamera();
    this.refreshMarkers();
    this.setTraffic();
    UI.hudMode('roam');
    this.eventCooldown = 3;
    if (quit) UI.toast('Keluar dari balapan');
  },

  togglePause() {
    if (this.state !== 'roam' && this.state !== 'race') return;
    if (UI.anyOverlay()) {
      if (UI.isOpen('results')) return;
      OVERLAYS.forEach((o) => UI.hide(o));
      this.paused = false;
    } else UI.openPause();
  },

  onKey(code) {
    AudioSys.init();
    if (code === 'Escape' || code === 'KeyP') {
      if (this.state === 'garage') { if (Designer.isOpen && Designer.isOpen()) Designer.close(); else this.leaveGarage(); return; }
      this.togglePause();
      return;
    }
    if (this.state !== 'roam' && this.state !== 'race') return;
    if (code === 'KeyM') { if (UI.isOpen('map')) UI.closeOverlay('map'); else if (!this.paused && this.state === 'roam') UI.openMap(); return; }
    if (this.paused) return;
    const p = this.player;
    if (code === 'KeyT') AudioSys.nextTrack();
    else if (code === 'KeyC') { this.settings.cam = (this.settings.cam + 1) % 3; this.saveSettings(); }
    else if (code === 'KeyR') this.resetPlayer();
    else if (code === 'KeyE' || code === 'Enter' || code === 'Pad') {
      if (this.state === 'roam' && this.nearMarker) {
        const m = this.nearMarker;
        if (m.ev) UI.openEvent(m.ev); else this.enterGarage();
      } else if (p.manual && code === 'KeyE') {
        const perfect = p.shiftUp();
        if (perfect) { UI.popText('OPER SEMPURNA!', '#7cff00'); p.launch = 0.35; }
      }
    } else if (code === 'KeyQ' && p.manual) p.shiftDown();
  },

  resetPlayer() {
    const p = this.player;
    if (this.state === 'race' && Race.active) { Race.resetToTrack(p); Race.driftCrash(); } else {
      const s = World.roadSnap(p.x, p.z, p.h);
      p.place(s.x, s.z, s.h);
    }
    this.snapCamera();
  },

  // ------------------------------------------------------------ kamera
  snapCamera() {
    const p = this.player;
    if (!p) return;
    this.camState.h = p.h;
    this.camera.position.set(p.x - Math.sin(p.h) * 7, 3, p.z - Math.cos(p.h) * 7);
    this.camera.lookAt(p.x, 1, p.z);
  },
  updateCamera(dt) {
    const p = this.player, cam = this.camera, cs = this.camState;
    const mode = this.settings.cam;
    const sp = p.speed;
    // arah kamera mengikuti heading (sedikit tertinggal saat drift)
    let target = p.h;
    if (p.vF < -1 && p.inp.brake > 0) target = p.h; // mundur: tetap
    cs.h += U.angDiff(cs.h, target) * Math.min(1, dt * (mode === 2 ? 20 : 4.5));
    const fx = Math.sin(cs.h), fz = Math.cos(cs.h);
    if (mode === 2) {
      const sh = p.model.shape;
      const y = sh.clear + sh.hgt + sh.cabH * 0.75;
      cam.position.set(p.x + Math.sin(p.h) * 0.3, y, p.z + Math.cos(p.h) * 0.3);
      cam.lookAt(p.x + Math.sin(p.h) * 30, y - 0.6, p.z + Math.cos(p.h) * 30);
    } else {
      const dist = (mode === 0 ? 6.4 : 9.5) + sp * 0.025;
      const h = mode === 0 ? 2.25 : 3.4;
      const tx = p.x - fx * dist, tz = p.z - fz * dist;
      const k = 1 - Math.exp(-dt * 12);
      cam.position.x += (tx - cam.position.x) * k;
      cam.position.z += (tz - cam.position.z) * k;
      cam.position.y += (h - cam.position.y) * k;
      // jangan menembus gedung
      const o = { x: cam.position.x, z: cam.position.z, vx: 0, vz: 0, radius: 0.6 };
      World.collide(o);
      cam.position.x = o.x; cam.position.z = o.z;
      cam.lookAt(p.x + fx * 3, 1.0, p.z + fz * 3);
    }
    // FOV & guncangan saat cepat/nitro
    const fov = 60 + Math.min(22, sp * 0.28) + (p.nitroOn ? 8 : 0);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 3);
    cam.updateProjectionMatrix();
    if (p.nitroOn || sp > 55) {
      const s = (p.nitroOn ? 0.05 : 0.02);
      cam.position.x += U.rand(-s, s); cam.position.y += U.rand(-s, s);
    }
  },

  // ------------------------------------------------------------ simulasi
  step(dt) {
    const p = this.player;
    const racing = this.state === 'race' && Race.active;
    const cars = racing ? Race.cars : [p];
    // input pemain
    if (racing && (Race.state === 'finished' || p.track.finished)) {
      Object.assign(p.inp, { throttle: 0, brake: p.vF > 1 ? 0.5 : 0, steer: 0, handbrake: 0, nitro: false });
      // kemudi otomatis setelah finis
      const tp = Race.path.pointAt(p.track.s + 15);
      const diff = U.angDiff(p.h, Math.atan2(tp.x - p.x, tp.z - p.z));
      p.inp.steer = U.clamp(-diff * 2, -1, 1);
    } else {
      Object.assign(p.inp, Input.read(dt));
    }
    if (racing) Race.update(dt);
    const n = Math.max(1, Math.ceil(dt / 0.0125));
    const h = dt / n;
    let hitMax = 0;
    const planes = Airport.groundObstacles();
    for (let k = 0; k < n; k++) {
      // pesawat yang sedang di darat = rintangan berat
      for (const o of planes) for (const v of cars) { const hv = collideCars(v, o, true); if (v === p) hitMax = Math.max(hitMax, hv); }
      for (const v of cars) {
        v.update(h);
        const hit = v.collideWorld();
        if (v === p && hit > hitMax) hitMax = hit;
      }
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const hv = collideCars(cars[i], cars[j], false);
          if (hv > 2 && (cars[i] === p || cars[j] === p)) hitMax = Math.max(hitMax, hv);
        }
      }
      if (!racing) {
        for (const t of Traffic.cars) {
          const hv = collideCars(p, t, true);
          if (hv > 0.5) {
            t.stun = 2.5;
            if (hv > 3 && t.honk <= 0) { AudioSys.horn(); t.honk = 4; }
            hitMax = Math.max(hitMax, hv);
          }
        }
      }
    }
    if (!racing) Traffic.update(dt, [p]);
    cars.forEach((v) => v.sync(dt));
    // efek tabrakan
    if (hitMax > 3) {
      if (this._hitCd <= 0 || this._hitCd == null) {
        AudioSys.crash(hitMax);
        FX.sparks(p.x + Math.sin(p.h) * 2, 0.6, p.z + Math.cos(p.h) * 2, Math.min(14, Math.round(hitMax)));
        this._hitCd = 0.25;
        if (hitMax > 6) Race.driftCrash();
      }
    }
    this._hitCd = (this._hitCd || 0) - dt;
    // asap ban
    cars.forEach((v) => {
      const burnout = v.inp.throttle > 0 && v.speed < 7 && v.rpm > 0.7 && !v.frozen && v.gear === 1;
      if ((v.slip > 14 && v.speed > 7) || burnout || (v.inp.handbrake && v.speed > 8)) {
        if (Math.random() < (v === p ? 0.9 : 0.4)) {
          const back = -v.model.shape.len * 0.31;
          const rx = -Math.cos(v.h), rz = Math.sin(v.h);
          const bx = v.x + Math.sin(v.h) * back, bz = v.z + Math.cos(v.h) * back;
          const side = Math.random() < 0.5 ? -1 : 1;
          FX.smoke(bx + rx * side * 0.8, bz + rz * side * 0.8, Math.min(1.5, v.slip / 40));
        }
      }
    });
    // nitro isi ulang
    if (!racing) { if (!p.nitroOn) p.nitro = Math.min(p.stats.nitroCap, p.nitro + dt * 0.12); } else if (!p.nitroOn && Race.ev.type !== 'drag') p.nitro = Math.min(p.stats.nitroCap, p.nitro + dt * 0.03);
    FX.update(dt);
    // audio
    AudioSys.updateCar({ rpm: p.rpm, throttle: p.inp.throttle, on: true, skid: (p.slip > 12 && p.speed > 6) ? (p.slip - 12) / 40 : (p.inp.handbrake && p.speed > 5 ? 0.5 : 0), nitro: p.nitroOn, speed: p.speed });
    if (racing && Race.ai.length) {
      let near = null, nd = 1e9;
      Race.ai.forEach((a) => { const d = Math.hypot(a.v.x - p.x, a.v.z - p.z); if (d < nd) { nd = d; near = a.v; } });
      AudioSys.updateOpp(near.rpm, near.inp.throttle, nd);
    }
    // lampu pemain
    const hl = this.headLight;
    hl.position.set(p.x + Math.sin(p.h) * 1.8, 1.0, p.z + Math.cos(p.h) * 1.8);
    hl.target.position.set(p.x + Math.sin(p.h) * 20, 0, p.z + Math.cos(p.h) * 20);
    this.glowLight.position.set(p.x, 0.4, p.z);
    World.followSun(p.x, p.z);
    // suara pesawat yang lewat
    const jet = Math.pow(U.clamp(1 - Airport.nearestDist(p.x, p.z) / 650, 0, 1), 2);
    const rail = Math.pow(U.clamp(1 - Landmarks.trainDist(p.x, p.z) / 220, 0, 1), 2) * 0.8;
    AudioSys.setJet(Math.max(jet, rail));
    // penanda event
    if (this.state === 'roam') this.checkMarkers(dt);
  },

  checkMarkers(dt) {
    const p = this.player;
    this.eventCooldown = (this.eventCooldown || 0) - dt;
    this.garageCooldown = (this.garageCooldown || 0) - dt;
    let near = null;
    this.markers.forEach((m) => {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      m.obj.userData.ring.rotation.z += dt * 0.8;
      if (d < 9) near = m;
    });
    this.nearMarker = near;
    if (near) {
      const kbd = UI.isTouch ? '<kbd>E</kbd>' : '<kbd>E</kbd> / <kbd>Enter</kbd>';
      if (near.ev) {
        const ti = DATA.TYPE_INFO[near.ev.type];
        const locked = DB.data.rep < near.ev.req;
        UI.prompt(`<b style="color:${ti.color}">${ti.icon} ${near.ev.name}</b>${locked ? '<span class="lock">🔒 Butuh ' + near.ev.req + ' REP</span>' : `Tekan ${kbd} untuk lihat event`}`);
      } else {
        UI.prompt(`<b style="color:#4dd9ff">GARASI NEOPOLIS</b>Tekan ${kbd} untuk masuk (tuning, dealer, cat)`);
      }
      if (this.gps && ((near.ev && near.ev.id === this.gps) || (!near.ev && this.gps === 'garage'))) this.gps = null;
    } else UI.prompt('');
  },

  // ------------------------------------------------------------ loop
  // keluar game sepenuhnya: simpan, matikan suara & render, matikan server lokal
  async quit() {
    if (this.stopped) return;
    this.stopped = true;
    UI.show('quit');
    UI.hudMode('none');
    try { if (DB.data) { DB.save(true); if (DB.mode === 'sheets' && !DB.isGuest) await new Promise((r) => setTimeout(r, 1500)); } } catch (e) { /* */ }
    AudioSys.shutdown();
    let serverStopped = false;
    if (location.protocol.startsWith('http') && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      try { await fetch('/__shutdown', { cache: 'no-store' }); serverStopped = true; } catch (e) { serverStopped = true; }
    }
    UI.$('quit-msg').textContent = serverStopped
      ? 'Progres tersimpan, suara & server lokal sudah dimatikan. Tab ini boleh ditutup. Untuk main lagi, jalankan "jalankan-game.bat".'
      : 'Progres tersimpan dan semua suara sudah dimatikan. Tab ini boleh ditutup.';
    UI.$('quit-again').classList.toggle('hidden', serverStopped);
    try { window.close(); } catch (e) { /* browser biasanya menolak menutup tab yang tidak dibuka skrip */ }
  },

  loop(t) {
    if (this.stopped) return;
    requestAnimationFrame((tt) => this.loop(tt));
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    this._fpsAcc = (this._fpsAcc || 0) + dt; this._fpsN = (this._fpsN || 0) + 1;
    if (this._fpsAcc > 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; }
    this.time = (this.time || 0) + dt;
    Input.pollPad(this);

    if ((this.state === 'roam' || this.state === 'race') && this.player) {
      if (!this.paused) {
        this.step(dt);
        this.updateCamera(dt);
      } else {
        AudioSys.silence();
      }
      if (!this.paused) { Airport.update(dt, this.time); Landmarks.update(dt, this.time, this.player.x, this.player.z); TrafficLights.update(dt); }
      World.update(dt, this.time, this.camera);
      UI.updateHUD(dt);
      Post.render(this.scene, this.camera, dt, this.paused ? 0 : this.player.speed, this.player.nitroOn && !this.paused);
    } else {
      Showroom.active = this.state !== 'boot';
      Showroom.update(dt);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.render(Showroom.scene, Showroom.camera);
    }
  },
};

window.addEventListener('load', () => Game.init());
window.addEventListener('beforeunload', () => { if (DB.data && !DB.isGuest) DB.save(true); });
// tab ditutup → hentikan semua suara; tab disembunyikan → jeda suara & permainan
window.addEventListener('pagehide', () => AudioSys.shutdown());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    AudioSys.suspend();
    if ((Game.state === 'roam' || Game.state === 'race') && !Game.paused && !Game.stopped) UI.openPause();
  } else AudioSys.resume();
});

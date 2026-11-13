/* =========================================================================
   DATABASE PENGGUNA
   - Mode "sheets": Google Sheets lewat Google Apps Script Web App
   - Mode "local" : localStorage browser (jika SHEETS_URL kosong / pilih main offline)
   ========================================================================= */
const DB = {
  mode: 'local',
  user: null,
  token: null,
  data: null,
  saving: false,
  _saveTimer: null,
  _pending: false,

  init() {
    const url = (window.GAME_CONFIG && GAME_CONFIG.SHEETS_URL || '').trim();
    this.url = url;
    this.mode = url ? 'sheets' : 'local';
  },

  newData() {
    return {
      v: 1, money: (GAME_CONFIG.START_MONEY || 5000), rep: 0, wins: 0, races: 0,
      cars: [], current: 0, done: {}, best: {}, created: Date.now(),
    };
  },

  hashPass(user, pass) {
    return U.sha256('neonrush:' + user.toLowerCase() + ':' + pass);
  },

  validate(user, pass) {
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(user)) return 'Username 3-16 karakter (huruf, angka, _).';
    if (!pass || pass.length < 4) return 'Password minimal 4 karakter.';
    return null;
  },

  async api(action, payload) {
    const res = await fetch(this.url, {
      method: 'POST',
      // text/plain agar tidak memicu CORS preflight (Apps Script tidak mendukung OPTIONS)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action }, payload)),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    let j;
    try { j = JSON.parse(txt); } catch (e) { throw new Error('Balasan server bukan JSON. Cek pengaturan deploy (akses: Anyone).'); }
    if (!j.ok) throw new Error(j.error || 'Gagal');
    return j;
  },

  // ---------- localStorage helpers
  _localUsers() {
    try { return JSON.parse(localStorage.getItem('nr_users') || '{}'); } catch (e) { return {}; }
  },
  _localSaveUsers(u) {
    try { localStorage.setItem('nr_users', JSON.stringify(u)); } catch (e) { /* abaikan */ }
  },

  async register(user, pass) {
    const err = this.validate(user, pass);
    if (err) throw new Error(err);
    const hash = this.hashPass(user, pass);
    const data = this.newData();
    if (this.mode === 'sheets') {
      const j = await this.api('register', { username: user, passhash: hash, data: JSON.stringify(data) });
      this.token = j.token;
    } else {
      const users = this._localUsers();
      const key = user.toLowerCase();
      if (users[key]) throw new Error('Username sudah dipakai.');
      users[key] = { name: user, hash, data };
      this._localSaveUsers(users);
    }
    this.user = user;
    this.data = data;
    this._remember();
    return data;
  },

  async login(user, pass) {
    if (!user || !pass) throw new Error('Isi username dan password.');
    const hash = this.hashPass(user, pass);
    if (this.mode === 'sheets') {
      const j = await this.api('login', { username: user, passhash: hash });
      this.token = j.token;
      this.user = j.username || user;
      this.data = this._fix(j.data);
    } else {
      const users = this._localUsers();
      const u = users[user.toLowerCase()];
      if (!u || u.hash !== hash) throw new Error('Username atau password salah.');
      this.user = u.name;
      this.data = this._fix(u.data);
    }
    this._remember();
    return this.data;
  },

  guest() {
    this.user = 'Tamu';
    this.token = null;
    let d = null;
    try { d = JSON.parse(localStorage.getItem('nr_guest') || 'null'); } catch (e) { d = null; }
    this.data = this._fix(d);
    this.isGuest = true;
    return this.data;
  },

  _fix(d) {
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
    const base = this.newData();
    if (!d || typeof d !== 'object') return base;
    const out = Object.assign(base, d);
    out.cars = (out.cars || []).filter((c) => c && DATA.carById(c.model));
    out.cars.forEach((c) => {
      c.up = Object.assign({ engine: 0, turbo: 0, nitro: 0, tires: 0, suspension: 0, weight: 0, gearbox: 0 }, c.up || {});
      c.style = Object.assign(DATA.defaultStyle(), c.style || {});
      if (!c.uid) c.uid = U.uid();
    });
    if (out.current >= out.cars.length) out.current = 0;
    out.done = out.done || {};
    out.best = out.best || {};
    return out;
  },

  _remember() {
    try { localStorage.setItem('nr_lastuser', this.user); } catch (e) { /* */ }
  },

  logout() {
    this.user = null; this.token = null; this.data = null; this.isGuest = false;
  },

  // Simpan (dengan jeda agar tidak spam server)
  save(immediate) {
    if (!this.data) return;
    this.data.updated = Date.now();
    // selalu simpan cadangan lokal
    try { localStorage.setItem('nr_backup_' + (this.user || 'x').toLowerCase(), JSON.stringify(this.data)); } catch (e) { /* */ }
    if (this.isGuest) {
      try { localStorage.setItem('nr_guest', JSON.stringify(this.data)); } catch (e) { /* */ }
      return;
    }
    if (this.mode === 'local') {
      const users = this._localUsers();
      const k = this.user.toLowerCase();
      if (users[k]) { users[k].data = this.data; this._localSaveUsers(users); }
      return;
    }
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._flush(), immediate ? 10 : 1500);
  },

  async _flush() {
    if (this.saving) { this._pending = true; return; }
    this.saving = true;
    UI && UI.saveIndicator(true);
    try {
      const d = this.data;
      await this.api('save', {
        username: this.user, token: this.token, data: JSON.stringify(d),
        money: Math.round(d.money), rep: d.rep, wins: d.wins, races: d.races,
        car: d.cars[d.current] ? DATA.carById(d.cars[d.current].model).name : '',
      });
    } catch (e) {
      console.warn('Gagal simpan ke Google Sheets', e);
      UI && UI.toast('⚠ Gagal menyimpan ke server: ' + e.message, 'warn');
    }
    this.saving = false;
    UI && UI.saveIndicator(false);
    if (this._pending) { this._pending = false; this._flush(); }
  },

  async leaderboard() {
    if (this.mode === 'sheets') {
      const j = await this.api('leaderboard', {});
      return j.rows || [];
    }
    const users = this._localUsers();
    return Object.values(users).map((u) => ({
      username: u.name, rep: u.data.rep || 0, wins: u.data.wins || 0, money: u.data.money || 0,
      car: u.data.cars && u.data.cars[u.data.current] ? DATA.carById(u.data.cars[u.data.current].model).name : '-',
    })).sort((a, b) => b.rep - a.rep).slice(0, 20);
  },

  async ping() {
    if (this.mode !== 'sheets') return true;
    try { await this.api('ping', {}); return true; } catch (e) { return false; }
  },
};

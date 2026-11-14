/* =========================================================================
   STUDIO DESAIN — menggambar livery mobil sendiri di dalam game.
   Kanvas 2048x256 (rasio 8:1). Sisi KANAN kanvas = DEPAN mobil.
   Hasil ditempel di sisi kiri & kanan bodi, dipotong mengikuti siluet mobil.
   ========================================================================= */
const Designer = {
  W: 2048, H: 256,
  tool: 'brush',
  color: '#ffffff',
  size: 24,
  alpha: 1,
  fillMode: 'fill',
  font: 'Arial Black',
  sticker: 'star',
  undoStack: [],
  pendingImg: null,

  init() {
    this.art = document.getElementById('ds-art');
    this.guide = document.getElementById('ds-guide');
    this.tmp = document.getElementById('ds-tmp');
    [this.art, this.guide, this.tmp].forEach((c) => { c.width = this.W; c.height = this.H; });
    this.ga = this.art.getContext('2d');
    this.gt = this.tmp.getContext('2d');
    const $ = (id) => document.getElementById(id);
    // alat
    $('ds-tools').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tool]'); if (!b) return;
      this.setTool(b.dataset.tool);
    });
    $('ds-color').oninput = (e) => { this.color = e.target.value; this._swSel(); };
    $('ds-size').oninput = (e) => { this.size = +e.target.value; $('ds-size-v').textContent = this.size; };
    $('ds-alpha').oninput = (e) => { this.alpha = +e.target.value; };
    $('ds-fill').onchange = (e) => { this.fillMode = e.target.value; };
    $('ds-font').onchange = (e) => { this.font = e.target.value; };
    $('ds-sticker').onchange = (e) => { this.sticker = e.target.value; this.setTool('sticker'); };
    const pal = ['#ffffff', '#111111', '#e8173c', '#ff6a00', '#ffd400', '#7cff00', '#00e5a0', '#00c8ff', '#2a5bff', '#7a2cff', '#ff2bd6', '#9aa3ad', '#6b3a1e', '#c0a060'];
    $('ds-pal').innerHTML = pal.map((c) => `<div class="sw" data-c="${c}" style="background:${c}"></div>`).join('');
    $('ds-pal').addEventListener('click', (e) => {
      const s = e.target.closest('.sw'); if (!s) return;
      this.color = s.dataset.c; $('ds-color').value = this.color; this._swSel();
    });
    // aksi
    $('ds-undo').onclick = () => this.undo();
    $('ds-clear').onclick = () => { if (confirm('Hapus semua gambar di kanvas?')) { this.push(); this.ga.clearRect(0, 0, this.W, this.H); this.refresh(); } };
    $('ds-import').onclick = () => $('ds-file').click();
    $('ds-file').onchange = (e) => this.importFile(e.target.files[0]);
    $('ds-cover').onclick = () => this.coverImage();
    $('ds-template').onclick = () => this.downloadTemplate();
    $('ds-export').onclick = () => this.download(this.art, 'livery-' + this.entry.model + '.png');
    $('ds-remove').onclick = () => this.removeDesign();
    $('ds-save').onclick = () => this.save();
    $('ds-close').onclick = () => this.close();
    $('ds-mirror').onchange = (e) => { this.mirror = e.target.checked; this.rebuildPreview(); };
    // gambar di kanvas
    const t = this.tmp;
    t.addEventListener('pointerdown', (e) => this.down(e));
    t.addEventListener('pointermove', (e) => this.move(e));
    addEventListener('pointerup', (e) => this.up(e));
    addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); this.undo(); }
    });
  },
  isOpen() { return document.getElementById('designer').classList.contains('show'); },

  open(entry) {
    if (!this.art) this.init();
    this.entry = entry;
    this.mirror = entry.style.customMirror !== false;
    document.getElementById('ds-mirror').checked = this.mirror;
    document.getElementById('ds-car').textContent = DATA.carById(entry.model).name;
    document.getElementById('ds-wrap').style.background = entry.style.paint;
    // garis panduan siluet mobil ini
    const gg = this.guide.getContext('2d');
    gg.clearRect(0, 0, this.W, this.H);
    gg.drawImage(CarFactory.liveryGuideCanvas(entry.model, false), 0, 0);
    this.ga.clearRect(0, 0, this.W, this.H);
    this.undoStack = [];
    this.dirty = false;
    this.pendingImg = null;
    if (entry.style.custom) {
      const img = new Image();
      img.onload = () => { this.ga.drawImage(img, 0, 0, this.W, this.H); this.refresh(); };
      img.src = entry.style.custom;
    }
    this.liveTex = new THREE.CanvasTexture(this.art);
    this.liveTex.encoding = THREE.sRGBEncoding;
    this.liveTex._shared = true;
    this.setTool(this.tool);
    document.getElementById('garage').classList.remove('show');
    document.getElementById('designer').classList.add('show');
    Showroom.setDesignView(true);
    this.rebuildPreview();
    this.msg('Gambar di kanvas — sisi KANAN = depan mobil. Area gelap di luar garis tidak tampil di bodi.');
  },
  close(force) {
    if (!force && this.dirty && !confirm('Tutup Studio Desain? Perubahan yang belum disimpan akan hilang.')) return;
    document.getElementById('designer').classList.remove('show');
    document.getElementById('garage').classList.add('show');
    Showroom.setDesignView(false);
    UI.styleDraft = null;
    UI._prevKey = null;
    UI.renderGarage();
  },
  msg(t) { document.getElementById('ds-msg').textContent = t; },

  setTool(t) {
    this.tool = t;
    document.querySelectorAll('#ds-tools button[data-tool]').forEach((b) => b.classList.toggle('sel', b.dataset.tool === t));
    const hints = {
      brush: 'Kuas: seret untuk menggambar bebas.', eraser: 'Penghapus: seret untuk menghapus.',
      line: 'Garis: seret dari titik awal ke titik akhir (cocok untuk garis balap).', rect: 'Kotak: seret untuk membuat kotak.',
      ellipse: 'Lingkaran/elips: seret untuk membuat bentuk.', text: 'Teks: ketik tulisan di kolom "Teks", lalu klik di kanvas.',
      sticker: 'Stiker: pilih jenis stiker, lalu klik di kanvas. Ukuran mengikuti slider.', fill: 'Isi: klik kanvas untuk mewarnai seluruh bodi.',
      image: 'Gambar: seret kotak di kanvas untuk menempatkan gambar yang diimpor.',
    };
    this.msg(hints[t] || '');
  },
  _swSel() { document.querySelectorAll('#ds-pal .sw').forEach((s) => s.classList.toggle('sel', s.dataset.c === this.color)); },

  pt(e) {
    const r = this.tmp.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * this.W, y: ((e.clientY - r.top) / r.height) * this.H };
  },
  push() {
    this.undoStack.push(this.ga.getImageData(0, 0, this.W, this.H));
    if (this.undoStack.length > 15) this.undoStack.shift();
    this.dirty = true;
  },
  undo() {
    const d = this.undoStack.pop();
    if (!d) return;
    this.ga.putImageData(d, 0, 0);
    this.refresh();
  },
  style(g) {
    g.globalAlpha = this.alpha;
    g.fillStyle = this.color; g.strokeStyle = this.color;
    g.lineWidth = this.size; g.lineCap = 'round'; g.lineJoin = 'round';
  },

  down(e) {
    e.preventDefault();
    this.tmp.setPointerCapture && this.tmp.setPointerCapture(e.pointerId);
    const p = this.pt(e);
    this.start = p; this.last = p; this.drawing = true;
    const g = this.ga;
    if (this.tool === 'brush' || this.tool === 'eraser') {
      this.push();
      g.save(); this.style(g);
      if (this.tool === 'eraser') { g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1; }
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x + 0.1, p.y); g.stroke();
      g.restore();
      this.refresh();
    } else if (this.tool === 'text') {
      this.drawing = false;
      const txt = document.getElementById('ds-text').value.trim();
      if (!txt) { this.msg('Ketik dulu tulisannya di kolom "Teks".'); return; }
      this.push();
      g.save(); this.style(g);
      g.font = `bold ${Math.max(10, this.size * 2)}px "${this.font}", Arial`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (this.fillMode === 'stroke') { g.lineWidth = Math.max(2, this.size / 8); g.strokeText(txt, p.x, p.y); } else g.fillText(txt, p.x, p.y);
      g.restore();
      this.refresh();
    } else if (this.tool === 'sticker') {
      this.drawing = false;
      this.push();
      this.drawSticker(g, this.sticker, p.x, p.y, this.size * 2.4);
      this.refresh();
    } else if (this.tool === 'fill') {
      this.drawing = false;
      this.push();
      g.save(); g.globalAlpha = this.alpha; g.fillStyle = this.color; g.fillRect(0, 0, this.W, this.H); g.restore();
      this.refresh();
    } else if (this.tool === 'image' && !this.pendingImg) {
      this.drawing = false;
      this.msg('Impor gambar dulu (tombol "Impor Gambar").');
    }
  },
  move(e) {
    if (!this.drawing) return;
    const p = this.pt(e);
    const g = this.ga, t = this.gt;
    if (this.tool === 'brush' || this.tool === 'eraser') {
      g.save(); this.style(g);
      if (this.tool === 'eraser') { g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1; }
      g.beginPath(); g.moveTo(this.last.x, this.last.y); g.lineTo(p.x, p.y); g.stroke();
      g.restore();
      this.last = p;
      this._lazyRefresh();
    } else {
      t.clearRect(0, 0, this.W, this.H);
      this.shape(t, this.start, p, true);
    }
  },
  up(e) {
    if (!this.drawing) return;
    this.drawing = false;
    const p = this.pt(e);
    this.gt.clearRect(0, 0, this.W, this.H);
    if (['line', 'rect', 'ellipse', 'image'].includes(this.tool)) {
      if (Math.hypot(p.x - this.start.x, p.y - this.start.y) < 3) return;
      this.push();
      this.shape(this.ga, this.start, p, false);
    }
    this.refresh();
  },
  shape(g, a, b, preview) {
    g.save(); this.style(g);
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (this.tool === 'line') { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    else if (this.tool === 'rect') { if (this.fillMode === 'stroke') g.strokeRect(x, y, w, h); else g.fillRect(x, y, w, h); }
    else if (this.tool === 'ellipse') {
      g.beginPath(); g.ellipse(x + w / 2, y + h / 2, w / 2 || 1, h / 2 || 1, 0, 0, Math.PI * 2);
      if (this.fillMode === 'stroke') g.stroke(); else g.fill();
    } else if (this.tool === 'image' && this.pendingImg) {
      g.drawImage(this.pendingImg, x, y, w, h);
      if (preview) { g.globalAlpha = 1; g.strokeStyle = '#00e5ff'; g.lineWidth = 3; g.setLineDash([10, 6]); g.strokeRect(x, y, w, h); }
    }
    g.restore();
  },
  drawSticker(g, kind, x, y, s) {
    g.save(); this.style(g);
    g.translate(x, y);
    const star = (r1, r2, n) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); };
    if (kind === 'star') star(s / 2, s / 4.5, 5);
    else if (kind === 'bolt') { g.beginPath(); g.moveTo(s * 0.1, -s / 2); g.lineTo(-s * 0.3, s * 0.05); g.lineTo(0, s * 0.05); g.lineTo(-s * 0.15, s / 2); g.lineTo(s * 0.3, -s * 0.08); g.lineTo(0, -s * 0.08); g.closePath(); g.fill(); }
    else if (kind === 'flame') {
      for (let k = 0; k < 5; k++) {
        const yy = (k - 2) * s * 0.13, len = s * (1.2 + Math.sin(k * 1.9) * 0.4);
        g.beginPath(); g.moveTo(s * 0.4, yy - s * 0.05);
        g.bezierCurveTo(s * 0.4 - len * 0.5, yy - s * 0.18, s * 0.4 - len * 0.7, yy + s * 0.06, s * 0.4 - len, yy);
        g.bezierCurveTo(s * 0.4 - len * 0.6, yy + s * 0.14, s * 0.4 - len * 0.3, yy + s * 0.03, s * 0.4, yy + s * 0.08);
        g.closePath(); g.fill();
      }
    } else if (kind === 'number') {
      g.beginPath(); g.arc(0, 0, s / 2, 0, Math.PI * 2); g.fill();
      const txt = document.getElementById('ds-text').value.trim().slice(0, 3) || '27';
      g.globalAlpha = 1; g.fillStyle = this.color === '#111111' ? '#ffffff' : '#111111';
      g.font = `bold ${s * 0.55}px "Arial Black", Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, s * 0.03);
    } else if (kind === 'stripes') {
      g.translate(-x, -y);
      g.fillRect(0, y - s * 0.22, this.W, s * 0.14); g.fillRect(0, y + s * 0.08, this.W, s * 0.14);
    } else if (kind === 'checker') {
      const c = s / 6;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) g.fillRect(-s / 2 + i * c, -c * 2 + j * c, c, c);
    } else if (kind === 'wing') {
      for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(-k * s * 0.12, -k * s * 0.05, s * (0.55 - k * 0.08), s * 0.09, -0.25, 0, Math.PI * 2); g.fill(); }
    } else if (kind === 'heart') {
      g.beginPath(); g.moveTo(0, s * 0.35);
      g.bezierCurveTo(-s * 0.6, -s * 0.05, -s * 0.25, -s * 0.5, 0, -s * 0.18);
      g.bezierCurveTo(s * 0.25, -s * 0.5, s * 0.6, -s * 0.05, 0, s * 0.35); g.fill();
    }
    g.restore();
  },

  importFile(f) {
    document.getElementById('ds-file').value = '';
    if (!f) return;
    if (!/image\/(png|jpeg|webp)/.test(f.type)) { this.msg('Format tidak didukung. Pakai PNG, JPG/JPEG, atau WEBP.'); return; }
    if (f.size > 8 * 1024 * 1024) { this.msg('File terlalu besar (maks 8 MB). Perkecil gambarnya dulu.'); return; }
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        this.pendingImg = img;
        this.setTool('image');
        const ratio = img.width / img.height;
        this.msg(`Gambar ${img.width}×${img.height}px dimuat${Math.abs(ratio - 8) > 1 ? ' (rasio ideal 8:1, mis. 2048×256)' : ''}. Seret kotak di kanvas untuk menempatkan, atau klik "Penuhi Kanvas".`);
      };
      img.onerror = () => this.msg('Gambar gagal dibaca.');
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  },
  coverImage() {
    if (!this.pendingImg) { this.msg('Impor gambar dulu.'); return; }
    this.push();
    this.ga.drawImage(this.pendingImg, 0, 0, this.W, this.H);
    this.refresh();
  },

  _lazyRefresh() {
    if (this._rq) return;
    this._rq = requestAnimationFrame(() => { this._rq = null; this.refresh(); });
  },
  // perbarui pratinjau 3D di showroom
  refresh() {
    const c = Showroom.car;
    if (c && c.userData.liveryTexs) c.userData.liveryTexs.forEach((t) => { t.needsUpdate = true; });
  },
  rebuildPreview() {
    const e = this.entry;
    const prev = { uid: e.uid, model: e.model, up: e.up, style: Object.assign({}, e.style, { customMirror: this.mirror, custom: null }) };
    Showroom.setCar(prev, { liveTex: this.liveTex });
    UI._prevKey = null;
    this.refresh();
  },

  // simpan sebagai data kecil (WEBP/PNG) agar muat di penyimpanan & Google Sheets
  encode() {
    const sizes = [[1024, 128, 0.9], [1024, 128, 0.75], [768, 96, 0.7], [512, 64, 0.7]];
    for (const [w, h, q] of sizes) {
      const c = Tex.canvas(w, h);
      c.getContext('2d').drawImage(this.art, 0, 0, w, h);
      let url = c.toDataURL('image/webp', q);
      if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
      if (url.length <= 60000) return url;
    }
    return null;
  },
  isEmpty() {
    const d = this.ga.getImageData(0, 0, this.W, this.H).data;
    for (let i = 3; i < d.length; i += 64) if (d[i] > 0) return false;
    return true;
  },
  save() {
    const e = this.entry, price = DATA.STYLE.prices.livery;
    if (this.isEmpty()) { this.msg('Kanvas masih kosong.'); return; }
    if (DB.data.money < price) { this.msg('Uang tidak cukup (' + U.fmtMoney(price) + ').'); return; }
    const url = this.encode();
    if (!url) { this.msg('Desain terlalu rumit untuk disimpan. Kurangi detail/gradasi.'); return; }
    if (!confirm(`Pasang desain ini seharga ${U.fmtMoney(price)}?`)) return;
    DB.data.money -= price;
    e.style.custom = url;
    e.style.customMirror = this.mirror;
    DB.save();
    AudioSys.cash();
    UI.toast('Desain livery terpasang!', 'good');
    this.dirty = false;
    this.close(true);
  },
  removeDesign() {
    const e = this.entry;
    if (!e.style.custom) { this.msg('Mobil ini belum memakai desain sendiri.'); return; }
    if (!confirm('Lepas desain sendiri dari mobil ini?')) return;
    e.style.custom = null;
    DB.save();
    this.dirty = false;
    this.close(true);
  },

  downloadTemplate() {
    const c = Tex.canvas(this.W, this.H);
    const g = c.getContext('2d');
    g.drawImage(CarFactory.liveryGuideCanvas(this.entry.model, false), 0, 0);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = 'bold 22px Arial'; g.textAlign = 'center';
    g.fillText('TEMPLATE ' + DATA.carById(this.entry.model).name.toUpperCase() + ' — 2048x256 px — gambar di dalam garis putus-putus, hapus template ini sebelum impor', this.W / 2, this.H - 14);
    this.download(c, 'template-livery-' + this.entry.model + '.png');
  },
  download(canvas, name) {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  },
};

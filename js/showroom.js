/* =========================================================================
   SHOWROOM / GARASI 3D — panggung putar dengan lampu neon
   ========================================================================= */
const Showroom = {
  init(renderer) {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x07050f);
    s.fog = new THREE.Fog(0x07050f, 18, 45);
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 200);
    this.angle = 0.8; this.autoSpin = true; this.dist = 8.2; this.height = 2.1;
    this.offsetX = 0;

    s.add(new THREE.HemisphereLight(0x8877ff, 0x110818, 0.6));
    const key = new THREE.SpotLight(0xffffff, 1.6, 30, 0.6, 0.5);
    key.position.set(0, 12, 2);
    s.add(key); s.add(key.target);
    const pink = new THREE.PointLight(0xff2bd6, 2.2, 16); pink.position.set(-5, 2.5, -3); s.add(pink);
    const cyan = new THREE.PointLight(0x00e5ff, 2.2, 16); cyan.position.set(5, 2.5, 3); s.add(cyan);
    const back = new THREE.PointLight(0x7a2cff, 1.5, 20); back.position.set(0, 4, -8); s.add(back);

    // lantai mengkilap dengan grid neon
    const c = Tex.canvas(512, 512);
    const g = c.getContext('2d');
    g.fillStyle = '#0b0914'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(122,44,255,0.55)'; g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    const ft = Tex.make(c, true); ft.repeat.set(6, 6);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.25, metalness: 0.6, envMap: World.envMap, envMapIntensity: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    // meja putar
    this.turn = new THREE.Group();
    s.add(this.turn);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x15121f, roughness: 0.3, metalness: 0.8, envMap: World.envMap }));
    disc.position.y = 0.06;
    s.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.35, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: 0xff2bd6 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.12;
    s.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.04, 8, 96), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
    ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.02;
    s.add(ring2);
    // dinding dengan garis neon vertikal
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const col = [0xff2bd6, 0x00e5ff, 0x7a2cff][k % 3];
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.15, 7, 0.15), new THREE.MeshBasicMaterial({ color: col }));
      bar.position.set(Math.cos(a) * 16, 3.5, Math.sin(a) * 16);
      s.add(bar);
    }
    const ceil = new THREE.Mesh(new THREE.TorusGeometry(5, 0.08, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 7;
    s.add(ceil);

    // seret untuk memutar
    let drag = false, lx = 0;
    const cv = renderer.domElement;
    const down = (x) => { drag = true; lx = x; this.autoSpin = false; };
    const move = (x) => { if (!drag) return; this.angle -= (x - lx) * 0.008; lx = x; };
    const up = () => { drag = false; clearTimeout(this._spinT); this._spinT = setTimeout(() => { this.autoSpin = true; }, 3000); };
    cv.addEventListener('mousedown', (e) => this.active && down(e.clientX));
    addEventListener('mousemove', (e) => this.active && move(e.clientX));
    addEventListener('mouseup', up);
    cv.addEventListener('touchstart', (e) => this.active && down(e.touches[0].clientX), { passive: true });
    cv.addEventListener('touchmove', (e) => this.active && move(e.touches[0].clientX), { passive: true });
    cv.addEventListener('touchend', up);
    cv.addEventListener('wheel', (e) => { if (this.active) this.dist = U.clamp(this.dist + e.deltaY * 0.005, 5.5, 13); }, { passive: true });
  },
  setCar(entry) {
    if (this.car) { this.turn.remove(this.car); CarFactory.dispose(this.car); }
    this.car = CarFactory.build(entry, { noBeam: true });
    this.car.position.y = 0.12;
    this.turn.add(this.car);
  },
  update(dt) {
    if (this.autoSpin) this.angle += dt * 0.25;
    const cam = this.camera;
    const d = this.dist * Math.max(1, 1.25 / cam.aspect);
    cam.position.set(Math.sin(this.angle) * d + this.offsetX, this.height, Math.cos(this.angle) * d);
    cam.lookAt(this.offsetX, 0.7, 0);
  },
  resize(w, h) {
    this.w = w; this.h = h;
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.setShift(this.shift || 0);
  },
  // geser tampilan agar mobil tidak tertutup panel (frac = bagian lebar layar)
  setShift(frac) {
    this.shift = frac;
    const w = this.w || innerWidth, h = this.h || innerHeight;
    if (w <= 820) this.camera.setViewOffset(w, h, 0, frac ? -h * 0.2 : 0, w, h); // layar sempit: mobil di bawah panel
    else if (frac) this.camera.setViewOffset(w, h, -w * frac, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  },
};

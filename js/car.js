/* =========================================================================
   MOBIL — model 3D prosedural (low-poly orisinal) + fisika arcade
   ========================================================================= */
const CarFactory = {
  _shared: null,
  shared() {
    if (this._shared) return this._shared;
    const s = {};
    s.tire = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.9 });
    s.dark = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.6, metalness: 0.3 });
    s.chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1 });
    s.head = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.5, 2.7) });
    s.arch = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    s.disc = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 0.8 });
    s.caliper = new THREE.MeshStandardMaterial({ color: 0xc8161e, roughness: 0.4, metalness: 0.3 });
    s.glowTex = Tex.radial('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 128);
    s.shadowTex = Tex.radial('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)', 64);
    s.shadowMat = new THREE.MeshBasicMaterial({ map: s.shadowTex, transparent: true, depthWrite: false });
    s.beamTex = (() => {
      const c = Tex.canvas(64, 128);
      const g = c.getContext('2d');
      // atas kanvas = dekat mobil (sempit & terang), bawah = jauh (lebar & pudar)
      const gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, 'rgba(255,250,230,0.5)');
      gr.addColorStop(0.5, 'rgba(255,250,230,0.25)');
      gr.addColorStop(1, 'rgba(255,250,230,0)');
      g.fillStyle = gr;
      if ('filter' in g) g.filter = 'blur(5px)';
      g.beginPath(); g.moveTo(26, 4); g.lineTo(38, 4); g.lineTo(54, 124); g.lineTo(10, 124); g.closePath(); g.fill();
      return Tex.make(c);
    })();
    const bk = World.T ? (World.timeKey === 'night' ? 1 : 0.35) : 1;
    s.beamMat = new THREE.MeshBasicMaterial({ map: s.beamTex, color: new THREE.Color(bk, bk, bk), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    s.flameMat = new THREE.MeshBasicMaterial({ color: 0x55aaff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    s.wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 18).rotateZ(Math.PI / 2);
    s.rimGeo = new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2);
    this._shared = s;
    return s;
  },

  /* ---------------- MODEL 3D BUATAN SENDIRI (.glb) ---------------- */
  customModels: {},
  loadCustomModels() {
    const list = (window.GAME_CONFIG && GAME_CONFIG.CUSTOM_MODELS) || {};
    const ids = Object.keys(list).filter((id) => DATA.carById(id) && list[id] && list[id].url);
    if (!ids.length) return Promise.resolve();
    if (!THREE.GLTFLoader) { console.warn('GLTFLoader tidak termuat'); return Promise.resolve(); }
    if (location.protocol === 'file:') {
      setTimeout(() => UI.toast('Model 3D sendiri hanya bisa dimuat lewat jalankan-game.bat (bukan buka file langsung).', 'warn'), 3000);
      return Promise.resolve();
    }
    const loader = new THREE.GLTFLoader();
    return Promise.all(ids.map((id) => new Promise((res) => {
      loader.load(list[id].url, (gltf) => {
        this.customModels[id] = { scene: gltf.scene, cfg: list[id] };
        res();
      }, undefined, (err) => {
        console.warn('Gagal memuat model', list[id].url, err);
        setTimeout(() => UI.toast('Gagal memuat model 3D: ' + list[id].url, 'warn'), 3000);
        res();
      });
    })));
  },
  buildCustom(entry, cm, opts) {
    const S = this.shared();
    const sh = DATA.carById(entry.model).shape;
    const st = entry.style || DATA.defaultStyle();
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const model = cm.scene.clone(true);
    const paintCol = new THREE.Color(st.paint);
    const wheels = [];
    model.traverse((o) => {
      if (o.isMesh) {
        o.userData.noDispose = true;
        o.castShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const nm = mats.map((m) => (m && m.name) || '').join(' ') + ' ' + o.name;
        // material bernama "paint"/"body"/"cat" ikut warna cat yang dipilih pemain
        if (/paint|body|cat/i.test(nm)) {
          o.material = mats.map((m) => { const c = m.clone(); c.color = paintCol.clone(); if (World.envMap) { c.envMap = World.envMap; c.envMapIntensity = 1; } return c; });
          if (o.material.length === 1) o.material = o.material[0];
        }
      }
      if (/^(wheel|roda)/i.test(o.name) && !wheels.some((w) => w.obj === o)) wheels.push({ obj: o });
    });
    model.rotation.y = ((cm.cfg.rotateY || 0) * Math.PI) / 180;
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = (sh.len * (cm.cfg.scale || 1)) / Math.max(0.01, size.z);
    model.scale.multiplyScalar(s);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    const ctr = box.getCenter(new THREE.Vector3());
    model.position.x -= ctr.x; model.position.z -= ctr.z; model.position.y -= box.min.y;
    body.add(model);
    root.updateMatrixWorld(true);
    // roda dari model (objek bernama wheel_FL, wheel_FR, wheel_RL, wheel_RR)
    const wl = wheels.map((w) => {
      const p = new THREE.Vector3(); w.obj.getWorldPosition(p);
      return { pivot: w.obj, spin: w.obj, front: p.z > 0, baseRot: w.obj.rotation.clone() };
    });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0x8a0010 });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(sh.wid * 1.5, sh.len * 1.25), S.shadowMat);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.04;
    root.add(shadow);
    let beam = null;
    if (!opts.noBeam && (!World.T || World.T.beams)) {
      beam = new THREE.Mesh(new THREE.PlaneGeometry(9, 22), S.beamMat);
      beam.rotation.x = -Math.PI / 2; beam.position.set(0, 0.045, sh.len / 2 + 11);
      root.add(beam);
    }
    root.userData = { body, wheels: wl, tailMat, flames: [], glow: null, beam, len: sh.len, wid: sh.wid, wr: sh.wr, custom3d: true };
    return root;
  },

  // profil samping bodi (dipakai untuk bodi 3D & masker livery)
  bodyProfile(sh) {
    const L = sh.len, Hb = sh.hgt, c = sh.clear, top = c + Hb, nz = L / 2, tz = -L / 2;
    const prof = new THREE.Shape();
    prof.moveTo(tz + 0.3, c + 0.03);
    prof.lineTo(nz - 0.45, c + 0.03);
    prof.bezierCurveTo(nz - 0.05, c + 0.03, nz + 0.03, c + Hb * 0.22, nz, c + Hb * 0.42);
    prof.bezierCurveTo(nz - 0.03, c + Hb * 0.74, nz - sh.nose * 0.32, top - 0.02, nz - sh.nose, top);
    prof.lineTo(tz + sh.tail, top);
    prof.bezierCurveTo(tz + sh.tail * 0.3, top + 0.03, tz - 0.02, top - Hb * 0.1, tz, c + Hb * 0.62);
    prof.bezierCurveTo(tz + 0.02, c + Hb * 0.2, tz + 0.08, c + 0.03, tz + 0.3, c + 0.03);
    return prof;
  },

  /* ---------------- LIVERY / DESAIN SENDIRI ----------------
     Gambar livery (rasio 8:1, mis. 2048x256) ditempel di sisi kiri & kanan bodi.
     Bagian kanan gambar = DEPAN mobil. Area di luar siluet bodi otomatis terpotong. */
  LIVERY_W: 2048, LIVERY_H: 256,
  liveryArea(sh) { return { y0: sh.clear + 0.05, y1: sh.clear + sh.hgt - 0.05 }; },
  // masker siluet bodi (putih = boleh dicat), dipotong lengkung roda
  liveryMask(modelId) {
    const S = this.shared();
    S.masks = S.masks || {};
    if (S.masks[modelId]) return S.masks[modelId];
    const c = this.liveryGuideCanvas(modelId, true);
    const t = new THREE.CanvasTexture(c);
    S.masks[modelId] = t;
    return t;
  },
  // kanvas siluet (mask=true → putih/hitam; mask=false → garis panduan untuk desainer)
  liveryGuideCanvas(modelId, mask) {
    const sh = DATA.carById(modelId).shape;
    const W = this.LIVERY_W, H = this.LIVERY_H, L = sh.len;
    const { y0, y1 } = this.liveryArea(sh);
    const c = Tex.canvas(W, H);
    const g = c.getContext('2d');
    const X = (z) => ((z + L / 2) / L) * W, Y = (y) => H - ((y - y0) / (y1 - y0)) * H;
    const pts = this.bodyProfile(sh).getPoints(24);
    const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.closePath(); };
    const arches = () => [-1, 1].forEach((fz) => { g.beginPath(); g.ellipse(X(fz * L * 0.31), Y(sh.wr), (sh.wr * 1.24 / L) * W, (sh.wr * 1.24 / (y1 - y0)) * H, 0, 0, Math.PI * 2); g.fill(); });
    if (mask) {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#fff'; path(); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 46; path(); g.stroke(); // jauhi tepi melengkung
      g.fillStyle = '#000'; arches();
    } else {
      g.fillStyle = 'rgba(10,8,20,0.85)'; g.fillRect(0, 0, W, H);
      g.save(); path(); g.clip(); g.clearRect(0, 0, W, H); g.restore();
      g.fillStyle = 'rgba(10,8,20,0.85)'; arches();
      g.strokeStyle = '#00e5ff'; g.lineWidth = 4; g.setLineDash([16, 10]); path(); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(0,229,255,0.9)'; g.font = 'bold 30px Arial'; g.textAlign = 'right'; g.fillText('DEPAN ▶', W - 16, 34);
      g.textAlign = 'left'; g.fillText('◀ BELAKANG', 16, 34);
    }
    return c;
  },
  // geometri tempel yang mengikuti lengkung sisi bodi
  liveryGeo(sh, Wd, sd) {
    const L = sh.len, Hb = sh.hgt, c = sh.clear;
    const { y0, y1 } = this.liveryArea(sh);
    const nx = 48, ny = 6, pos = [], uv = [], idx = [];
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const u = i / nx, v = j / ny;
        const z = -L / 2 + u * L, y = y0 + v * (y1 - y0);
        const t = Math.min(1, Math.abs(z) / (L / 2));
        const k = U.clamp((y - c) / Hb, 0, 1);
        const x = sd * ((Wd / 2) * (1 - 0.15 * Math.pow(t, 2.4)) * (1 - 0.08 * k * k) + 0.012);
        pos.push(x, y, z);
        uv.push(u, v);
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
        if (sd > 0) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  },
  // tekstur dari data URL (hasil simpan desainer / gambar impor), di-cache
  liveryTex(url) {
    const S = this.shared();
    S.liv = S.liv || {};
    const key = url.length + ':' + url.slice(-64);
    if (S.liv[key]) return S.liv[key];
    const img = new Image();
    const t = new THREE.Texture(img);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    t._shared = true;
    img.onload = () => { t.needsUpdate = true; };
    img.src = url;
    S.liv[key] = t;
    return t;
  },

  // velg 10 palang + bibir velg + tutup tengah, digabung jadi satu geometri (hemat draw call)
  spokeGeo(wr) {
    const S = this.shared();
    S.spokes = S.spokes || {};
    const key = wr.toFixed(3);
    if (S.spokes[key]) return S.spokes[key];
    const parts = [];
    const m = new THREE.Matrix4();
    for (let k = 0; k < 10; k++) {
      const b = new THREE.BoxGeometry(0.04, wr * 0.74, k % 2 ? 0.045 : 0.07);
      b.translate(0, wr * 0.37, 0);
      b.applyMatrix4(m.makeRotationX((k / 10) * Math.PI * 2));
      parts.push(b);
    }
    const lip = new THREE.TorusGeometry(wr * 0.76, 0.028, 6, 28); lip.rotateY(Math.PI / 2); lip.translate(-0.01, 0, 0);
    parts.push(lip);
    const cap = new THREE.CylinderGeometry(wr * 0.14, wr * 0.14, 0.06, 12); cap.rotateZ(Math.PI / 2); cap.translate(0.02, 0, 0);
    parts.push(cap);
    const pos = [], nor = [];
    parts.forEach((g) => {
      const ng = g.index ? g.toNonIndexed() : g;
      pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.userData.shared = true;
    S.spokes[key] = geo;
    return geo;
  },

  build(entry, opts = {}) {
    const cm = this.customModels[entry.model];
    if (cm) return this.buildCustom(entry, cm, opts);
    const S = this.shared();
    const car = DATA.carById(entry.model);
    const sh = car.shape;
    const st = entry.style || DATA.defaultStyle();
    const fin = DATA.STYLE.finishes.find((f) => f.id === st.finish) || DATA.STYLE.finishes[0];
    const L = sh.len, Wd = sh.wid * (st.kit === 2 ? 1.04 : 1), Hb = sh.hgt, c = sh.clear;
    const root = new THREE.Group();
    const body = new THREE.Group(); // ikut miring (roll/pitch)
    root.add(body);

    const envM = opts.env || World.envMap;
    const paintOpts = {
      color: new THREE.Color(st.paint), roughness: fin.rough, metalness: fin.metal,
      envMap: envM, envMapIntensity: fin.id === 'matte' ? 0.3 : 1.15,
    };
    // cat mengkilap memakai lapisan clearcoat (seperti cat mobil asli)
    const paint = fin.id === 'matte' ? new THREE.MeshStandardMaterial(paintOpts)
      : new THREE.MeshPhysicalMaterial(Object.assign(paintOpts, { clearcoat: 1, clearcoatRoughness: fin.id === 'chrome' ? 0.02 : 0.06 }));
    if (fin.id === 'pearl') paint.emissive = new THREE.Color(st.paint).multiplyScalar(0.06);

    // --- bodi (desain modern: kap & bumper membulat halus, buritan ducktail)
    const top = c + Hb;
    const nz = L / 2, tz = -L / 2;
    const prof = this.bodyProfile(sh);
    const bev = 0.12;
    const bodyGeo = new THREE.ExtrudeGeometry(prof, { depth: Wd - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: opts.lite ? 2 : 4, steps: 1, curveSegments: opts.lite ? 8 : 14 });
    bodyGeo.translate(0, 0, -(Wd - bev * 2) / 2);
    bodyGeo.rotateY(-Math.PI / 2);
    // denah membulat di ujung & sisi sedikit miring ke atas (tumblehome)
    const bp = bodyGeo.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const z = bp.getZ(i), y = bp.getY(i);
      const t = Math.min(1, Math.abs(z) / (L / 2));
      const k = U.clamp((y - c) / Hb, 0, 1);
      bp.setX(i, bp.getX(i) * (1 - 0.15 * Math.pow(t, 2.4)) * (1 - 0.08 * k * k));
    }
    bodyGeo.computeVertexNormals();
    const bodyMesh = new THREE.Mesh(bodyGeo, paint);
    bodyMesh.castShadow = true;
    body.add(bodyMesh);

    // --- kabin kaca hitam menyatu (gaya floating-roof / panoramic)
    const tintCol = [0x1e2833, 0x141a22, 0x0a0d12, 0x030304][st.tint == null ? 1 : st.tint];
    const glass = new THREE.MeshStandardMaterial({ color: tintCol, roughness: 0.05, metalness: 0.9, envMap: envM, envMapIntensity: 1.5 });
    const zr = sh.cabOff - sh.cabLen / 2, zf = sh.cabOff + sh.cabLen / 2;
    const rl = Math.max(0.3, sh.cabLen - sh.ws - sh.rs);
    const cab = new THREE.Shape();
    cab.moveTo(zr, top - 0.03);
    cab.lineTo(zf, top - 0.03);
    cab.bezierCurveTo(zf - sh.ws * 0.35, top + sh.cabH * 0.5, zf - sh.ws * 0.75, top + sh.cabH * 0.97, zf - sh.ws, top + sh.cabH);
    cab.bezierCurveTo(zf - sh.ws - rl * 0.35, top + sh.cabH * 1.05, zr + sh.rs + rl * 0.35, top + sh.cabH * 1.05, zr + sh.rs, top + sh.cabH);
    cab.bezierCurveTo(zr + sh.rs * 0.55, top + sh.cabH * 0.92, zr + sh.rs * 0.15, top + sh.cabH * 0.35, zr, top - 0.03);
    const cw = Wd * 0.86;
    const cabGeo = new THREE.ExtrudeGeometry(cab, { depth: cw - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: opts.lite ? 1 : 3, curveSegments: opts.lite ? 6 : 12 });
    cabGeo.translate(0, 0, -(cw - 0.16) / 2);
    cabGeo.rotateY(-Math.PI / 2);
    const cp = cabGeo.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const k = U.clamp((cp.getY(i) - top) / sh.cabH, 0, 1.1);
      cp.setX(i, cp.getX(i) * (1 - 0.24 * k));
    }
    cabGeo.computeVertexNormals();
    body.add(new THREE.Mesh(cabGeo, glass));
    // list krom di bawah kaca samping
    if (!opts.lite) {
      [-1, 1].forEach((sd) => {
        const tr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, sh.cabLen * 0.86), S.chrome);
        tr.position.set(sd * (cw / 2 - 0.01), top + 0.03, sh.cabOff);
        body.add(tr);
        // spion
        const mr = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.11, 0.24), paint);
        mr.position.set(sd * (cw / 2 + 0.13), top + 0.2, zf - 0.22);
        body.add(mr);
        const mg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), S.dark);
        mg.position.set(sd * (cw / 2 + 0.04), top + 0.16, zf - 0.18);
        body.add(mg);
      });
    }

    // --- lampu depan LED tipis + bar DRL penuh, lampu belakang bar LED penuh
    const heads = [];
    [-1, 1].forEach((sd) => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.24, Math.max(0.05, Hb * 0.08), 0.05), S.head);
      hl.position.set(sd * Wd * 0.31, c + Hb * 0.5, nz + 0.11);
      hl.rotation.y = -sd * 0.18;
      body.add(hl); heads.push(hl);
    });
    const drl = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.8, 0.025, 0.04), S.head);
    drl.position.set(0, c + Hb * 0.43, nz + 0.13);
    body.add(drl);
    const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.02, 0.05) });
    const tl = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.92, Math.max(0.045, Hb * 0.07), 0.05), tailMat);
    tl.position.set(0, c + Hb * 0.7, tz - 0.12);
    body.add(tl);
    [-1, 1].forEach((sd) => {
      const tc = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.2, Math.max(0.08, Hb * 0.14), 0.05), tailMat);
      tc.position.set(sd * Wd * 0.36, c + Hb * 0.64, tz - 0.12);
      body.add(tc);
    });
    // intake bawah, splitter, diffuser, cladding samping hitam
    const grill = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.56, Hb * 0.18, 0.05), S.dark);
    grill.position.set(0, c + Hb * 0.2, nz + 0.1);
    body.add(grill);
    const spl0 = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.86, 0.04, 0.16), S.dark);
    spl0.position.set(0, c + 0.03, nz - 0.02);
    body.add(spl0);
    const dif0 = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.7, Hb * 0.16, 0.06), S.dark);
    dif0.position.set(0, c + Hb * 0.12, tz - 0.1);
    body.add(dif0);
    [-1, 1].forEach((sd) => {
      const cl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, L * 0.5), S.dark);
      cl.position.set(sd * (Wd / 2 + 0.005), c + 0.08, 0);
      body.add(cl);
    });
    // knalpot ganda
    const exhausts = [];
    [-1, 1].forEach((sd) => {
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.2, 12).rotateX(Math.PI / 2), S.chrome);
      ex.position.set(sd * Wd * 0.3, c + 0.12, tz - 0.12);
      body.add(ex); exhausts.push(ex);
    });
    // lengkungan roda: rongga gelap + flare bodi
    const archGeo = new THREE.CircleGeometry(sh.wr * 1.18, 20, 0, Math.PI);
    const flareGeo = opts.lite ? null : new THREE.TorusGeometry(sh.wr * 1.2, 0.05, 6, 18, Math.PI);
    [-1, 1].forEach((sd) => {
      [-1, 1].forEach((fz) => {
        const a = new THREE.Mesh(archGeo, S.arch);
        a.rotation.y = sd * Math.PI / 2;
        a.position.set(sd * (Wd / 2 + 0.006), sh.wr, fz * L * 0.31);
        body.add(a);
        if (flareGeo) {
          const f = new THREE.Mesh(flareGeo, paint);
          f.rotation.y = Math.PI / 2;
          f.position.set(sd * (Wd / 2 - 0.01), sh.wr, fz * L * 0.31);
          body.add(f);
        }
      });
    });

    // --- body kit
    if (st.kit >= 1) {
      const spl = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.95, 0.05, 0.25), S.dark);
      spl.position.set(0, c + 0.04, L / 2 - 0.02);
      body.add(spl);
      [-1, 1].forEach((sd) => {
        const sk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, L * 0.5), paint);
        sk.position.set(sd * (Wd / 2 + 0.02), c + 0.07, 0);
        body.add(sk);
      });
      const dif = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.7, 0.1, 0.2), S.dark);
      dif.position.set(0, c + 0.05, -L / 2 + 0.05);
      body.add(dif);
    }
    if (st.kit === 2) {
      [-1, 1].forEach((sd) => {
        [-1, 1].forEach((fz) => {
          const fl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, sh.wr * 2.6), paint);
          fl.position.set(sd * (Wd / 2 + 0.02), sh.wr * 2 + 0.02, fz * L * 0.31);
          body.add(fl);
        });
      });
    }

    // --- spoiler
    if (st.spoiler > 0) {
      const sz = -L / 2 + sh.tail * 0.5 + 0.05;
      if (st.spoiler === 1) {
        const lip = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.85, 0.05, 0.18), paint);
        lip.position.set(0, top + 0.03, sz); body.add(lip);
      } else if (st.spoiler === 2) {
        const dt = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.9, 0.14, 0.3), paint);
        dt.position.set(0, top + 0.06, sz); dt.rotation.x = 0.35; body.add(dt);
      } else {
        const h = st.spoiler === 3 ? 0.32 : 0.4;
        const wing = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.98, 0.04, 0.34), st.spoiler === 4 ? S.dark : paint);
        wing.position.set(0, top + h, sz - 0.05); wing.rotation.x = -0.12; body.add(wing);
        if (st.spoiler === 4) {
          const w2 = wing.clone(); w2.material = paint; w2.position.y += 0.12; w2.position.z -= 0.06; w2.scale.set(1, 1, 0.8); body.add(w2);
        }
        [-1, 1].forEach((sd) => {
          const pl = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.12), S.dark);
          pl.position.set(sd * Wd * 0.3, top + h / 2, sz - 0.02); body.add(pl);
          const ep = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.4), paint);
          ep.position.set(sd * Wd * 0.49, top + h + 0.03, sz - 0.05); body.add(ep);
        });
      }
    }

    // --- stiker / vinyl samping
    if (st.vinyl > 0) {
      const tex = this.vinylTex(st.vinyl, st.vinylColor || '#ffffff', st.paint);
      const vm = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: fin.rough, metalness: fin.metal * 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false, envMap: opts.env || World.envMap, envMapIntensity: 0.8 });
      [-1, 1].forEach((sd) => {
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.74, Hb * 0.8), vm);
        pl.rotation.y = sd * Math.PI / 2;
        if (sd > 0) pl.scale.x = -1;
        pl.position.set(sd * (Wd / 2 * 0.985 + 0.012), c + Hb * 0.48, -0.02);
        body.add(pl);
      });
    }

    // --- roda
    const rimMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(st.rim || '#c9ced6'), roughness: 0.25, metalness: 0.9, envMap: opts.env || World.envMap });
    const wheels = [];
    const wbase = L * 0.31;
    const wr = sh.wr;
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (Wd / 2 - 0.08), wr, sz * wbase);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(S.wheelGeo, S.tire);
      tire.scale.set(0.27, wr, wr);
      tire.castShadow = true;
      spin.add(tire);
      // velg besar ber-palang banyak (ban profil tipis)
      const barrel = new THREE.Mesh(S.rimGeo, S.disc);
      barrel.scale.set(0.275, wr * 0.8, wr * 0.8);
      spin.add(barrel);
      if (opts.lite) {
        const face = new THREE.Mesh(S.rimGeo, rimMat);
        face.scale.set(0.282, wr * 0.7, wr * 0.7);
        spin.add(face);
      } else {
        const sp = new THREE.Mesh(this.spokeGeo(wr), rimMat);
        sp.position.x = sx * 0.13;
        sp.scale.x = sx;
        spin.add(sp);
        // kaliper rem merah (tidak ikut berputar)
        const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, wr * 0.5, wr * 0.32), S.caliper);
        cal.position.set(sx * 0.05, wr * 0.32, -sz * wr * 0.2);
        pivot.add(cal);
      }
      pivot.add(spin);
      root.add(pivot);
      wheels.push({ pivot, spin, front: sz > 0 });
    });

    // --- lampu neon bawah (underglow)
    let glow = null;
    if (st.glow) {
      glow = new THREE.Mesh(new THREE.PlaneGeometry(Wd * 2.0, L * 1.35), new THREE.MeshBasicMaterial({ map: S.glowTex, color: new THREE.Color(st.glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.05;
      root.add(glow);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(Wd * 0.9, 0.03, L * 0.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(st.glow) }));
      strip.position.y = c - 0.02;
      body.add(strip);
    }
    // bayangan palsu
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(Wd * 1.5, L * 1.25), S.shadowMat);
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.04;
    root.add(shadow);
    // sorot lampu depan di jalan
    let beam = null;
    if (!opts.noBeam && (!World.T || World.T.beams)) {
      beam = new THREE.Mesh(new THREE.PlaneGeometry(9, 22), S.beamMat);
      beam.rotation.x = -Math.PI / 2;
      beam.position.set(0, 0.045, L / 2 + 11);
      root.add(beam);
    }
    // api nitro
    const flames = exhausts.map((ex) => {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.9, 8).rotateX(-Math.PI / 2), S.flameMat);
      f.position.set(ex.position.x, ex.position.y, ex.position.z - 0.55);
      f.visible = false;
      body.add(f);
      return f;
    });

    // --- livery desain sendiri (dari Studio Desain atau gambar impor)
    let liveryTexs = null;
    const livSrc = opts.liveTex || (st.custom ? this.liveryTex(st.custom) : null);
    if (livSrc && !opts.lite) {
      const mask = this.liveryMask(entry.model);
      const mirror = st.customMirror !== false;
      liveryTexs = [livSrc];
      [-1, 1].forEach((sd) => {
        let tex = livSrc;
        // sisi kiri mobil: gambar dibalik agar tulisan tetap terbaca (bisa dimatikan)
        if (sd > 0 && mirror) {
          tex = livSrc.clone();
          tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = -1; tex.offset.x = 1;
          tex.needsUpdate = true;
          liveryTexs.push(tex);
        }
        const lm = new THREE.MeshStandardMaterial({
          map: tex, alphaMap: mask, transparent: true, alphaTest: 0.04, depthWrite: false,
          roughness: fin.rough, metalness: fin.metal * 0.4, envMap: envM, envMapIntensity: 0.9,
          polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
        });
        body.add(new THREE.Mesh(this.liveryGeo(sh, Wd, sd), lm));
      });
    }

    root.userData = { body, wheels, tailMat, flames, glow, beam, len: L, wid: Wd, wr, liveryTexs };
    return root;
  },

  vinylTex(type, color, paint) {
    const c = Tex.canvas(512, 128);
    const g = c.getContext('2d');
    g.fillStyle = color;
    g.strokeStyle = color;
    // u=0 belakang, u=1 depan
    if (type === 1) { // garis balap
      g.fillRect(0, 70, 512, 14);
      g.fillRect(0, 90, 512, 6);
    } else if (type === 2) { // petir
      g.beginPath();
      g.moveTo(512, 40); g.lineTo(380, 60); g.lineTo(400, 48); g.lineTo(240, 82); g.lineTo(262, 66); g.lineTo(60, 100);
      g.lineTo(250, 78); g.lineTo(228, 94); g.lineTo(390, 66); g.lineTo(372, 80); g.lineTo(512, 56);
      g.closePath(); g.fill();
    } else if (type === 3) { // lidah api dari depan
      for (let k = 0; k < 6; k++) {
        const y = 30 + k * 13;
        const len = 220 + Math.sin(k * 1.7) * 90 + k * 10;
        g.beginPath();
        g.moveTo(512, y - 8);
        g.bezierCurveTo(512 - len * 0.5, y - 26, 512 - len * 0.7, y + 12, 512 - len, y);
        g.bezierCurveTo(512 - len * 0.6, y + 22, 512 - len * 0.3, y + 4, 512, y + 14);
        g.closePath(); g.fill();
      }
    } else if (type === 4) { // pecahan
      const r = U.rng(7);
      for (let k = 0; k < 18; k++) {
        const x = r() * 512, y = 20 + r() * 90;
        g.globalAlpha = 0.6 + r() * 0.4;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + r() * 60, y + (r() - 0.5) * 50); g.lineTo(x + (r() - 0.5) * 40, y + 20 + r() * 30); g.closePath(); g.fill();
      }
      g.globalAlpha = 1;
    } else if (type === 5) { // nomor balap
      g.fillRect(0, 96, 512, 10);
      g.beginPath(); g.arc(270, 62, 40, 0, Math.PI * 2); g.fill();
      g.fillStyle = paint; g.font = 'bold 52px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('27', 270, 64);
    } else if (type === 6) { // gelombang
      g.lineWidth = 9;
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        for (let x = 0; x <= 512; x += 8) {
          const y = 60 + k * 18 + Math.sin(x / 40 + k) * 12;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.globalAlpha = 1 - k * 0.25;
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    return Tex.make(c);
  },

  dispose(obj) {
    const S = this.shared();
    obj.traverse((o) => {
      if (o.isMesh) {
        if (o.userData.noDispose) return; // geometri model .glb dipakai bersama
        if (o.geometry !== S.wheelGeo && o.geometry !== S.rimGeo && !o.geometry.userData.shared) o.geometry.dispose();
        const m = o.material;
        if (m && ![S.tire, S.dark, S.chrome, S.head, S.arch, S.disc, S.caliper, S.shadowMat, S.beamMat, S.flameMat].includes(m)) {
          if (m.map && !m.map._shared && m.map !== S.glowTex && m.map !== S.shadowTex && m.map !== S.beamTex) m.map.dispose();
          m.dispose();
        }
      }
    });
  },
};

/* ---------------------------- FISIKA KENDARAAN ---------------------------- */
class Vehicle {
  constructor(entry, opts = {}) {
    this.entry = entry;
    this.model = DATA.carById(entry.model);
    this.stats = DATA.computeStats(entry);
    this.mesh = CarFactory.build(entry, opts);
    this.ud = this.mesh.userData;
    this.isPlayer = !!opts.player;
    this.name = opts.name || '';
    this.x = 0; this.z = 0; this.h = 0;
    this.vx = 0; this.vz = 0; this.w = 0;
    this.gear = 1; this.rpm = 0.15; this.shiftTimer = 0;
    this.nitro = this.stats.nitroCap;
    this.nitroOn = false;
    this.manual = false;
    this.powerMul = 1;
    this.inp = { throttle: 0, brake: 0, steer: 0, handbrake: 0, nitro: false };
    this.slip = 0; this.speed = 0; this.vF = 0; this.vR = 0;
    this.frozen = false;
    this.wheelRot = 0;
    this.steerVis = 0;
    this.roll = 0; this.pitch = 0;
    this.lastHit = 0;
    this.circles = this.model.shape.len > 6 ? [-1, 0, 1] : [-1, 1];
    this.cOff = this.model.shape.len / 2 - this.model.shape.wid / 2;
    this.cRad = this.model.shape.wid / 2 + 0.1;
    this.mass = this.model.cls === 'T' ? 3 : 1;
    this.gearTops = [0.3, 0.46, 0.62, 0.77, 0.9, 1.0];
    this.launch = 0;
    this.overRev = 0;
  }

  place(x, z, h) {
    this.x = x; this.z = z; this.h = h;
    this.vx = this.vz = this.w = 0;
    this.gear = 1; this.rpm = 0.15;
    this.sync();
  }

  get kmh() { return Math.abs(this.vF) * 3.6; }

  gearTop(g) { return this.stats.top * this.powerMulTop() * this.gearTops[g - 1]; }
  powerMulTop() { return 0.75 + this.powerMul * 0.25; }

  shiftUp() {
    if (this.gear < this.stats.gears && this.shiftTimer <= 0) {
      const perfect = this.rpm > 0.86 && this.rpm < 0.97;
      this.gear++; this.shiftTimer = this.stats.shiftTime;
      if (this.isPlayer) AudioSys.blowoff();
      return perfect;
    }
    return null;
  }
  shiftDown() {
    if (this.gear > 1 && this.shiftTimer <= 0) { this.gear--; this.shiftTimer = this.stats.shiftTime * 0.6; }
  }

  update(dt) {
    const s = this.stats, inp = this.inp;
    const sin = Math.sin(this.h), cos = Math.cos(this.h);
    const fx = sin, fz = cos;            // arah depan
    const rx = -cos, rz = sin;           // arah kanan
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;
    const speed = Math.hypot(this.vx, this.vz);
    this.speed = speed;

    if (this.frozen) {
      // mesin boleh digas saat hitung mundur
      const target = inp.throttle > 0 ? 0.25 + inp.throttle * 0.75 : 0.15;
      this.rpm += (target - this.rpm) * Math.min(1, dt * (inp.throttle > 0 ? 3.5 : 2.5));
      this.vx = this.vz = this.w = 0;
      this.vF = 0; this.slip = 0;
      this.sync(dt);
      return;
    }

    // ---- transmisi
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    const topEff = s.top * this.powerMulTop() * (this.nitroOn ? 1.12 : 1);
    if (vF < -0.5 && inp.brake > 0) this.gear = -1;
    else if (this.gear === -1 && vF > -0.5) this.gear = 1;
    if (this.gear > 0) {
      const gt = this.gearTop(this.gear);
      const lowT = this.gear > 1 ? this.gearTop(this.gear - 1) : 0;
      const rn = U.clamp((vF - lowT * 0.55) / (gt - lowT * 0.55), 0, 1.05);
      const targetRpm = 0.15 + 0.85 * rn;
      if (speed < 1 && inp.throttle > 0) this.rpm += (0.55 - this.rpm) * Math.min(1, dt * 4);
      else this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * 12);
      if (!this.manual) {
        if (this.rpm > 0.95 && this.gear < s.gears && this.shiftTimer <= 0 && inp.throttle > 0) {
          this.gear++; this.shiftTimer = s.shiftTime;
          if (this.isPlayer) AudioSys.blowoff();
        } else if (this.rpm < 0.42 && this.gear > 1 && this.shiftTimer <= 0) {
          this.gear--; this.shiftTimer = s.shiftTime * 0.5;
        }
      }
    } else {
      this.rpm += (0.2 + Math.min(0.6, Math.abs(vF) / 15) - this.rpm) * Math.min(1, dt * 8);
    }

    // ---- gaya memanjang
    let a = 0;
    const gearMul = [1.35, 1.15, 1.0, 0.9, 0.82, 0.76][U.clamp(this.gear, 1, 6) - 1];
    const torque = 0.75 + 0.35 * Math.sin(Math.PI * U.clamp(this.rpm, 0, 1) * 0.95);
    this.nitroOn = false;
    if (inp.throttle > 0) {
      if (vF >= -0.5 && this.gear !== -1) {
        let drive = s.accel * this.powerMul * gearMul * torque * inp.throttle;
        drive *= Math.max(0, 1 - Math.pow(Math.max(0, vF) / topEff, 2.4));
        if (this.shiftTimer > 0) drive *= 0.15;
        if (this.manual && this.gear > 0 && vF >= this.gearTop(this.gear) * 1.0) { drive = 0; this.overRev += dt; } else this.overRev = 0;
        if (this.launch > 0) { drive *= 1.35; this.launch -= dt; }
        if (inp.nitro && this.nitro > 0) {
          this.nitroOn = true;
          drive += s.nitroPow * Math.max(0.2, 1 - vF / (topEff * 1.05));
          this.nitro = Math.max(0, this.nitro - dt);
        }
        a += drive;
      } else {
        a += 10 * inp.throttle; // mundur lalu gas = rem
      }
    }
    if (inp.brake > 0) {
      if (vF > 0.5) a -= 15 * inp.brake;
      else if (vF > -14) a -= 5 * inp.brake; // mundur
    }
    // hambatan
    a -= Math.sign(vF) * (0.35 + 0.00038 * vF * vF + (inp.throttle === 0 && inp.brake === 0 ? 1.0 : 0));
    if (inp.handbrake) a -= Math.sign(vF) * 2.8;
    const newVF = vF + a * dt;
    if ((vF > 0 && newVF < 0 && inp.throttle === 0 && inp.brake === 0) || (vF < 0 && newVF > 0 && inp.throttle === 0)) vF = 0;
    else vF = newVF;
    // kecepatan dunia setelah gaya memanjang (masih pakai heading lama)
    let wx = fx * vF + rx * vR, wz = fz * vF + rz * vR;

    // ---- setir, yaw & DRIFT
    // PERBAIKAN: dulu vektor kecepatan ikut berputar 100% bersama bodi, sehingga mobil
    // tidak pernah bisa menyamping (slip selalu 0) dan rem tangan tidak membantu berbelok.
    // Sekarang kecepatan tetap di koordinat dunia; ban yang menariknya ke arah hidung mobil.
    const stAng = inp.steer * 0.62 / (1 + speed / 11);
    const wb = this.model.shape.len * 0.62;
    const grip = s.grip * 9.81 * 1.6;
    const velAng = speed > 0.5 ? Math.atan2(wx, wz) : this.h;
    const sa = speed > 2 && vF > 0 ? U.angDiff(this.h, velAng) : 0; // sudut slip bertanda
    const slipDeg = Math.abs(sa) * 57.3;
    this.driftT = this.driftT || 0;
    if (inp.handbrake && speed > 7 && vF > 0) this.driftT = 0.7;
    else if (slipDeg > 10 && speed > 8 && inp.throttle > 0 && Math.abs(inp.steer) > 0.2) this.driftT = Math.max(this.driftT, 0.35);
    else this.driftT = Math.max(0, this.driftT - dt);
    const drifting = this.driftT > 0 && vF > 3;
    this.drifting = drifting;
    let targetW, maxLat;
    if (drifting) {
      // saat drift, setir mengatur putaran bodi secara langsung (gaya arcade)
      maxLat = grip * (inp.handbrake ? 0.3 : 0.55);
      targetW = -inp.steer * (1.45 + 0.5 * s.steer) * (inp.handbrake ? 1.3 : 1);
      if (Math.abs(sa) > 0.95) targetW += (sa - Math.sign(sa) * 0.95) * 9; // batas sudut ±55-60°
    } else {
      maxLat = grip;
      targetW = -vF * Math.tan(stAng) / wb;
      const yawLim = (maxLat * 1.2) / Math.max(speed, 4);
      targetW = U.clamp(targetW, -yawLim, yawLim);
      if (Math.abs(sa) > 0.2) targetW += (sa - Math.sign(sa) * 0.2) * 3; // cegah spin
    }
    this.w += (targetW - this.w) * Math.min(1, dt * (drifting ? 6 : 8) * s.steer);
    if (speed < 0.5) this.w *= 0.8;
    this.h += this.w * dt;

    // bantuan drift: arah gerak perlahan mengikuti hidung mobil (agar bisa menikung sambil menyamping)
    if (drifting && speed > 1) {
      const d = U.angDiff(Math.atan2(wx, wz), this.h);
      const rot = U.clamp(d, -0.9 * dt, 0.9 * dt);
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const nx = wx * cs + wz * sn, nz = -wx * sn + wz * cs;
      wx = nx; wz = nz;
    }

    // uraikan kecepatan ke arah heading BARU, lalu ban menahan gerak menyamping (terbatas)
    const s2 = Math.sin(this.h), c2 = Math.cos(this.h);
    vF = wx * s2 + wz * c2;
    vR = wx * (-c2) + wz * s2;
    const want = -vR * (1 - Math.exp(-14 * dt));
    const lim = maxLat * dt;
    vR += U.clamp(want, -lim, lim);
    if (slipDeg > 15) vF *= 1 - dt * (drifting ? 0.06 : 0.12);

    this.vx = s2 * vF + (-c2) * vR;
    this.vz = c2 * vF + s2 * vR;
    this.vF = vF; this.vR = vR;
    this.slip = slipDeg;
    this.latAcc = U.lerp(this.latAcc || 0, this.w * vF, 0.1);
    this.lonAcc = U.lerp(this.lonAcc || 0, a, 0.1);

    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }

  // tabrakan dengan kota (2-3 lingkaran sepanjang bodi)
  collideWorld() {
    let maxHit = 0;
    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    for (const k of this.circles) {
      const ox = this.x + fx * this.cOff * k, oz = this.z + fz * this.cOff * k;
      const o = { x: ox, z: oz, vx: this.vx, vz: this.vz, radius: this.cRad };
      const hit = World.collide(o);
      if (hit > 0 || o.x !== ox || o.z !== oz) {
        this.x += o.x - ox; this.z += o.z - oz;
        this.vx = o.vx; this.vz = o.vz;
        if (hit > 0) {
          // putaran akibat benturan
          const lever = this.cOff * k;
          const cross = fx * (o.nz || 0) - fz * (o.nx || 0);
          this.w += cross * lever * hit * 0.05;
          maxHit = Math.max(maxHit, hit);
        }
      }
    }
    return maxHit;
  }

  sync(dt = 0) {
    const m = this.mesh;
    m.position.set(this.x, 0, this.z);
    m.rotation.y = this.h;
    const ud = this.ud;
    this.wheelRot += (this.vF / ud.wr) * dt;
    this.steerVis = U.lerp(this.steerVis, -this.inp.steer * 0.5, Math.min(1, dt * 10));
    ud.wheels.forEach((w) => {
      w.spin.rotation.x = (w.baseRot ? w.baseRot.x : 0) + this.wheelRot;
      if (w.front) w.pivot.rotation.y = (w.baseRot ? w.baseRot.y : 0) + this.steerVis;
    });
    // miring bodi
    const tr = U.clamp((this.latAcc || 0) * 0.006, -0.07, 0.07);
    const tp = U.clamp(-(this.lonAcc || 0) * 0.004, -0.05, 0.05);
    this.roll = U.lerp(this.roll, tr, Math.min(1, dt * 6));
    this.pitch = U.lerp(this.pitch, tp, Math.min(1, dt * 6));
    ud.body.rotation.z = this.roll;
    ud.body.rotation.x = this.pitch;
    if (this.inp.brake > 0 && this.vF > 0.5) ud.tailMat.color.setRGB(3.2, 0.1, 0.2);
    else if (this.gear === -1) ud.tailMat.color.setRGB(2, 2, 2);
    else ud.tailMat.color.setRGB(0.9, 0.02, 0.06);
    const nOn = this.nitroOn;
    ud.flames.forEach((f) => { f.visible = nOn; if (nOn) f.scale.set(1, 1, 0.7 + Math.random() * 0.6); });
  }
}

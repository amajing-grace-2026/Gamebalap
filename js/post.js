/* =========================================================================
   POST-PROCESSING: bloom (cahaya berpendar), blur kecepatan, tone mapping
   sinematik, vignette & grading warna. Otomatis nonaktif jika pustaka gagal
   dimuat atau kualitas grafis "Rendah".
   ========================================================================= */
const Post = {
  enabled: false,
  init(renderer, scene, camera, quality, T) {
    this.renderer = renderer;
    if (quality === 'low' || !THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.ShaderPass) return;
    try {
      const w = innerWidth, h = innerHeight;
      const isGL2 = renderer.capabilities.isWebGL2;
      const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: isGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType };
      let rt;
      if (isGL2 && THREE.WebGLMultisampleRenderTarget) { rt = new THREE.WebGLMultisampleRenderTarget(w, h, opts); rt.samples = quality === 'high' ? 4 : 2; } else rt = new THREE.WebGLRenderTarget(w, h, opts);
      const comp = new THREE.EffectComposer(renderer, rt);
      comp.setPixelRatio(renderer.getPixelRatio());
      comp.setSize(w, h);
      comp.addPass(new THREE.RenderPass(scene, camera));
      const res = quality === 'high' ? 1 : 0.5;
      this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w * res, h * res), T.bloom, 0.5, T.bloomTh || 1.0);
      comp.addPass(this.bloom);
      this.final = new THREE.ShaderPass(this.FinalShader);
      this.final.uniforms.exposure.value = T.exposure;
      comp.addPass(this.final);
      this.comp = comp;
      this.enabled = true;
    } catch (e) {
      console.warn('Post-processing nonaktif:', e);
      this.enabled = false;
    }
  },
  resize(w, h) { if (this.enabled) { this.comp.setSize(w, h); } },
  // speed: m/s, nitro: bool
  render(scene, camera, dt, speed, nitro) {
    const r = this.renderer;
    if (!this.enabled) {
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.render(scene, camera);
      return;
    }
    r.toneMapping = THREE.NoToneMapping; // tone mapping dikerjakan di FinalShader
    const u = this.final.uniforms;
    const target = U.clamp((speed - 28) / 45, 0, 1) * 0.022 + (nitro ? 0.016 : 0);
    u.blur.value += (target - u.blur.value) * Math.min(1, dt * 4);
    u.time.value += dt;
    this.comp.render(dt);
  },
  FinalShader: {
    uniforms: {
      tDiffuse: { value: null }, blur: { value: 0 }, exposure: { value: 1 }, time: { value: 0 },
      saturation: { value: 1.12 }, contrast: { value: 1.06 }, vignette: { value: 1.0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float blur; uniform float exposure; uniform float time;
      uniform float saturation; uniform float contrast; uniform float vignette;
      varying vec2 vUv;
      vec3 aces(vec3 x){ const float a=2.51; const float b=0.03; const float c=2.43; const float d=0.59; const float e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
      float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
      void main(){
        vec2 dir = vUv - vec2(0.5, 0.52);
        float edge = smoothstep(0.08, 0.6, length(dir));
        vec3 col = vec3(0.0); float tot = 0.0;
        for (int i = 0; i < 12; i++) {
          float t = float(i) / 11.0;
          float w = 1.0 - t * 0.6;
          col += texture2D(tDiffuse, vUv - dir * blur * edge * t * 6.0).rgb * w;
          tot += w;
        }
        col /= tot;
        col = aces(col * exposure);
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(l), col, saturation);
        col = clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
        float v = smoothstep(0.95, 0.35, length(dir) * vignette);
        col *= mix(0.72, 1.0, v);
        col += (rnd(vUv) - 0.5) * 0.012; // grain halus, cegah banding
        gl_FragColor = LinearTosRGB(vec4(col, 1.0));
      }`,
  },
};

// Augmented Face — particle bloom flowers on face landmarks

import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js";

// ── Physics ───────────────────────────────────────────────────
const SPRING       = 0.06;
const DAMPING      = 0.82;
const DOT_SIZE     = 2.5;
const CHAOS_SCALE  = 0.5;
const CHAOS_MULT   = 0.4;  // flowers react less than a full-face asset
const SPEED_SMOOTH = 0.12;

// ── Flower sizing ─────────────────────────────────────────────
const SIZE_BASE    = 52;   // max flower diameter in px
const STAGGER      = 16;   // random y offset per flower (px)
const FLOAT_AMP    = 5;    // float oscillation amplitude (px)
const FLOAT_SPEED  = 0.027;

// ── Bloom cycle ───────────────────────────────────────────────
const BLOOM_PERIOD   = 420;  // frames for one full cycle (~14 s at 30 fps)
const BLOOM_HOLD     = 0.12; // fraction of cycle at full bloom (rare / short)
const BLOOM_SIZE_MIN = 0.04; // size floor — nearly invisible when contracted

// ── Template rendering ────────────────────────────────────────
const REF_SIZE      = 200;  // offscreen buffer side length (px)
const TEMPLATE_STEP = 4;    // pixel sampling step inside buffer
const BG_THRESHOLD  = 20;   // skip pixels with r+g+b below this (background)

// ── Collar / head placement ───────────────────────────────────
const COLLAR_COUNT = 8;
const COLLAR_DROP  = 0.30;  // fraction of faceH to drop below jaw

// Head flowers: { lm, dx, dy } — dx/dy as fractions of faceW / faceH
const HEAD_PLACEMENTS = [
  { lm: 10,  dx:  0.00, dy: -0.22 }, // crown center
  { lm: 10,  dx: -0.22, dy: -0.12 }, // crown left
  { lm: 10,  dx:  0.22, dy: -0.12 }, // crown right
  { lm: 234, dx:  0.22, dy: -0.05 }, // right temple  (234 = right of screen after mirror)
  { lm: 454, dx: -0.22, dy: -0.05 }, // left temple   (454 = left of screen after mirror)
];

// Flower petal palette
const PETAL_COLORS = [
  [107, 143, 212], // #6B8FD4
  [123, 159, 228], // #7B9FE4
  [ 90, 126, 196], // #5A7EC4
  [138, 170, 232], // #8AAAE8
  [155, 186, 248], // #9BBAF8
  [232, 112, 144], // #E87090
  [208,  80, 112], // #D05070
  [240, 128, 144], // #F08090
  [224,  96, 128], // #E06080
];

// Jaw silhouette indices: left edge → chin → right edge
const JAW_INDICES = [
  234,
  172, 136, 150, 149,
  176, 148,
  152,
  377, 400,
  378, 379, 365, 397,
  454,
];

// ── Easing ────────────────────────────────────────────────────
function easeOutCubic(t) {
  t = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - t, 3);
}
function easeOutBack(t, s = 1.5) {
  t = Math.max(0, Math.min(1, t));
  return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
}

// Phase (0–1) → bloom progress (0–1)
// Expand fast (easeOutBack pop) → hold → contract slowly
function bloomProgress(phase) {
  const holdStart = 0.25;
  const holdEnd   = holdStart + BLOOM_HOLD;
  if (phase < holdStart) {
    return Math.max(easeOutBack(phase / holdStart), 0);
  } else if (phase < holdEnd) {
    return 1.0;
  } else {
    return easeOutCubic(1 - (phase - holdEnd) / (1 - holdEnd));
  }
}

// ── Vector flower renderer (used only in setup to bake the template) ──
function drawFlowerAt(p, ax, ay, S, bp, col, nPetals) {
  if (bp <= 0 || S <= 0) return;
  bp = Math.min(1, bp);

  const r     = 0.45;
  const ep    = Math.max(easeOutBack(Math.min(bp * 1.05, 1)), 0);
  const er    = r * ep;
  const alpha = Math.min(bp * 1.8, 1);

  for (let i = 0; i < nPetals; i++) {
    const angle = (Math.PI * 2 * i / nPetals) - Math.PI / 2;
    const pp = easeOutCubic(
      Math.min(Math.max((bp - i / (nPetals * 1.5)) * 2.5, 0), 1)
    );
    if (pp <= 0) continue;

    const ex = ax + Math.cos(angle) * er * S * 0.55;
    const ey = ay + Math.sin(angle) * er * S * 0.55;

    p.push();
    p.translate(ex, ey);
    p.rotate(angle + Math.PI / 2);
    const fc = p.color(col);
    fc.setAlpha(alpha * pp * 255);
    p.fill(fc);
    const sc = p.color(col);
    sc.setAlpha(alpha * pp * 0.6 * 255);
    p.stroke(sc);
    p.strokeWeight(0.4);
    p.ellipse(0, 0, er * 0.58 * pp * S, er * pp * S);
    p.pop();
  }

  const cr = er * 0.30 * S;
  if (cr > 1) {
    p.push();
    const cc = p.color('#2A1A08');
    cc.setAlpha(alpha * 255);
    p.fill(cc);
    const cs = p.color('#4A3018');
    cs.setAlpha(alpha * 0.8 * 255);
    p.stroke(cs);
    p.strokeWeight(0.6);
    p.ellipse(ax, ay, cr * 2, cr * 2);
    p.pop();

    if (bp > 0.45) {
      const sa = Math.min((bp - 0.45) * 2.0, 1);
      for (let j = 0; j < 6; j++) {
        const a  = Math.PI * 2 * j / 6;
        const sx = ax + Math.cos(a) * cr * 0.62;
        const sy = ay + Math.sin(a) * cr * 0.62;
        p.push();
        const yc = p.color('#FFE060');
        yc.setAlpha(sa * alpha * 255);
        p.fill(yc);
        p.noStroke();
        p.ellipse(sx, sy, cr * 0.36, cr * 0.36);
        p.pop();
      }
    }
  }
}

// ── FlowerParticle ────────────────────────────────────────────
// nx/ny: normalized position relative to flower center (−0.5 → 0.5)
// tr/tg/tb: per-flower petal tint (overrides template blue channels)
class FlowerParticle {
  constructor(nx, ny, r, g, b, isPetal) {
    this.nx      = nx;
    this.ny      = ny;
    this.r       = r;
    this.g       = g;
    this.b       = b;
    this.isPetal = isPetal; // true → use flower's tint color at draw time
    this.x = this.y = this.vx = this.vy = 0;
    this.ready = false;
  }

  setTarget(ax, ay, size) {
    this.tx = ax + this.nx * size;
    this.ty = ay + this.ny * size;
    if (!this.ready) {
      this.x = this.tx;
      this.y = this.ty;
      this.ready = true;
    }
  }

  update(chaos) {
    if (!this.ready) return;
    this.vx += (this.tx - this.x) * SPRING;
    this.vy += (this.ty - this.y) * SPRING;
    this.vx += (Math.random() * 2 - 1) * chaos;
    this.vy += (Math.random() * 2 - 1) * chaos;
    this.vx *= DAMPING;
    this.vy *= DAMPING;
    this.x  += this.vx;
    this.y  += this.vy;
  }
}

// ── FlowerInstance ────────────────────────────────────────────
class FlowerInstance {
  constructor(template, tint) {
    this.floatPhase  = Math.random() * Math.PI * 2;
    this.floatAmp    = FLOAT_AMP  * (0.7 + Math.random() * 0.6);
    this.floatSpeed  = FLOAT_SPEED * (0.8 + Math.random() * 0.4);
    this.yStagger    = (Math.random() - 0.5) * STAGGER;
    this.maxSize     = SIZE_BASE  * (0.8 + Math.random() * 0.4);
    // Spread bloom offsets so flowers don't all open together
    this.bloomOffset = Math.random() * BLOOM_PERIOD;

    this.ax = 0; this.ay = 0;
    this.ready = false;

    const [tr, tg, tb] = tint;
    this.particles = template.map(
      (pt) => new FlowerParticle(pt.nx, pt.ny, pt.r, pt.g, pt.b, pt.isPetal)
    );
    // Bake petal tint into particles now
    for (const pt of this.particles) {
      if (pt.isPetal) { pt.r = tr; pt.g = tg; pt.b = tb; }
    }
  }

  setAnchor(x, y) {
    this.ax    = x;
    this.ay    = y + this.yStagger;
    this.ready = true;
  }

  update(frameCount, chaos) {
    if (!this.ready) return;
    const phase = ((frameCount + this.bloomOffset) % BLOOM_PERIOD) / BLOOM_PERIOD;
    const bp    = bloomProgress(phase);
    const size  = this.maxSize * (BLOOM_SIZE_MIN + (1 - BLOOM_SIZE_MIN) * bp);
    const floatY = Math.sin(frameCount * this.floatSpeed + this.floatPhase) * this.floatAmp;

    for (const pt of this.particles) {
      pt.setTarget(this.ax, this.ay + floatY, size);
      pt.update(chaos * CHAOS_MULT);
    }
  }

  draw(p) {
    if (!this.ready) return;
    p.noStroke();
    for (const pt of this.particles) {
      p.fill(pt.r, pt.g, pt.b);
      p.circle(pt.x, pt.y, DOT_SIZE);
    }
  }
}

// ── State ─────────────────────────────────────────────────────
let faceLandmarker;
let webcam;
let faceResults;
let lastVideoTime = -1;
let flowers = [];

let prevFaceCx = null;
let prevFaceCy = null;
let smoothSpeed = 0;

// ── Sketch ────────────────────────────────────────────────────
const sketch = (p) => {

  p.setup = async () => {
    p.createCanvas(p.windowWidth, p.windowHeight);

    webcam = p.createCapture(p.VIDEO);
    webcam.size(640, 480);
    webcam.hide();

    // ── Bake flower template into particles ────────────────────
    // Render a full-bloom vector flower into an offscreen buffer,
    // then sample its pixels to create the particle template.
    const gfx = p.createGraphics(REF_SIZE, REF_SIZE);
    gfx.background(0);
    drawFlowerAt(gfx, REF_SIZE / 2, REF_SIZE / 2, REF_SIZE * 0.88, 1.0, '#6B8FD4', 8);
    gfx.loadPixels();

    const template = [];
    for (let y = 0; y < REF_SIZE; y += TEMPLATE_STEP) {
      for (let x = 0; x < REF_SIZE; x += TEMPLATE_STEP) {
        const i = (y * REF_SIZE + x) * 4;
        const r = gfx.pixels[i];
        const g = gfx.pixels[i + 1];
        const b = gfx.pixels[i + 2];
        if (r + g + b > BG_THRESHOLD) {
          // isPetal: predominantly blue (from template rendering with '#6B8FD4')
          const isPetal = b > r + 20 && b > g + 10;
          template.push({
            nx: (x - REF_SIZE / 2) / REF_SIZE,
            ny: (y - REF_SIZE / 2) / REF_SIZE,
            r, g, b, isPetal,
          });
        }
      }
    }
    gfx.remove();
    console.log(`${template.length} particles per flower`);

    // ── Create collar flowers (jaw arc, 8 flowers) ─────────────
    for (let i = 0; i < COLLAR_COUNT; i++) {
      const tint = PETAL_COLORS[i % PETAL_COLORS.length];
      flowers.push({ instance: new FlowerInstance(template, tint), type: 'jaw', jawIndex: i });
    }

    // ── Create head flowers (landmark-anchored) ────────────────
    for (const placement of HEAD_PLACEMENTS) {
      const tint = PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)];
      flowers.push({ instance: new FlowerInstance(template, tint), type: 'lm', placement });
    }

    // ── Init MediaPipe FaceLandmarker ──────────────────────────
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
    });
    console.log("FaceLandmarker ready");
  };

  p.draw = () => {
    p.background(0);

    // Mirrored webcam feed
    p.push();
    p.translate(p.width, 0);
    p.scale(-1, 1);
    p.image(webcam, 0, 0, p.width, p.height);
    p.pop();

    if (!faceLandmarker || webcam.elt.readyState < 2) return;

    const now = performance.now();
    if (webcam.elt.currentTime !== lastVideoTime) {
      faceResults = faceLandmarker.detectForVideo(webcam.elt, now);
      lastVideoTime = webcam.elt.currentTime;
    }

    if (faceResults?.faceLandmarks?.length) {
      const landmarks = faceResults.faceLandmarks[0];

      // Face bounding box
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      let faceCx = 0, faceCy = 0;
      for (const lm of landmarks) {
        const sx = (1 - lm.x) * p.width;
        const sy = lm.y * p.height;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        faceCx += sx;
        faceCy += sy;
      }
      faceCx /= landmarks.length;
      faceCy /= landmarks.length;
      const faceW = maxX - minX;
      const faceH = maxY - minY;

      // Face speed
      let rawSpeed = 0;
      if (prevFaceCx !== null) {
        const dx = faceCx - prevFaceCx;
        const dy = faceCy - prevFaceCy;
        rawSpeed = Math.sqrt(dx * dx + dy * dy);
      }
      prevFaceCx = faceCx;
      prevFaceCy = faceCy;
      smoothSpeed += (rawSpeed - smoothSpeed) * SPEED_SMOOTH;

      // Jaw arc for collar
      const jawPoints = JAW_INDICES
        .map((idx) => ({
          x: (1 - landmarks[idx].x) * p.width,
          y: landmarks[idx].y * p.height,
        }))
        .sort((a, b) => a.x - b.x);

      // Update anchors
      for (const f of flowers) {
        if (f.type === 'jaw') {
          const t  = f.jawIndex / (COLLAR_COUNT - 1);
          const ji = Math.round(t * (jawPoints.length - 1));
          const jp = jawPoints[ji];
          f.instance.setAnchor(jp.x, jp.y + faceH * COLLAR_DROP);
        } else {
          const { lm, dx, dy } = f.placement;
          const ax = (1 - landmarks[lm].x) * p.width + dx * faceW;
          const ay = landmarks[lm].y * p.height + dy * faceH;
          f.instance.setAnchor(ax, ay);
        }
      }
    }

    // Update and draw all flowers
    const chaos = smoothSpeed * CHAOS_SCALE;
    for (const f of flowers) {
      f.instance.update(p.frameCount, chaos);
      f.instance.draw(p);
    }
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
};

new p5(sketch);

// Augmented Face — particle bloom flowers on face landmarks

import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js";

// ── Physics ───────────────────────────────────────────────────
const SPRING = 0.06;
const DAMPING = 0.82;
const DOT_SIZE = 2.5;
const CHAOS_SCALE = 0.5;
const CHAOS_MULT = 0.4; // flowers react less than a full-face asset
const SPEED_SMOOTH = 0.12;

// ── Flower sizing ─────────────────────────────────────────────
const SIZE_BASE = 104; // max flower diameter in px
const STAGGER = 16; // random y offset per flower (px)
const FLOAT_AMP = 5; // float oscillation amplitude (px)
const FLOAT_SPEED = 0.027;

// ── Bloom cycle ───────────────────────────────────────────────
const BLOOM_PERIOD = 420; // frames for one full cycle (~14 s at 30 fps)
const BLOOM_HOLD = 0.12; // fraction of cycle at full bloom (rare / short)
const FADE_WIDTH = 0.08; // alpha ramp width per particle (bloom speed)

// ── Template sampling ─────────────────────────────────────────
const SAMPLE_STEP = 6; // pixel sampling step from source image
const DARK_THRESHOLD = 80; // keep pixels darker than this (0–255 avg)

// ── Collar / head placement ───────────────────────────────────
const COLLAR_COUNT = 8;
const COLLAR_DROP = 0.3; // fraction of faceH to drop below jaw

// Head flowers: { lm, dx, dy } — dx/dy as fractions of faceW / faceH
const HEAD_PLACEMENTS = [
  { lm: 10, dx: 0.0, dy: -0.22 }, // crown center
  { lm: 10, dx: -0.22, dy: -0.12 }, // crown left
  { lm: 10, dx: 0.22, dy: -0.12 }, // crown right
  { lm: 234, dx: 0.22, dy: -0.05 }, // right temple  (234 = right of screen after mirror)
  { lm: 454, dx: -0.22, dy: -0.05 }, // left temple   (454 = left of screen after mirror)
];

// Jaw silhouette indices: left edge → chin → right edge
const JAW_INDICES = [
  234, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 454,
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

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Phase (0–1) → bloom progress (0–1)
// Expand fast (easeOutBack pop) → hold → contract slowly
function bloomProgress(phase) {
  const holdStart = 0.25;
  const holdEnd = holdStart + BLOOM_HOLD;
  if (phase < holdStart) {
    return Math.max(easeOutBack(phase / holdStart), 0);
  } else if (phase < holdEnd) {
    return 1.0;
  } else {
    return easeOutCubic(1 - (phase - holdEnd) / (1 - holdEnd));
  }
}

// ── FlowerParticle ────────────────────────────────────────────
// nx/ny: normalized position relative to flower center (−0.5 → 0.5)
class FlowerParticle {
  constructor(nx, ny, r, g, b) {
    this.nx = nx;
    this.ny = ny;
    this.r = r;
    this.g = g;
    this.b = b;
    this.threshold = Math.random() * (1 - FADE_WIDTH); // when this particle appears
    this.alpha = 0;
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
    this.x += this.vx;
    this.y += this.vy;
  }
}

// ── FlowerInstance ────────────────────────────────────────────
class FlowerInstance {
  constructor(template) {
    this.floatPhase = Math.random() * Math.PI * 2;
    this.floatAmp = FLOAT_AMP * (0.7 + Math.random() * 0.6);
    this.floatSpeed = FLOAT_SPEED * (0.8 + Math.random() * 0.4);
    this.yStagger = (Math.random() - 0.5) * STAGGER;
    this.maxSize = SIZE_BASE * (0.8 + Math.random() * 0.4);
    this.bloomOffset = Math.random() * BLOOM_PERIOD;

    this.ax = 0;
    this.ay = 0;
    this.ready = false;

    this.particles = template.map(
      (pt) => new FlowerParticle(pt.nx, pt.ny, pt.r, pt.g, pt.b),
    );
  }

  setAnchor(x, y) {
    this.ax = x;
    this.ay = y + this.yStagger;
    this.ready = true;
  }

  update(frameCount, chaos) {
    if (!this.ready) return;
    const phase =
      ((frameCount + this.bloomOffset) % BLOOM_PERIOD) / BLOOM_PERIOD;
    const bp = bloomProgress(phase);
    const floatY =
      Math.sin(frameCount * this.floatSpeed + this.floatPhase) * this.floatAmp;

    for (const pt of this.particles) {
      // Pixels appear/disappear based on individual threshold vs bloom progress
      pt.alpha = smoothstep(pt.threshold, pt.threshold + FADE_WIDTH, bp) * 255;
      pt.setTarget(this.ax, this.ay + floatY, this.maxSize);
      pt.update(chaos * CHAOS_MULT);
    }
  }

  draw(p) {
    if (!this.ready) return;
    p.noStroke();
    for (const pt of this.particles) {
      if (pt.alpha < 1) continue;
      p.fill(pt.r, pt.g, pt.b, pt.alpha);
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
  let flowerImg;

  p.preload = () => {
    flowerImg = p.loadImage("flowerv2.png");
  };

  p.setup = async () => {
    p.createCanvas(p.windowWidth, p.windowHeight);

    webcam = p.createCapture(p.VIDEO);
    webcam.size(640, 480);
    webcam.hide();

    // ── Build particle template from flowerv2.png ──────────────
    flowerImg.loadPixels();
    const template = [];
    for (let y = 0; y < flowerImg.height; y += SAMPLE_STEP) {
      for (let x = 0; x < flowerImg.width; x += SAMPLE_STEP) {
        const i = (y * flowerImg.width + x) * 4;
        const r = flowerImg.pixels[i];
        const g = flowerImg.pixels[i + 1];
        const b = flowerImg.pixels[i + 2];
        const a = flowerImg.pixels[i + 3];
        if (a > 128) {
          template.push({
            nx: x / flowerImg.width - 0.5,
            ny: y / flowerImg.height - 0.5,
            r,
            g,
            b,
          });
        }
      }
    }
    console.log(`${template.length} particles per flower`);

    // ── Create collar flowers (jaw arc, 8 flowers) ─────────────
    for (let i = 0; i < COLLAR_COUNT; i++) {
      flowers.push({
        instance: new FlowerInstance(template),
        type: "jaw",
        jawIndex: i,
      });
    }

    // ── Create head flowers (landmark-anchored) ────────────────
    for (const placement of HEAD_PLACEMENTS) {
      flowers.push({
        instance: new FlowerInstance(template),
        type: "lm",
        placement,
      });
    }

    // ── Init MediaPipe FaceLandmarker ──────────────────────────
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm",
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
      let minY = Infinity,
        maxY = -Infinity,
        minX = Infinity,
        maxX = -Infinity;
      let faceCx = 0,
        faceCy = 0;
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
      const jawPoints = JAW_INDICES.map((idx) => ({
        x: (1 - landmarks[idx].x) * p.width,
        y: landmarks[idx].y * p.height,
      })).sort((a, b) => a.x - b.x);

      // Update anchors
      for (const f of flowers) {
        if (f.type === "jaw") {
          const t = f.jawIndex / (COLLAR_COUNT - 1);
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

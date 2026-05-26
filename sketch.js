// Augmented Face — Alima aura: free-floating asset puffs spawned at anchors (perfume / air)

import {
  FaceLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js";

const ALIMA_STILLS = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12].map(
  (n) => `Assets/alima/alima-${String(n).padStart(2, "0")}.png`,
);

const SCENT_CONFIG = {
  alima: {
    displayName: "Alima",
    tagline: "Soft floral drift",
    emitFromFullTemplatePool: false,
    /** Visual factor on aura pops + halo dots vs baseline (Jamie/Paloma assets render smaller than Alima). */
    auraAssetScale: 1,
    templatePaths: [
      ...ALIMA_STILLS,
      "Assets/alima/alima-perfume.png",
      "Assets/alima/alima-flowerv2.png",
    ],
  },
  aymeric: {
    displayName: "Aymeric",
    tagline: "Luminous, airy",
    emitFromFullTemplatePool: false,
    auraAssetScale: 1,
    /** Placeholder: same assets as Alima until dedicated Aymeric art exists */
    templatePaths: [
      ...ALIMA_STILLS,
      "Assets/alima/alima-perfume.png",
      "Assets/alima/alima-flowerv2.png",
    ],
  },
  jamie: {
    displayName: "Jamie",
    tagline: "Salt, citrus, shell-light",
    emitFromFullTemplatePool: true,
    auraAssetScale: 1 / 1.5,
    templatePaths: [
      "Assets/jamie/Shell1.png",
      "Assets/jamie/Shell2.png",
      "Assets/jamie/Shell3.png",
      "Assets/jamie/Glass2.png",
      "Assets/jamie/Orange1.png",
      "Assets/jamie/Orange2.png",
      "Assets/jamie/Leaf1.png",
      "Assets/jamie/Leaf2.png",
      "Assets/jamie/jamie-perfume.png",
    ],
  },
  paloma: {
    displayName: "Paloma",
    tagline: "Warm sun, tropical lift",
    /** Each anchor draws randomly from the full set on every spawn (not one image lock per point). */
    emitFromFullTemplatePool: true,
    auraAssetScale: 1 / 1.5,
    templatePaths: [
      "Assets/paloma/paloma-sun.png",
      "Assets/paloma/paloma-leaf-1.png",
      "Assets/paloma/paloma-leaf-2.png",
      "Assets/paloma/paloma-mango.png",
      "Assets/paloma/paloma-perfume.png",
    ],
  },
};

const SCENT_ORDER = /** @type {const} */ ([
  "alima",
  "aymeric",
  "jamie",
  "paloma",
]);

// Jaw samples + extra chin / lower-jaw (no ear-side anchors)
const ALIMA_COLLAR_COUNT = 15;
const EXTRA_PLACEMENTS = [
  { lm: 152, dx: 0, dy: 0.26 },
  { lm: 152, dx: 0.14, dy: 0.36 },
  { lm: 152, dx: -0.14, dy: 0.36 },
  { lm: 176, dx: 0.06, dy: 0.1 },
  { lm: 400, dx: -0.06, dy: 0.1 },
];

// ── Radial drift from body (face center); no wind from head motion ─
const RADIAL_FORCE = 0.03;
const RADIAL_MIN_DIST_FRAC = 0.07;

// ── Body repel (stronger = clearer “push” from head / torso)
const BODY_REPEL_STRENGTH = 0.34;
const BODY_REPEL_POWER = 1.82;
const BODY_REPEL_RADIUS_FRAC = 1.1;
const BODY_REPEL_CORE_BOOST = 4.25;
const BODY_REPEL_CORE_FRAC = 0.52;

// ── Shatter image into template shards when repel is strong / too close
const SHATTER_REPEL_MAG = 0.055;
const SHATTER_DIST_FRAC = 0.36;
/** Fraction of puffs that may shatter on repel; rest stay whole until life ends */
const SHATTER_ON_REPEL_CHANCE = 0.5;
const SHATTER_SHARD_COUNT = 22;
const SHARD_DOT = 3.85;
const SHARD_LIFE_MIN = 26;
const SHARD_LIFE_MAX = 50;
const SHARD_SPEED_MUL = 2.4;

// ── Opacity: fade-in → solid plateau → fade-out
const PUFF_FADE_IN_FRAC = 0.11;
const PUFF_FADE_OUT_FRAC = 0.16;
const PUFF_SOLID_BOOST = 1.12;
const DOT_FADE_IN_FRAC = 0.1;
const DOT_FADE_OUT_FRAC = 0.15;
const DOT_SOLID_BOOST = 1.1;

// ── Emitter timing / caps (lower cap = better FPS)
const SPAWN_INTERVAL_BASE = 7;
const MAX_PUFFS_PER_EMITTER = 22;

// ── Air puff visibility & lifetime ───────────────────────────
const PUFF_SCALE_MIN_FRAC = 0.135;
const PUFF_SCALE_MAX_FRAC = 0.235;
const PUFF_ALPHA_BASE_MIN = 0.62;
const PUFF_ALPHA_BASE_MAX = 0.92;
const PUFF_LIFE_MIN = 280;
const PUFF_LIFE_MAX = 480;
const PUFF_DRAG = 0.989;
const PUFF_TURBULENCE = 0.042;
const PUFF_ROT_DAMP = 0.99;
const PUFF_INIT_SPEED = 0.44;

// ── Optional sparse dots (same anchor spawn, free float) ──────
const DOT_EMIT_CHANCE = 0.17;
const DOT_SIZE = 5.2;
const DOT_LIFE_MULT = 0.78;
const DOT_DRAG = 0.994;
const DOT_RADIAL_FORCE = 0.024;

// ── Template sampling (sparse free particles) ────────────────
const SAMPLE_STEP = 18;
const MAX_TEMPLATE_PARTICLES = 18;

// ── Aura anchor jitter ────────────────────────────────────────
const AURA_JITTER_FRAC = 0.42;
const AURA_BIAS_DOWN_FRAC = 0.14;
const AURA_SHOULDER_SPREAD_FRAC = 0.2;
const AURA_BREATH_SPEED = 0.009;
const AURA_BREATH_AMP = 0.024;

const COLLAR_DROP = 0.3;

// Face model: run every N p5 frames (2 ≈ halves MediaPipe CPU; 1 = every frame)
const FACE_DETECT_EVERY_FRAMES = 1;

// Extra life loss per frame when inside this radius of face center (clears halo near head)
const NEAR_HEAD_DRAIN_RADIUS_FRAC = 1.08;
const NEAR_HEAD_DRAIN_BASE = 1.05;
const NEAR_HEAD_DRAIN_SCALE = 4.2;

// ── Head-tilt pop burst (directional explosion, no cooldown) ───────────────
const HEAD_POP_THRESH = 0.075;
const HEAD_POP_PUFF_COUNT = 15;
const HEAD_POP_DOT_COUNT = 26;
const HEAD_POP_SPEED_MUL = 2.85;
const HEAD_POP_ANGLE_SPREAD = 0.48;
const HEAD_POP_SPAWN_JITTER_FRAC = 0.12;
const LEGACY_POP_LIFE_DRAIN = 5.2;
const MAX_POP_PUFFS = 72;
const MAX_POP_DOTS = 110;
const HEAD_POP_DIR_ANGLE = {
  right: 0,
  left: Math.PI,
  down: Math.PI / 2,
  up: -Math.PI / 2,
};
/** Pop burst image puffs / dots / shards vs aura scale */
const HEAD_POP_VISUAL_SCALE = 1.5;
/** After a head pop: nudge aura puffs/dots along burst dir for this many frames */
const EXPLOSION_PUSH_FRAMES = 56;
const EXPLOSION_PUSH_PER_FRAME = 0.058;

const JAW_INDICES = [
  172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397,
];

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function subsampleTemplate(template, maxN) {
  if (template.length <= maxN) return template;
  const out = [];
  const step = template.length / maxN;
  for (let i = 0; i < maxN; i++) {
    out.push(template[Math.min(template.length - 1, Math.floor(i * step))]);
  }
  return out;
}

function buildTemplateFromImage(img) {
  img.loadPixels();
  const template = [];
  for (let y = 0; y < img.height; y += SAMPLE_STEP) {
    for (let x = 0; x < img.width; x += SAMPLE_STEP) {
      const i = (y * img.width + x) * 4;
      const r = img.pixels[i];
      const g = img.pixels[i + 1];
      const b = img.pixels[i + 2];
      const a = img.pixels[i + 3];
      if (a > 128) {
        template.push({ nx: x / img.width - 0.5, ny: y / img.height - 0.5, r, g, b });
      }
    }
  }
  return subsampleTemplate(template, MAX_TEMPLATE_PARTICLES);
}

function makeAuraParams() {
  const ang = Math.random() * Math.PI * 2;
  const rad = Math.sqrt(Math.random());
  return {
    jx: Math.cos(ang) * rad,
    jy: Math.sin(ang) * rad,
    shoulderJitter: Math.random(),
    breathPhase: Math.random() * Math.PI * 2,
  };
}

function computeAuraAnchor(ax, ay, faceW, faceH, faceCx, aura, frameCount) {
  const outward = ax >= faceCx ? 1 : -1;
  const shoulder =
    faceW *
    AURA_SHOULDER_SPREAD_FRAC *
    outward *
    (0.35 + aura.shoulderJitter * 0.35);
  const jitterX = faceW * AURA_JITTER_FRAC * aura.jx;
  const jitterY = faceH * (AURA_BIAS_DOWN_FRAC + AURA_JITTER_FRAC * aura.jy);
  const breath =
    Math.sin(frameCount * AURA_BREATH_SPEED + aura.breathPhase) *
    faceH *
    AURA_BREATH_AMP;
  return { x: ax + jitterX + shoulder, y: ay + jitterY + breath };
}

function spawnHeadPop(dir, env, p) {
  if (!flowers.length) return;
  const baseAngle = HEAD_POP_DIR_ANGLE[dir];
  const g = POP_GEN;
  const jitter = env.faceW * HEAD_POP_SPAWN_JITTER_FRAC;
  const cx = env.bodyCx;
  const cy = env.bodyCy;
  const burst = {
    baseAngle,
    popGen: g,
    speedMul: HEAD_POP_SPEED_MUL,
    angleSpread: HEAD_POP_ANGLE_SPREAD,
    visualScale: HEAD_POP_VISUAL_SCALE,
  };
  const burstDots = {
    baseAngle,
    popGen: g,
    speedMul: HEAD_POP_SPEED_MUL * 1.12,
    angleSpread: HEAD_POP_ANGLE_SPREAD * 1.08,
    visualScale: HEAD_POP_VISUAL_SCALE,
  };

  for (let i = 0; i < HEAD_POP_PUFF_COUNT; i++) {
    const f = flowers[(Math.random() * flowers.length) | 0];
    const { img, dotTemplate: tpl } = f.instance.pickSpawnVariant();
    if (!img?.width || !tpl?.length) continue;
    const px = cx + (Math.random() * 2 - 1) * jitter;
    const py = cy + (Math.random() * 2 - 1) * jitter;
    const auraMul = env.auraAssetScale ?? 1;
    popPuffs.push(
      new AirPuff(px, py, img, env.faceW, cx, cy, tpl, burst, auraMul),
    );
  }
  for (let i = 0; i < HEAD_POP_DOT_COUNT; i++) {
    const f = flowers[(Math.random() * flowers.length) | 0];
    const { dotTemplate: tpl } = f.instance.pickSpawnVariant();
    if (!tpl?.length) continue;
    const pt = tpl[(Math.random() * tpl.length) | 0];
    const px = cx + (Math.random() * 2 - 1) * jitter * 0.85;
    const py = cy + (Math.random() * 2 - 1) * jitter * 0.85;
    const auraMul = env.auraAssetScale ?? 1;
    popDots.push(
      new FloatDot(
        px,
        py,
        pt.r,
        pt.g,
        pt.b,
        env.faceW,
        cx,
        cy,
        burstDots,
        auraMul,
      ),
    );
  }
  while (popPuffs.length > MAX_POP_PUFFS) popPuffs.shift();
  while (popDots.length > MAX_POP_DOTS) popDots.shift();
}

function updatePopLayer(env) {
  for (let i = popPuffs.length - 1; i >= 0; i--) {
    popPuffs[i].step(env);
    if (popPuffs[i].dead()) popPuffs.splice(i, 1);
  }
  for (let i = popDots.length - 1; i >= 0; i--) {
    popDots[i].step(env);
    if (popDots[i].dead()) popDots.splice(i, 1);
  }
}

let explosionPushDirX = 0;
let explosionPushDirY = 0;
let explosionPushFrames = 0;

function beginExplosionPushAura(dir) {
  const ang = HEAD_POP_DIR_ANGLE[dir];
  explosionPushDirX = Math.cos(ang);
  explosionPushDirY = Math.sin(ang);
  explosionPushFrames = EXPLOSION_PUSH_FRAMES;
}

/** Gentle drift on aura emitters only (not pop-layer particles) */
function applyExplosionPushAuraOnFlowers() {
  if (explosionPushFrames <= 0 || !flowers.length) return;
  const t = explosionPushFrames / EXPLOSION_PUSH_FRAMES;
  const amt = EXPLOSION_PUSH_PER_FRAME * (0.25 + 0.75 * t * t);
  for (const f of flowers) {
    const inst = f.instance;
    for (const puff of inst.puffs) {
      if (puff.popGen < 0) {
        puff.vx += explosionPushDirX * amt;
        puff.vy += explosionPushDirY * amt;
      }
    }
    for (const dot of inst.dots) {
      if (dot.popGen < 0) {
        dot.vx += explosionPushDirX * amt;
        dot.vy += explosionPushDirY * amt;
      }
    }
  }
  explosionPushFrames -= 1;
}

function makeFlowersFromTemplates(images, scentKey) {
  if (!images?.length) return [];
  const cfg = SCENT_CONFIG[scentKey];
  const usePool = cfg?.emitFromFullTemplatePool === true;
  const dotTemplatesAll = usePool
    ? images.map((img) => buildTemplateFromImage(img))
    : null;

  const list = [];
  let idx = 0;
  const pick = () => images[idx++ % images.length];

  for (let i = 0; i < ALIMA_COLLAR_COUNT; i++) {
    const instance = usePool
      ? new AuraEmitter(images, dotTemplatesAll)
      : (() => {
          const img = pick();
          return new AuraEmitter(img, buildTemplateFromImage(img));
        })();
    list.push({
      instance,
      type: "jaw",
      jawIndex: i,
      aura: makeAuraParams(),
    });
  }
  for (const placement of EXTRA_PLACEMENTS) {
    const instance = usePool
      ? new AuraEmitter(images, dotTemplatesAll)
      : (() => {
          const img = pick();
          return new AuraEmitter(img, buildTemplateFromImage(img));
        })();
    list.push({
      instance,
      type: "lm",
      placement,
      aura: makeAuraParams(),
    });
  }
  return list;
}

function computeRepelForce(x, y, env) {
  const dx = x - env.bodyCx;
  const dy = y - env.bodyCy;
  const dist = Math.hypot(dx, dy);
  const r = env.faceR;
  if (dist < 1e-8 || !r || dist >= r) {
    return { fx: 0, fy: 0, mag: 0, dist };
  }
  const t = 1 - dist / r;
  let f = BODY_REPEL_STRENGTH * Math.pow(t, BODY_REPEL_POWER);
  if (dist < r * BODY_REPEL_CORE_FRAC) {
    const k = 1 - dist / (r * BODY_REPEL_CORE_FRAC);
    f *= 1 + (BODY_REPEL_CORE_BOOST - 1) * k * k;
  }
  return {
    fx: (dx / dist) * f,
    fy: (dy / dist) * f,
    mag: f,
    dist,
  };
}

function applyBodyRepel(x, y, vx, vy, env) {
  const { fx, fy } = computeRepelForce(x, y, env);
  return { vx: vx + fx, vy: vy + fy };
}

/** Extra `life` drain when close to head so assets clear the face area faster */
function nearHeadLifeDrain(x, y, env) {
  const r = env.faceR;
  if (!r) return 0;
  const dist = Math.hypot(x - env.bodyCx, y - env.bodyCy);
  const cutoff = r * NEAR_HEAD_DRAIN_RADIUS_FRAC;
  if (dist >= cutoff) return 0;
  const k = 1 - dist / Math.max(cutoff, 1e-6);
  return NEAR_HEAD_DRAIN_BASE + k * k * NEAR_HEAD_DRAIN_SCALE;
}

function lmScreen(lm, p) {
  return { x: (1 - lm.x) * p.width, y: lm.y * p.height };
}

/** null = neutral; else dominant tilt cardinal */
function classifyHeadPopDir(landmarks, faceW, faceH, p) {
  if (!landmarks?.length) return null;
  const nose = lmScreen(landmarks[4], p);
  const earL = lmScreen(landmarks[234], p);
  const earR = lmScreen(landmarks[454], p);
  const earMidX = (earL.x + earR.x) * 0.5;
  const earMidY = (earL.y + earR.y) * 0.5;
  const yaw = (nose.x - earMidX) / Math.max(faceW, 1e-6);

  const eyeL = lmScreen(landmarks[33], p);
  const eyeR = lmScreen(landmarks[263], p);
  const eyeMidY = (eyeL.y + eyeR.y) * 0.5;
  const chin = lmScreen(landmarks[152], p);
  const span = Math.max(chin.y - eyeMidY, 1e-6);
  const tNose = (nose.y - eyeMidY) / span;
  const pitchSig = tNose - 0.45;

  const ax = Math.abs(yaw);
  const ay = Math.abs(pitchSig);
  if (Math.max(ax, ay) < HEAD_POP_THRESH) return null;
  if (ax >= ay) return yaw > 0 ? "right" : "left";
  return pitchSig > 0 ? "down" : "up";
}

function radialOutVelocity(px, py, bodyCx, bodyCy, faceW) {
  let dx = px - bodyCx;
  let dy = py - bodyCy;
  let len = Math.hypot(dx, dy);
  const minR = Math.max(faceW * RADIAL_MIN_DIST_FRAC, 1e-6);
  if (len < minR) {
    const ang = Math.random() * Math.PI * 2;
    dx = Math.cos(ang);
    dy = Math.sin(ang);
    len = 1;
  }
  const sp =
    PUFF_INIT_SPEED * (0.45 + Math.random() * 0.55);
  return { vx: (dx / len) * sp, vy: (dy / len) * sp };
}

// Pop generation: incremented each head pop; pop-tagged particles with lower gen fade faster.
let POP_GEN = 0;

// ── Shards after image “breaks” (template colors, same physics family) ────
class ShardParticle {
  constructor(x, y, cr, cg, cb, vx, vy, popGen = -1, dotDiameter = SHARD_DOT) {
    this.x = x;
    this.y = y;
    this.cr = cr;
    this.cg = cg;
    this.cb = cb;
    this.vx = vx;
    this.vy = vy;
    this.popGen = popGen;
    this.dotDiameter = dotDiameter;
    this.maxLife =
      SHARD_LIFE_MIN + Math.random() * (SHARD_LIFE_MAX - SHARD_LIFE_MIN);
    this.life = this.maxLife;
    this.baseA = 0.72 + Math.random() * 0.26;
  }

  step(env) {
    let dx = this.x - env.bodyCx;
    let dy = this.y - env.bodyCy;
    let len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      const ang = Math.random() * Math.PI * 2;
      dx = Math.cos(ang);
      dy = Math.sin(ang);
      len = 1;
    }
    this.vx += (dx / len) * DOT_RADIAL_FORCE * 1.3;
    this.vy += (dy / len) * DOT_RADIAL_FORCE * 1.3;
    const rep = applyBodyRepel(this.x, this.y, this.vx, this.vy, env);
    this.vx = rep.vx;
    this.vy = rep.vy;
    this.vx += (Math.random() * 2 - 1) * 0.12;
    this.vy += (Math.random() * 2 - 1) * 0.12;
    this.vx *= 0.988;
    this.vy *= 0.988;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 1;
    if (this.popGen >= 0 && this.popGen < POP_GEN) {
      this.life -= LEGACY_POP_LIFE_DRAIN;
    }
    this.life -= nearHeadLifeDrain(this.x, this.y, env);
  }

  dead() {
    return this.life <= 0;
  }

  alpha() {
    const t = Math.max(0, this.life) / this.maxLife;
    const fadeOut = smoothstep(0, 0.22, t);
    return Math.min(1, this.baseA * fadeOut);
  }

  draw(p) {
    const a = this.alpha();
    if (a < 0.02) return;
    p.noStroke();
    p.fill(this.cr, this.cg, this.cb, a * 255);
    p.circle(this.x, this.y, this.dotDiameter);
  }
}

// ── Free-floating image puff (spawned at anchor, radiates from body) ─
class AirPuff {
  constructor(x, y, img, faceW, faceCx, faceCy, dotTemplate, burstOpts = null, auraAssetScale = 1) {
    this.x = x;
    this.y = y;
    this.img = img;
    this.dotTemplate = dotTemplate;
    this.shattered = false;
    this.shards = [];
    this.popGen = -1;
    this.shattersOnRepel = Math.random() < SHATTER_ON_REPEL_CHANCE;

    const burstMul = burstOpts
      ? burstOpts.visualScale ?? HEAD_POP_VISUAL_SCALE
      : 1;
    const auraMul =
      typeof auraAssetScale === "number" ? auraAssetScale : 1;
    const combined = burstMul * auraMul;
    this.burstVisualScale = combined;

    const s0 =
      faceW *
      (PUFF_SCALE_MIN_FRAC +
        Math.random() * (PUFF_SCALE_MAX_FRAC - PUFF_SCALE_MIN_FRAC)) *
      combined;
    this.w = s0;
    this.h = (this.w * img.height) / img.width;

    if (burstOpts) {
      this.popGen = burstOpts.popGen;
      const base = burstOpts.baseAngle;
      const spread = burstOpts.angleSpread ?? HEAD_POP_ANGLE_SPREAD;
      const ang = base + (Math.random() * 2 - 1) * spread;
      const sp =
        PUFF_INIT_SPEED *
        (burstOpts.speedMul ?? HEAD_POP_SPEED_MUL) *
        (0.62 + Math.random() * 0.58);
      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp;
    } else {
      const { vx, vy } = radialOutVelocity(x, y, faceCx, faceCy, faceW);
      this.vx = vx;
      this.vy = vy;
    }
    this.rot = Math.random() * Math.PI * 2;
    this.vr = (Math.random() * 2 - 1) * 0.008;

    this.maxLife = PUFF_LIFE_MIN + Math.random() * (PUFF_LIFE_MAX - PUFF_LIFE_MIN);
    this.life = this.maxLife;

    this.baseAlpha =
      PUFF_ALPHA_BASE_MIN +
      Math.random() * (PUFF_ALPHA_BASE_MAX - PUFF_ALPHA_BASE_MIN);
  }

  shatter(env) {
    if (this.shattered || !this.dotTemplate?.length) return;
    this.shattered = true;
    const tpl = this.dotTemplate;
    const n = Math.min(SHATTER_SHARD_COUNT, Math.max(tpl.length, 8));
    for (let i = 0; i < n; i++) {
      const pt = tpl[(Math.random() * tpl.length) | 0];
      const ox = (Math.random() - 0.5) * this.w * 0.55;
      const oy = (Math.random() - 0.5) * this.h * 0.55;
      const px = this.x + ox;
      const py = this.y + oy;
      const { vx, vy } = radialOutVelocity(
        px,
        py,
        env.bodyCx,
        env.bodyCy,
        env.faceW,
      );
      const rf = computeRepelForce(px, py, env);
      const shardD = SHARD_DOT * this.burstVisualScale;
      this.shards.push(
        new ShardParticle(
          px,
          py,
          pt.r,
          pt.g,
          pt.b,
          (vx + rf.fx * 0.65) * SHARD_SPEED_MUL,
          (vy + rf.fy * 0.65) * SHARD_SPEED_MUL,
          this.popGen,
          shardD,
        ),
      );
    }
  }

  step(env) {
    if (this.shattered) {
      for (let i = this.shards.length - 1; i >= 0; i--) {
        this.shards[i].step(env);
        if (this.shards[i].dead()) this.shards.splice(i, 1);
      }
      return;
    }

    let dx = this.x - env.bodyCx;
    let dy = this.y - env.bodyCy;
    let len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      const ang = Math.random() * Math.PI * 2;
      dx = Math.cos(ang);
      dy = Math.sin(ang);
      len = 1;
    }
    this.vx += (dx / len) * RADIAL_FORCE;
    this.vy += (dy / len) * RADIAL_FORCE;
    const rep = applyBodyRepel(this.x, this.y, this.vx, this.vy, env);
    this.vx = rep.vx;
    this.vy = rep.vy;
    this.vx += (Math.random() * 2 - 1) * PUFF_TURBULENCE * 0.025;
    this.vy += (Math.random() * 2 - 1) * PUFF_TURBULENCE * 0.025;
    this.vx *= PUFF_DRAG;
    this.vy *= PUFF_DRAG;
    this.x += this.vx;
    this.y += this.vy;
    this.rot += this.vr;
    this.vr *= PUFF_ROT_DAMP;
    this.life -= 1;
    if (this.popGen >= 0 && this.popGen < POP_GEN) {
      this.life -= LEGACY_POP_LIFE_DRAIN;
    }
    this.life -= nearHeadLifeDrain(this.x, this.y, env);

    const rf = computeRepelForce(this.x, this.y, env);
    const age = this.ageFrac();
    const pastFade = age >= PUFF_FADE_IN_FRAC * 1.02;
    const tooClose = rf.dist < env.faceR * SHATTER_DIST_FRAC;
    const hardPush = rf.mag > SHATTER_REPEL_MAG;
    if (
      pastFade &&
      this.dotTemplate?.length &&
      this.shattersOnRepel &&
      (tooClose || hardPush)
    ) {
      this.shatter(env);
    }
  }

  ageFrac() {
    return 1 - Math.max(0, this.life) / this.maxLife;
  }

  alpha() {
    const t = Math.max(0, this.life) / this.maxLife;
    const age = this.ageFrac();
    const birth = smoothstep(0, PUFF_FADE_IN_FRAC, age);
    const fadeOut = smoothstep(0, PUFF_FADE_OUT_FRAC, t);
    const solid = smoothstep(PUFF_FADE_IN_FRAC, PUFF_FADE_IN_FRAC + 0.06, age);
    const boost = 1 + (PUFF_SOLID_BOOST - 1) * solid;
    return Math.min(1, this.baseAlpha * birth * fadeOut * boost);
  }

  dead() {
    if (this.shattered) return this.shards.length === 0;
    return this.life <= 0;
  }

  drawImage(p) {
    if (this.shattered) return;
    const a = this.alpha();
    if (a < 0.006) return;
    p.push();
    p.imageMode(p.CENTER);
    p.tint(255, Math.min(255, a * 255));
    p.translate(this.x, this.y);
    p.rotate(this.rot);
    p.image(this.img, 0, 0, this.w, this.h);
    p.pop();
    p.noTint();
  }

  drawShards(p) {
    for (const s of this.shards) s.draw(p);
  }
}

// ── Free dot (optional halo, radiates from body) ──────────────
class FloatDot {
  constructor(
    x,
    y,
    r,
    g,
    b,
    faceW,
    faceCx,
    faceCy,
    burstOpts = null,
    auraAssetScale = 1,
  ) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.g = g;
    this.b = b;
    this.popGen = -1;
    const auraMul =
      typeof auraAssetScale === "number" ? auraAssetScale : 1;
    this.drawSize = DOT_SIZE * auraMul;
    if (burstOpts) {
      this.popGen = burstOpts.popGen;
      const vScale = burstOpts.visualScale ?? HEAD_POP_VISUAL_SCALE;
      this.drawSize = DOT_SIZE * vScale * auraMul;
      const base = burstOpts.baseAngle;
      const spread = burstOpts.angleSpread ?? HEAD_POP_ANGLE_SPREAD * 1.1;
      const ang = base + (Math.random() * 2 - 1) * spread;
      const sp =
        PUFF_INIT_SPEED *
        (burstOpts.speedMul ?? HEAD_POP_SPEED_MUL * 1.15) *
        (0.55 + Math.random() * 0.65);
      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp;
    } else {
      const { vx, vy } = radialOutVelocity(x, y, faceCx, faceCy, faceW);
      this.vx = vx * 1.1;
      this.vy = vy * 1.1;
    }
    this.maxLife =
      (PUFF_LIFE_MIN + Math.random() * (PUFF_LIFE_MAX - PUFF_LIFE_MIN)) *
      DOT_LIFE_MULT;
    this.life = this.maxLife;
    this.baseA = 0.52 + Math.random() * 0.4;
  }

  step(env) {
    let dx = this.x - env.bodyCx;
    let dy = this.y - env.bodyCy;
    let len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      const ang = Math.random() * Math.PI * 2;
      dx = Math.cos(ang);
      dy = Math.sin(ang);
      len = 1;
    }
    this.vx += (dx / len) * DOT_RADIAL_FORCE;
    this.vy += (dy / len) * DOT_RADIAL_FORCE;
    const rep = applyBodyRepel(this.x, this.y, this.vx, this.vy, env);
    this.vx = rep.vx;
    this.vy = rep.vy;
    this.vx += (Math.random() * 2 - 1) * PUFF_TURBULENCE * 0.02;
    this.vy += (Math.random() * 2 - 1) * PUFF_TURBULENCE * 0.02;
    this.vx *= DOT_DRAG;
    this.vy *= DOT_DRAG;
    this.x += this.vx;
    this.y += this.vy;
    this.life -= 1;
    if (this.popGen >= 0 && this.popGen < POP_GEN) {
      this.life -= LEGACY_POP_LIFE_DRAIN;
    }
    this.life -= nearHeadLifeDrain(this.x, this.y, env);
  }

  dead() {
    return this.life <= 0;
  }

  ageFrac() {
    return 1 - Math.max(0, this.life) / this.maxLife;
  }

  alpha() {
    const t = Math.max(0, this.life) / this.maxLife;
    const age = this.ageFrac();
    const birth = smoothstep(0, DOT_FADE_IN_FRAC, age);
    const fadeOut = smoothstep(0, DOT_FADE_OUT_FRAC, t);
    const solid = smoothstep(DOT_FADE_IN_FRAC, DOT_FADE_IN_FRAC + 0.06, age);
    const boost = 1 + (DOT_SOLID_BOOST - 1) * solid;
    return Math.min(1, this.baseA * birth * fadeOut * boost);
  }

  draw(p) {
    const a = this.alpha();
    if (a < 0.01) return;
    p.noStroke();
    p.fill(this.r, this.g, this.b, a * 255);
    p.circle(this.x, this.y, this.drawSize);
  }
}

// ── Aura emitter: spawns puffs + sparse dots at anchors ─────
class AuraEmitter {
  /**
   * Single image + template, OR parallel arrays — each spawn randomly picks index (same index for puff + dots).
   */
  constructor(imgOrImages, dotTplOrTplList) {
    if (Array.isArray(imgOrImages)) {
      this.variantImages = imgOrImages;
      this.variantDotTemplates = dotTplOrTplList;
    } else {
      this.variantImages = [imgOrImages];
      this.variantDotTemplates = [dotTplOrTplList];
    }
    this.puffs = [];
    this.dots = [];
    this.yStagger = (Math.random() - 0.5) * 14;
    this.spawnAcc = Math.random() * SPAWN_INTERVAL_BASE;
    this.ax = 0;
    this.ay = 0;
    this.lastFaceW = 400;
    this.ready = false;
  }

  /** Random motif for this emitter’s next puff / burst; keeps img and shard colors aligned */
  pickSpawnVariant() {
    const n = this.variantImages.length;
    const i = n <= 1 ? 0 : (Math.random() * n) | 0;
    return {
      img: this.variantImages[i],
      dotTemplate: this.variantDotTemplates[i],
    };
  }

  setAnchor(x, y, faceW) {
    this.ax = x;
    this.ay = y + this.yStagger;
    this.lastFaceW = faceW;
    this.ready = true;
  }

  spawnAtAnchor(env) {
    const fw = this.lastFaceW;
    const spread = fw * 0.055;
    const px = this.ax + (Math.random() * 2 - 1) * spread;
    const py = this.ay + (Math.random() * 2 - 1) * spread;
    const { img, dotTemplate: tpl } = this.pickSpawnVariant();
    const auraMul = env.auraAssetScale ?? 1;
    this.puffs.push(
      new AirPuff(
        px,
        py,
        img,
        fw,
        env.bodyCx,
        env.bodyCy,
        tpl,
        null,
        auraMul,
      ),
    );

    if (tpl.length && Math.random() < DOT_EMIT_CHANCE) {
      const pt = tpl[(Math.random() * tpl.length) | 0];
      const dpx = px + (Math.random() * 2 - 1) * spread * 0.5;
      const dpy = py + (Math.random() * 2 - 1) * spread * 0.5;
      this.dots.push(
        new FloatDot(
          dpx,
          dpy,
          pt.r,
          pt.g,
          pt.b,
          fw,
          env.bodyCx,
          env.bodyCy,
          null,
          auraMul,
        ),
      );
    }
  }

  update(_frameCount, env) {
    if (!this.ready) return;

    if (env.facePresent) {
      this.spawnAcc += 1;
      while (this.spawnAcc >= SPAWN_INTERVAL_BASE) {
        this.spawnAcc -= SPAWN_INTERVAL_BASE;
        this.spawnAtAnchor(env);
      }
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      puff.step(env);
      if (puff.dead()) this.puffs.splice(i, 1);
    }
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.step(env);
      if (d.dead()) this.dots.splice(i, 1);
    }

    while (this.puffs.length > MAX_PUFFS_PER_EMITTER) this.puffs.shift();
    while (this.dots.length > MAX_PUFFS_PER_EMITTER) this.dots.shift();
  }

  drawPuffsScreen(p) {
    if (!this.ready) return;
    for (const puff of this.puffs) puff.drawImage(p);
  }

  drawShards(p) {
    if (!this.ready) return;
    for (const puff of this.puffs) puff.drawShards(p);
  }

  drawDots(p) {
    if (!this.ready) return;
    for (const d of this.dots) d.draw(p);
  }
}

// ── State ─────────────────────────────────────────────────────
let faceLandmarker;
let webcam;
let faceResults;
let lastVideoTime = -1;
let flowers = [];
let prevHeadPopDir = null;
let popPuffs = [];
let popDots = [];

let lastBodyCx = 0;
let lastBodyCy = 0;
let lastFaceW = 220;
let lastFaceH = 280;

const loadedImagesByScent = {};
let activeScentKey = null;

const ORACLE_LOADING_MS = 900;
const ORACLE_REVEAL_MS = 3000;
const ORACLE_FADE_MS = 600;

/** @type {"waiting" | "loading" | "revealing" | "done"} */
let oraclePhase = "waiting";
let oracleRevealStartMs = 0;
let pendingOracleScentKey = null;

function pickRandomScentKey() {
  const i = (Math.random() * SCENT_ORDER.length) | 0;
  return SCENT_ORDER[i];
}

function clearScentRadios() {
  const nodes = document.querySelectorAll('input[name="scent"]');
  nodes.forEach((el) => {
    if (!(el instanceof HTMLInputElement)) return;
    el.checked = false;
    el.setAttribute("aria-checked", "false");
  });
}

function setOracleUiVisibility(phase) {
  const oracle = document.getElementById("scent-oracle");
  const picker = document.getElementById("perfume-ui");
  const reloadBtn = document.getElementById("oracle-reload");
  if (!oracle) return;

  oracle.hidden = phase === "done";
  oracle.classList.remove(
    "scent-oracle--hidden",
    "scent-oracle--visible",
    "scent-oracle--fading",
    "scent-oracle--waiting",
    "scent-oracle--loading",
    "scent-oracle--revealing",
  );

  if (phase === "waiting") {
    oracle.classList.add("scent-oracle--visible", "scent-oracle--waiting");
  } else if (phase === "loading") {
    oracle.classList.add("scent-oracle--visible", "scent-oracle--loading");
  } else if (phase === "revealing") {
    oracle.classList.add("scent-oracle--visible", "scent-oracle--revealing");
  } else {
    oracle.classList.add("scent-oracle--hidden");
  }

  picker?.classList.toggle("perfume-ui--hidden", phase !== "done");
  reloadBtn?.classList.toggle("oracle-reload--hidden", phase !== "done");
}

function startOracleLoading(scentKey) {
  pendingOracleScentKey = scentKey;
  oraclePhase = "loading";
  oracleRevealStartMs = performance.now();
  document.getElementById("scent-oracle")?.classList.remove("scent-oracle--fading");
  setOracleUiVisibility("loading");
}

function updateOracleLoading(nowMs) {
  if (oraclePhase !== "loading" || !pendingOracleScentKey) return;

  const elapsed = nowMs - oracleRevealStartMs;
  if (elapsed >= ORACLE_LOADING_MS) {
    const key = pendingOracleScentKey;
    pendingOracleScentKey = null;
    beginOracleReveal(key);
  }
}

function beginOracleReveal(scentKey) {
  applyScent(scentKey);
  oraclePhase = "revealing";
  oracleRevealStartMs = performance.now();

  const cfg = SCENT_CONFIG[scentKey];
  const nameEl = document.querySelector(".scent-oracle__name");
  const taglineEl = document.querySelector(".scent-oracle__tagline");
  if (nameEl) nameEl.textContent = cfg?.displayName ?? scentKey;
  if (taglineEl) taglineEl.textContent = cfg?.tagline ?? "";

  document.getElementById("scent-oracle")?.classList.remove("scent-oracle--fading");
  setOracleUiVisibility("revealing");
}

function updateOracleReveal(nowMs) {
  if (oraclePhase !== "revealing") return;

  const elapsed = nowMs - oracleRevealStartMs;
  const oracle = document.getElementById("scent-oracle");

  if (elapsed >= ORACLE_REVEAL_MS && oracle && !oracle.classList.contains("scent-oracle--fading")) {
    oracle.classList.add("scent-oracle--fading");
  }

  if (elapsed >= ORACLE_REVEAL_MS + ORACLE_FADE_MS) {
    oraclePhase = "done";
    setOracleUiVisibility("done");
  }
}

function resetOracleSession(hasFace) {
  flowers = [];
  activeScentKey = null;
  popPuffs = [];
  popDots = [];
  prevHeadPopDir = null;
  explosionPushDirX = 0;
  explosionPushDirY = 0;
  explosionPushFrames = 0;
  pendingOracleScentKey = null;
  clearScentRadios();

  document.getElementById("scent-oracle")?.classList.remove("scent-oracle--fading");

  if (hasFace) {
    startOracleLoading(pickRandomScentKey());
  } else {
    oraclePhase = "waiting";
    setOracleUiVisibility("waiting");
  }
}

function syncScentRadios(scentKey) {
  const nodes = document.querySelectorAll('input[name="scent"]');
  nodes.forEach((el) => {
    if (!(el instanceof HTMLInputElement)) return;
    const on = el.value === scentKey;
    el.checked = on;
    el.setAttribute("aria-checked", on ? "true" : "false");
  });
}

function applyScent(scentKey) {
  if (!SCENT_CONFIG[scentKey]) return;
  const imgs = loadedImagesByScent[scentKey];
  if (!imgs?.length || !imgs[0]?.width) return;
  activeScentKey = scentKey;
  flowers = makeFlowersFromTemplates(imgs, scentKey);
  syncScentRadios(scentKey);
  console.log(
    `[${SCENT_CONFIG[scentKey].displayName}] ${flowers.length} emitters · floating image puffs + sparse dots`,
  );
}

const sketch = (p) => {
  p.preload = () => {
    for (const key of SCENT_ORDER) {
      loadedImagesByScent[key] = SCENT_CONFIG[key].templatePaths.map((path) =>
        p.loadImage(path),
      );
    }
  };

  p.setup = async () => {
    p.createCanvas(p.windowWidth, p.windowHeight);
    lastBodyCx = p.width / 2;
    lastBodyCy = p.height / 2;
    lastFaceW = p.width * 0.32;
    lastFaceH = p.height * 0.42;

    webcam = p.createCapture(p.VIDEO);
    webcam.size(640, 480);
    webcam.hide();

    setOracleUiVisibility("waiting");

    const picker = document.getElementById("scent-picker");
    picker?.addEventListener("change", (e) => {
      if (oraclePhase !== "done") return;
      const t = e.target;
      if (t instanceof HTMLInputElement && t.name === "scent" && t.checked) {
        applyScent(t.value);
      }
    });

    document.getElementById("oracle-reload")?.addEventListener("click", () => {
      if (oraclePhase === "loading" || oraclePhase === "revealing") return;
      const hasFace = !!faceResults?.faceLandmarks?.length;
      resetOracleSession(hasFace);
    });

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

    p.push();
    p.translate(p.width, 0);
    p.scale(-1, 1);
    p.image(webcam, 0, 0, p.width, p.height);
    p.pop();

    if (!faceLandmarker || webcam.elt.readyState < 2) return;

    const now = performance.now();
    if (webcam.elt.currentTime !== lastVideoTime) {
      lastVideoTime = webcam.elt.currentTime;
      if (p.frameCount % FACE_DETECT_EVERY_FRAMES === 0) {
        faceResults = faceLandmarker.detectForVideo(webcam.elt, now);
      }
    }

    updateOracleLoading(now);
    updateOracleReveal(now);

    if (faceResults?.faceLandmarks?.length) {
      if (oraclePhase === "waiting") {
        startOracleLoading(pickRandomScentKey());
      }

      const landmarks = faceResults.faceLandmarks[0];

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

      lastBodyCx = faceCx;
      lastBodyCy = faceCy;
      lastFaceW = faceW;
      lastFaceH = faceH;

      const jawPoints = JAW_INDICES.map((idx) => ({
        x: (1 - landmarks[idx].x) * p.width,
        y: landmarks[idx].y * p.height,
      })).sort((a, b) => a.x - b.x);

      const jawSlots = flowers.filter((x) => x.type === "jaw").length;

      for (const f of flowers) {
        let baseAx;
        let baseAy;
        if (f.type === "jaw") {
          const t = jawSlots > 1 ? f.jawIndex / (jawSlots - 1) : 0;
          const ji = Math.round(t * (jawPoints.length - 1));
          const jp = jawPoints[ji];
          baseAx = jp.x;
          baseAy = jp.y + faceH * COLLAR_DROP;
        } else {
          const { lm, dx, dy } = f.placement;
          baseAx = (1 - landmarks[lm].x) * p.width + dx * faceW;
          baseAy = landmarks[lm].y * p.height + dy * faceH;
        }
        const { x, y } = computeAuraAnchor(
          baseAx,
          baseAy,
          faceW,
          faceH,
          faceCx,
          f.aura,
          p.frameCount,
        );
        f.instance.setAnchor(x, y, faceW);
      }

      const env = {
        bodyCx: faceCx,
        bodyCy: faceCy,
        faceW,
        faceH,
        faceR: Math.max(faceW, faceH) * BODY_REPEL_RADIUS_FRAC,
        facePresent: true,
        auraAssetScale: SCENT_CONFIG[activeScentKey]?.auraAssetScale ?? 1,
      };

      const headDir = classifyHeadPopDir(landmarks, faceW, faceH, p);
      if (headDir != null && headDir !== prevHeadPopDir) {
        POP_GEN += 1;
        beginExplosionPushAura(headDir);
        spawnHeadPop(headDir, env, p);
      }
      prevHeadPopDir = headDir;

      applyExplosionPushAuraOnFlowers();
      for (const f of flowers) {
        f.instance.update(p.frameCount, env);
      }
      updatePopLayer(env);
      p.blendMode(p.SCREEN);
      for (const f of flowers) {
        f.instance.drawPuffsScreen(p);
      }
      for (const puff of popPuffs) puff.drawImage(p);
      p.blendMode(p.BLEND);
      for (const f of flowers) {
        f.instance.drawShards(p);
      }
      for (const puff of popPuffs) puff.drawShards(p);
      for (const f of flowers) {
        f.instance.drawDots(p);
      }
      for (const d of popDots) d.draw(p);
      return;
    }

    prevHeadPopDir = null;

    const env = {
      bodyCx: lastBodyCx,
      bodyCy: lastBodyCy,
      faceW: lastFaceW,
      faceH: lastFaceH,
      faceR: Math.max(lastFaceW, lastFaceH) * BODY_REPEL_RADIUS_FRAC,
      facePresent: false,
      auraAssetScale: SCENT_CONFIG[activeScentKey]?.auraAssetScale ?? 1,
    };
    applyExplosionPushAuraOnFlowers();
    for (const f of flowers) {
      f.instance.update(p.frameCount, env);
    }
    updatePopLayer(env);
    p.blendMode(p.SCREEN);
    for (const f of flowers) {
      f.instance.drawPuffsScreen(p);
    }
    for (const puff of popPuffs) puff.drawImage(p);
    p.blendMode(p.BLEND);
    for (const f of flowers) {
      f.instance.drawShards(p);
    }
    for (const puff of popPuffs) puff.drawShards(p);
    for (const f of flowers) {
      f.instance.drawDots(p);
    }
    for (const d of popDots) d.draw(p);
  };

  p.windowResized = () => {
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
};

new p5(sketch);

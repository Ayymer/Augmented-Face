// Augmented Face — Alima aura: free-floating asset puffs spawned at anchors (perfume / air)

import {
  FaceLandmarker,
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/vision_bundle.mjs";

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
    tagline: "Autumn leaf — Maison Margiela",
    emitFromFullTemplatePool: true,
    auraAssetScale: 1,
    templatePaths: ["Assets/aymeric/aymeric-leaf-autumn.png"],
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

const OUT_OF_FRAME_DRAIN = 18;

// ── Per-scent aura profile (rolled on each applyScent) ─────────
const SCREEN_EDGE_MARGIN_FRAC = 0.06;
const SCREEN_EDGE_DRAIN_SCALE = 3.5;
const SCREEN_EDGE_STYLES = ["none", "softBounce", "hardBounce", "drain"];
const FACE_COLLISION_STYLES = ["soft", "firm", "shatter"];

let sessionAuraProfile = null;

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

// Aura two-phase motion: radial from face, then per-particle random drift (~1–3s)
const FLOAT_DELAY_MIN_FRAMES = 60;
const FLOAT_DELAY_MAX_FRAMES = 180;
const FLOAT_DRIFT_SPEED_MIN = 0.28;
const FLOAT_DRIFT_SPEED_MAX = 0.62;
const FLOAT_DRIFT_RADIAL_SCALE = 0.12;
const FLOAT_DRIFT_VEL_LERP = 0.04;

// Soft repulsion between aura particles (reduces clumping, not explosive)
const PEER_REPEL_RADIUS_FRAC = 0.14;
const PEER_REPEL_STRENGTH = 0.016;
const PEER_REPEL_MIN_DIST = 6;
const PEER_REPEL_MAX_NEIGHBORS = 10;
const PEER_REPEL_FORCE_CAP = 0.055;

// Face model: run every N p5 frames (2 ≈ halves MediaPipe CPU; 1 = every frame)
const FACE_DETECT_EVERY_FRAMES = 2;
const FACE_LERP = 0.72;
/** Subset of landmark indices for bbox (forehead, chin, ears, jaw corners) */
const FACE_BBOX_INDICES = [10, 151, 152, 21, 251, 172, 397, 234, 454];

// Extra life loss per frame when inside this radius of face center (clears halo near head)
const NEAR_HEAD_DRAIN_RADIUS_FRAC = 1.08;
const NEAR_HEAD_DRAIN_BASE = 1.05;
const NEAR_HEAD_DRAIN_SCALE = 4.2;

// ── Hand close-release burst + hand repel (fist open triggers burst) ───────
const HAND_BURST_PUFF_COUNT = 15;
const HAND_BURST_DOT_COUNT = 26;
const HAND_BURST_SPEED_MUL = 2.85;
const HAND_BURST_ANGLE_SPREAD = 0.48;
const HAND_BURST_SPAWN_JITTER_FRAC = 0.12;
const HAND_BURST_VISUAL_SCALE = 1.5;
const HAND_BURST_COOLDOWN_FRAMES = 24;
const HAND_SCALE_MIN_PX = 40;
const HAND_LM_WRIST = 0;
const HAND_LM_MIDDLE_MCP = 9;
const HAND_FINGER_TIPS = [4, 8, 12, 16, 20];
/** Avg fingertip→palm distance ÷ hand scale; lower = closed fist */
const HAND_CLOSE_SPREAD = 0.88;
const HAND_OPEN_SPREAD = 1.02;
/** Hand repel zone (larger than palm — clears whole cloud in one pass) */
const HAND_REPEL_RADIUS_FRAC = 1.42;
/** Hand repel uses raw landmarks each frame (face uses FACE_LERP smoothing) */
const HAND_REPEL_STRENGTH_MUL = 3.4;
const HAND_REPEL_POWER = 1.48;
const HAND_REPEL_CORE_BOOST = 7.5;
const HAND_REPEL_CORE_FRAC = 0.62;
const HAND_NEAR_DRAIN_MUL = 1.55;

// Hand movement disperses perfume (continuous wind while swiping)
const HAND_WIND_MIN_SPEED = 1.5;
const HAND_WIND_MAX_SPEED = 28;
const HAND_WIND_GUST_SPEED = 12;
const HAND_WIND_RADIUS_MUL = 1.6;
const HAND_WIND_STRENGTH = 0.19;
const HAND_WIND_FORCE_CAP = 0.26;
const HAND_WIND_MOVE_EPS = 0.35;
/** Keep swipe velocity between MediaPipe ticks (detect every 2 frames) */
const HAND_WIND_VEL_DECAY = 0.9;
const HAND_WIND_SPREAD_MIN = 0.5;
const HAND_WIND_SPREAD_MAX = 1.2;
const HAND_WIND_GUST_TURB_MUL = 1.45;
const HAND_WIND_GUST_BOOST = 1.45;
/** Extra life drain in wind zone while swiping (clears scent faster) */
const HAND_WIND_CLEAN_DRAIN = 2.8;

const LEGACY_POP_LIFE_DRAIN = 5.2;
const MAX_POP_PUFFS = 72;
const MAX_POP_DOTS = 110;
/** After a hand burst: nudge aura puffs/dots along burst dir for this many frames */
const EXPLOSION_PUSH_FRAMES = 56;
const EXPLOSION_PUSH_PER_FRAME = 0.058;

const JAW_INDICES = [
  172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397,
];
const jawScratchX = new Float32Array(JAW_INDICES.length);
const jawScratchY = new Float32Array(JAW_INDICES.length);
const jawScratchOrder = JAW_INDICES.map((_, i) => i);

const templateCache = new Map();

const auraEnv = {
  bodyCx: 0,
  bodyCy: 0,
  faceW: 220,
  faceH: 280,
  faceR: 242,
  facePresent: false,
  canvasW: 0,
  canvasH: 0,
  auraAssetScale: 1,
  scentEnabled: false,
  scentIntensity: 0,
  profileSeed: null,
  assetScaleMul: 1,
  initSpeedMul: 1,
  radialForceMul: 1,
  drag: PUFF_DRAG,
  turbulence: PUFF_TURBULENCE,
  alphaMin: PUFF_ALPHA_BASE_MIN,
  alphaMax: PUFF_ALPHA_BASE_MAX,
  solidBoost: PUFF_SOLID_BOOST,
  lifeMul: 1,
  fadeInFrac: PUFF_FADE_IN_FRAC,
  fadeOutFrac: PUFF_FADE_OUT_FRAC,
  dotFadeInFrac: DOT_FADE_IN_FRAC,
  dotFadeOutFrac: DOT_FADE_OUT_FRAC,
  dotSolidBoost: DOT_SOLID_BOOST,
  spawnIntervalMul: 1,
  dotEmitMul: 1,
  screenEdge: "none",
  faceCollision: "soft",
  repelMul: 1,
  headDrainMul: 1,
  shatterChance: SHATTER_ON_REPEL_CHANCE,
  handPresent: false,
  handCx: 0,
  handCy: 0,
  handR: 0,
  handRepelMul: 1,
  handVelX: 0,
  handVelY: 0,
  handSpeed: 0,
  handSpreadFactor: 1,
  handWindEnabled: false,
  handGustTurbMul: 1,
  handWindBoost: 1,
};

let smoothFaceCx = 0;
let smoothFaceCy = 0;
let smoothFaceW = 220;
let smoothFaceH = 280;
let smoothFaceReady = false;
let prevHandCenterX = 0;
let prevHandCenterY = 0;
let handWindVelX = 0;
let handWindVelY = 0;
let lastHandVelFrame = -1;
let handVelReady = false;
let p5Instance = null;
let debugOverlay = false;
const scentLoadPromises = {};

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

function pickOne(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function rollAuraProfile(scentKey) {
  const faceCollision = pickOne(FACE_COLLISION_STYLES);
  return {
    seed: (Math.random() * 1e9) | 0,
    scentKey,
    assetScaleMul: randRange(0.88, 1.22),
    initSpeedMul: randRange(0.82, 1.28),
    radialForceMul: randRange(0.85, 1.25),
    drag: randRange(0.982, 0.993),
    turbulence: randRange(0.028, 0.055),
    alphaMin: randRange(0.52, 0.72),
    alphaMax: randRange(0.78, 0.95),
    solidBoost: randRange(1.05, 1.18),
    lifeMul: randRange(0.75, 1.35),
    fadeInFrac: randRange(0.08, 0.14),
    fadeOutFrac: randRange(0.12, 0.22),
    dotFadeInFrac: randRange(0.08, 0.13),
    dotFadeOutFrac: randRange(0.11, 0.18),
    dotSolidBoost: randRange(1.04, 1.16),
    spawnIntervalMul: randRange(0.72, 1.38),
    dotEmitMul: randRange(0.65, 1.45),
    screenEdge: pickOne(SCREEN_EDGE_STYLES),
    faceCollision,
    repelMul:
      faceCollision === "firm"
        ? randRange(1.2, 1.5)
        : faceCollision === "shatter"
          ? randRange(1.05, 1.25)
          : 1,
    headDrainMul:
      faceCollision === "firm"
        ? randRange(1.45, 1.85)
        : faceCollision === "shatter"
          ? randRange(1.1, 1.35)
          : randRange(0.25, 0.55),
    shatterChance:
      faceCollision === "shatter"
        ? randRange(0.55, 0.85)
        : faceCollision === "firm"
          ? randRange(0.15, 0.35)
          : 0,
  };
}

function applyProfileToAuraEnv(env, profile) {
  if (!profile) {
    env.profileSeed = null;
    env.assetScaleMul = 1;
    env.initSpeedMul = 1;
    env.radialForceMul = 1;
    env.drag = PUFF_DRAG;
    env.turbulence = PUFF_TURBULENCE;
    env.alphaMin = PUFF_ALPHA_BASE_MIN;
    env.alphaMax = PUFF_ALPHA_BASE_MAX;
    env.solidBoost = PUFF_SOLID_BOOST;
    env.lifeMul = 1;
    env.fadeInFrac = PUFF_FADE_IN_FRAC;
    env.fadeOutFrac = PUFF_FADE_OUT_FRAC;
    env.dotFadeInFrac = DOT_FADE_IN_FRAC;
    env.dotFadeOutFrac = DOT_FADE_OUT_FRAC;
    env.dotSolidBoost = DOT_SOLID_BOOST;
    env.spawnIntervalMul = 1;
    env.dotEmitMul = 1;
    env.screenEdge = "none";
    env.faceCollision = "soft";
    env.repelMul = 1;
    env.headDrainMul = 1;
    env.shatterChance = SHATTER_ON_REPEL_CHANCE;
    return;
  }
  env.profileSeed = profile.seed;
  env.assetScaleMul = profile.assetScaleMul;
  env.initSpeedMul = profile.initSpeedMul;
  env.radialForceMul = profile.radialForceMul;
  env.drag = profile.drag;
  env.turbulence = profile.turbulence;
  env.alphaMin = profile.alphaMin;
  env.alphaMax = profile.alphaMax;
  env.solidBoost = profile.solidBoost;
  env.lifeMul = profile.lifeMul;
  env.fadeInFrac = profile.fadeInFrac;
  env.fadeOutFrac = profile.fadeOutFrac;
  env.dotFadeInFrac = profile.dotFadeInFrac;
  env.dotFadeOutFrac = profile.dotFadeOutFrac;
  env.dotSolidBoost = profile.dotSolidBoost;
  env.spawnIntervalMul = profile.spawnIntervalMul;
  env.dotEmitMul = profile.dotEmitMul;
  env.screenEdge = profile.screenEdge;
  env.faceCollision = profile.faceCollision;
  env.repelMul = profile.repelMul;
  env.headDrainMul = profile.headDrainMul;
  env.shatterChance = profile.shatterChance;
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

function getTemplateFromImage(img) {
  let tpl = templateCache.get(img);
  if (!tpl) {
    tpl = buildTemplateFromImage(img);
    templateCache.set(img, tpl);
  }
  return tpl;
}

function computeFaceBBox(landmarks, width, height) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let cx = 0;
  let cy = 0;
  for (const idx of FACE_BBOX_INDICES) {
    const lm = landmarks[idx];
    const sx = (1 - lm.x) * width;
    const sy = lm.y * height;
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
    cx += sx;
    cy += sy;
  }
  const n = FACE_BBOX_INDICES.length;
  return {
    faceCx: cx / n,
    faceCy: cy / n,
    faceW: maxX - minX,
    faceH: maxY - minY,
  };
}

function updateSmoothedFaceMetrics(raw) {
  if (!smoothFaceReady) {
    smoothFaceCx = raw.faceCx;
    smoothFaceCy = raw.faceCy;
    smoothFaceW = raw.faceW;
    smoothFaceH = raw.faceH;
    smoothFaceReady = true;
    return raw;
  }
  const t = FACE_LERP;
  smoothFaceCx += (raw.faceCx - smoothFaceCx) * t;
  smoothFaceCy += (raw.faceCy - smoothFaceCy) * t;
  smoothFaceW += (raw.faceW - smoothFaceW) * t;
  smoothFaceH += (raw.faceH - smoothFaceH) * t;
  return {
    faceCx: smoothFaceCx,
    faceCy: smoothFaceCy,
    faceW: smoothFaceW,
    faceH: smoothFaceH,
  };
}

function fillJawPointsSorted(landmarks, width, height) {
  for (let i = 0; i < JAW_INDICES.length; i++) {
    const lm = landmarks[JAW_INDICES[i]];
    jawScratchX[i] = (1 - lm.x) * width;
    jawScratchY[i] = lm.y * height;
  }
  jawScratchOrder.sort((a, b) => jawScratchX[a] - jawScratchX[b]);
  return jawScratchOrder;
}

function updateFlowerAnchors(landmarks, p, frameCount) {
  const raw = computeFaceBBox(landmarks, p.width, p.height);
  const { faceCx, faceCy, faceW, faceH } = updateSmoothedFaceMetrics(raw);

  lastBodyCx = faceCx;
  lastBodyCy = faceCy;
  lastFaceW = faceW;
  lastFaceH = faceH;

  const jawOrder = fillJawPointsSorted(landmarks, p.width, p.height);
  const jawSlots = flowers.filter((x) => x.type === "jaw").length;

  for (const f of flowers) {
    let baseAx;
    let baseAy;
    if (f.type === "jaw") {
      const t = jawSlots > 1 ? f.jawIndex / (jawSlots - 1) : 0;
      const ji = jawOrder[Math.round(t * (JAW_INDICES.length - 1))];
      baseAx = jawScratchX[ji];
      baseAy = jawScratchY[ji] + faceH * COLLAR_DROP;
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
      frameCount,
    );
    f.instance.setAnchor(x, y, faceW);
  }

  return { faceCx, faceCy, faceW, faceH };
}

function setAuraEnv(facePresent, faceCx, faceCy, faceW, faceH, scentKey) {
  auraEnv.bodyCx = faceCx;
  auraEnv.bodyCy = faceCy;
  auraEnv.faceW = faceW;
  auraEnv.faceH = faceH;
  auraEnv.faceR = Math.max(faceW, faceH) * BODY_REPEL_RADIUS_FRAC;
  auraEnv.facePresent = facePresent;
  if (p5Instance) {
    auraEnv.canvasW = p5Instance.width;
    auraEnv.canvasH = p5Instance.height;
  }
  auraEnv.auraAssetScale = SCENT_CONFIG[scentKey]?.auraAssetScale ?? 1;
  applyProfileToAuraEnv(auraEnv, sessionAuraProfile);
  auraEnv.scentEnabled = facePresent && !!activeScentKey;
  auraEnv.scentIntensity = auraEnv.scentEnabled ? 1 : 0;
}

function simulateAndDrawAura(p, frameCount, env) {
  env.auraPeers = gatherAuraPeers();
  applyExplosionPushAuraOnFlowers();
  for (const f of flowers) {
    f.instance.update(frameCount, env);
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
}

function countAuraParticles() {
  let puffs = 0;
  let dots = 0;
  for (const f of flowers) {
    puffs += f.instance.puffs.length;
    dots += f.instance.dots.length;
  }
  return { puffs, dots };
}

function drawDebugOverlay(p) {
  if (!debugOverlay) return;
  const { puffs, dots } = countAuraParticles();
  p.push();
  p.resetMatrix();
  p.noStroke();
  p.fill(0, 0, 0, 160);
  p.rect(8, 8, 300, 148, 4);
  p.fill(255);
  p.textSize(13);
  const handOn = handResults?.landmarks?.length > 0;
  const handLm = handOn ? handResults.landmarks[0] : null;
  const spread = handLm ? handSpreadRatio(handLm, p) : null;
  const closeDbg =
    spread == null
      ? "—"
      : spread < HAND_CLOSE_SPREAD
        ? "closed"
        : wasHandClosed
          ? "opening"
          : "open";
  const windOn =
    auraEnv.handWindEnabled && auraEnv.handSpeed >= HAND_WIND_MIN_SPEED;
  p.text(
    [
      `FPS: ${Math.round(p.frameRate())}`,
      `Aura: ${puffs} puffs · ${dots} dots`,
      `Pop: ${popPuffs.length} · ${popDots.length}`,
      `Detect: every ${FACE_DETECT_EVERY_FRAMES} frame(s)`,
      `Hand: ${handOn ? "yes" : "no"} · Fist: ${closeDbg}${spread != null ? ` (${spread.toFixed(2)})` : ""}`,
      `Wind: ${windOn ? auraEnv.handSpeed.toFixed(1) : "—"} px/f · fan×${(auraEnv.handSpreadFactor ?? 1).toFixed(2)}`,
      `Profile seed: ${auraEnv.profileSeed ?? "—"}`,
      `Dot edge: ${auraEnv.screenEdge} · Face: ${auraEnv.faceCollision}`,
      `Scale×${auraEnv.assetScaleMul.toFixed(2)} · Speed×${auraEnv.initSpeedMul.toFixed(2)} · Life×${auraEnv.lifeMul.toFixed(2)}`,
    ].join("\n"),
    16,
    26,
  );
  if (
    auraEnv.handPresent &&
    auraEnv.handSpeed >= HAND_WIND_MIN_SPEED &&
    Math.hypot(auraEnv.handVelX, auraEnv.handVelY) > 1e-6
  ) {
    const len = Math.min(48, auraEnv.handSpeed * 2.2);
    const ang = Math.atan2(auraEnv.handVelY, auraEnv.handVelX);
    const x2 = auraEnv.handCx + Math.cos(ang) * len;
    const y2 = auraEnv.handCy + Math.sin(ang) * len;
    p.stroke(120, 220, 255, 200);
    p.strokeWeight(2);
    p.line(auraEnv.handCx, auraEnv.handCy, x2, y2);
    p.noStroke();
    p.fill(120, 220, 255, 220);
    p.circle(auraEnv.handCx, auraEnv.handCy, 6);
  }
  p.pop();
}

function ensureScentImagesLoaded(p, scentKey) {
  const existing = loadedImagesByScent[scentKey];
  if (existing?.length && existing[0]?.width) {
    return Promise.resolve(existing);
  }
  if (scentLoadPromises[scentKey]) return scentLoadPromises[scentKey];

  const paths = SCENT_CONFIG[scentKey]?.templatePaths;
  if (!paths?.length) return Promise.resolve([]);

  scentLoadPromises[scentKey] = Promise.all(
    paths.map(
      (path) =>
        new Promise((resolve) => {
          p.loadImage(path, (img) => resolve(img));
        }),
    ),
  ).then((imgs) => {
    loadedImagesByScent[scentKey] = imgs;
    return imgs;
  });

  return scentLoadPromises[scentKey];
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

function spawnHandBurst(handCx, handCy, burstAngle, env, p) {
  if (!flowers.length) return;
  const g = POP_GEN;
  const jitter = env.faceW * HAND_BURST_SPAWN_JITTER_FRAC;
  const faceCx = env.bodyCx;
  const faceCy = env.bodyCy;
  const burst = {
    baseAngle: burstAngle,
    popGen: g,
    speedMul: HAND_BURST_SPEED_MUL,
    angleSpread: HAND_BURST_ANGLE_SPREAD,
    visualScale: HAND_BURST_VISUAL_SCALE,
  };
  const burstDots = {
    baseAngle: burstAngle,
    popGen: g,
    speedMul: HAND_BURST_SPEED_MUL * 1.12,
    angleSpread: HAND_BURST_ANGLE_SPREAD * 1.08,
    visualScale: HAND_BURST_VISUAL_SCALE,
  };

  for (let i = 0; i < HAND_BURST_PUFF_COUNT; i++) {
    const f = flowers[(Math.random() * flowers.length) | 0];
    const { img, dotTemplate: tpl } = f.instance.pickSpawnVariant();
    if (!img?.width || !tpl?.length) continue;
    const px = handCx + (Math.random() * 2 - 1) * jitter;
    const py = handCy + (Math.random() * 2 - 1) * jitter;
    const auraMul = (env.auraAssetScale ?? 1) * (env.assetScaleMul ?? 1);
    popPuffs.push(
      new AirPuff(
        px,
        py,
        img,
        env.faceW,
        faceCx,
        faceCy,
        tpl,
        burst,
        auraMul,
        0,
        env,
      ),
    );
  }
  for (let i = 0; i < HAND_BURST_DOT_COUNT; i++) {
    const f = flowers[(Math.random() * flowers.length) | 0];
    const { dotTemplate: tpl } = f.instance.pickSpawnVariant();
    if (!tpl?.length) continue;
    const pt = tpl[(Math.random() * tpl.length) | 0];
    const px = handCx + (Math.random() * 2 - 1) * jitter * 0.85;
    const py = handCy + (Math.random() * 2 - 1) * jitter * 0.85;
    const auraMul = env.auraAssetScale ?? 1;
    popDots.push(
      new FloatDot(
        px,
        py,
        pt.r,
        pt.g,
        pt.b,
        env.faceW,
        faceCx,
        faceCy,
        burstDots,
        auraMul,
        0,
        env,
      ),
    );
  }
  while (popPuffs.length > MAX_POP_PUFFS) popPuffs.shift();
  while (popDots.length > MAX_POP_DOTS) popDots.shift();
}

function updatePopLayer(env) {
  for (let i = popPuffs.length - 1; i >= 0; i--) {
    popPuffs[i].step(env);
    if (popPuffs[i].dead()) {
      popPuffs[i] = popPuffs[popPuffs.length - 1];
      popPuffs.pop();
    }
  }
  for (let i = popDots.length - 1; i >= 0; i--) {
    popDots[i].step(env);
    if (popDots[i].dead()) {
      popDots[i] = popDots[popDots.length - 1];
      popDots.pop();
    }
  }
}

let explosionPushDirX = 0;
let explosionPushDirY = 0;
let explosionPushFrames = 0;

function beginExplosionPushAuraAngle(angleRad) {
  explosionPushDirX = Math.cos(angleRad);
  explosionPushDirY = Math.sin(angleRad);
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
    ? images.map((img) => getTemplateFromImage(img))
    : null;

  const list = [];
  let idx = 0;
  const pick = () => images[idx++ % images.length];

  for (let i = 0; i < ALIMA_COLLAR_COUNT; i++) {
    const instance = usePool
      ? new AuraEmitter(images, dotTemplatesAll)
      : (() => {
          const img = pick();
          return new AuraEmitter(img, getTemplateFromImage(img));
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
          return new AuraEmitter(img, getTemplateFromImage(img));
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

function randInt(min, max) {
  return min + ((Math.random() * (max - min + 1)) | 0);
}

function initAuraMotionState(particle, isBurst) {
  particle.motionPhase = isBurst ? "burst" : "radial";
  particle.framesAlive = 0;
  particle.floatAfterFrames = isBurst
    ? Infinity
    : randInt(FLOAT_DELAY_MIN_FRAMES, FLOAT_DELAY_MAX_FRAMES);
  particle.driftVx = 0;
  particle.driftVy = 0;
}

function maybeEnterDrift(particle, env) {
  if (particle.motionPhase !== "radial" || particle.popGen >= 0) return;
  particle.framesAlive += 1;
  if (particle.framesAlive < particle.floatAfterFrames) return;
  particle.motionPhase = "drift";
  const ang = Math.random() * Math.PI * 2;
  const sp =
    PUFF_INIT_SPEED *
    (env.initSpeedMul ?? 1) *
    randRange(FLOAT_DRIFT_SPEED_MIN, FLOAT_DRIFT_SPEED_MAX);
  particle.driftVx = Math.cos(ang) * sp;
  particle.driftVy = Math.sin(ang) * sp;
}

function radialForceScaleForParticle(particle) {
  if (particle.motionPhase === "drift") return FLOAT_DRIFT_RADIAL_SCALE;
  return 1;
}

function applyDriftVelocityBlend(particle) {
  if (particle.motionPhase !== "drift") return;
  const t = FLOAT_DRIFT_VEL_LERP;
  particle.vx += (particle.driftVx - particle.vx) * t;
  particle.vy += (particle.driftVy - particle.vy) * t;
}

const auraPeerScratch = [];

function gatherAuraPeers() {
  auraPeerScratch.length = 0;
  for (const f of flowers) {
    const inst = f.instance;
    for (const puff of inst.puffs) {
      if (!puff.shattered && puff.life > 0) auraPeerScratch.push(puff);
    }
    for (const d of inst.dots) {
      if (d.life > 0) auraPeerScratch.push(d);
    }
  }
  for (const puff of popPuffs) {
    if (!puff.shattered && puff.life > 0) auraPeerScratch.push(puff);
  }
  for (const d of popDots) {
    if (d.life > 0) auraPeerScratch.push(d);
  }
  return auraPeerScratch;
}

function computePeerRepelForce(particle, peers, env) {
  const radius = (env.faceW ?? 220) * PEER_REPEL_RADIUS_FRAC;
  if (radius < PEER_REPEL_MIN_DIST || !peers.length) {
    return { fx: 0, fy: 0 };
  }
  const px = particle.x;
  const py = particle.y;
  let fx = 0;
  let fy = 0;
  let neighbors = 0;
  for (let i = 0; i < peers.length && neighbors < PEER_REPEL_MAX_NEIGHBORS; i++) {
    const other = peers[i];
    if (other === particle || other.life <= 0) continue;
    const dx = px - other.x;
    const dy = py - other.y;
    const dist = Math.hypot(dx, dy);
    if (dist < PEER_REPEL_MIN_DIST || dist >= radius) continue;
    const t = 1 - dist / radius;
    const f = PEER_REPEL_STRENGTH * t * t;
    fx += (dx / dist) * f;
    fy += (dy / dist) * f;
    neighbors += 1;
  }
  const mag = Math.hypot(fx, fy);
  if (mag > PEER_REPEL_FORCE_CAP) {
    fx = (fx / mag) * PEER_REPEL_FORCE_CAP;
    fy = (fy / mag) * PEER_REPEL_FORCE_CAP;
  }
  return { fx, fy };
}

function applyPeerRepelToVelocity(particle, env) {
  const peers = env.auraPeers;
  if (!peers?.length) return;
  const { fx, fy } = computePeerRepelForce(particle, peers, env);
  particle.vx += fx;
  particle.vy += fy;
}

function mapHandSpreadFactor(spread) {
  if (spread == null) return 1;
  const span = HAND_OPEN_SPREAD - HAND_CLOSE_SPREAD + 0.15;
  const t = (spread - HAND_CLOSE_SPREAD) / span;
  const u = smoothstep(0, 1, t);
  return (
    HAND_WIND_SPREAD_MIN +
    u * (HAND_WIND_SPREAD_MAX - HAND_WIND_SPREAD_MIN)
  );
}

function applyHandWindToVelocity(x, y, vx, vy, env) {
  if (!env.handWindEnabled || !env.handPresent || !env.handR) {
    return { vx, vy };
  }
  if ((env.handSpeed ?? 0) < HAND_WIND_MIN_SPEED) {
    return { vx, vy };
  }

  const dx = x - env.handCx;
  const dy = y - env.handCy;
  const dist = Math.hypot(dx, dy);
  const reach = env.handR * HAND_WIND_RADIUS_MUL;
  if (dist >= reach) return { vx, vy };

  const velLen = Math.hypot(env.handVelX, env.handVelY);
  if (velLen < 1e-6) return { vx, vy };

  const speed = Math.min(env.handSpeed, HAND_WIND_MAX_SPEED);
  const speedT = smoothstep(HAND_WIND_MIN_SPEED, HAND_WIND_MAX_SPEED, speed);
  const falloff = 1 - dist / reach;
  const spread = env.handSpreadFactor ?? 1;
  const boost = env.handWindBoost ?? 1;
  let impulse =
    HAND_WIND_STRENGTH * speedT * falloff * falloff * spread * boost;
  let fx = (env.handVelX / velLen) * impulse;
  let fy = (env.handVelY / velLen) * impulse;
  const mag = Math.hypot(fx, fy);
  if (mag > HAND_WIND_FORCE_CAP) {
    fx = (fx / mag) * HAND_WIND_FORCE_CAP;
    fy = (fy / mag) * HAND_WIND_FORCE_CAP;
  }
  return { vx: vx + fx, vy: vy + fy };
}

function applyHandWindToParticle(particle, env) {
  const w = applyHandWindToVelocity(
    particle.x,
    particle.y,
    particle.vx,
    particle.vy,
    env,
  );
  particle.vx = w.vx;
  particle.vy = w.vy;
}

function edgeProximity(x, y, w, h, margin) {
  const left = x < margin ? 1 - x / margin : 0;
  const right = x > w - margin ? (x - (w - margin)) / margin : 0;
  const top = y < margin ? 1 - y / margin : 0;
  const bottom = y > h - margin ? (y - (h - margin)) / margin : 0;
  return Math.min(1, Math.max(left, right, top, bottom));
}

/** Dots/shards use profile screenEdge; image puffs pass through (no bounce/drain). */
function applyScreenEdge(x, y, vx, vy, env, passThrough = false) {
  if (passThrough) {
    return { x, y, vx, vy, edgeDrain: 0 };
  }
  const style = env.screenEdge ?? "none";
  const w = env.canvasW;
  const h = env.canvasH;
  if (style === "none" || !w || !h) {
    return { x, y, vx, vy, edgeDrain: 0 };
  }
  const margin = Math.max(24, Math.min(w, h) * SCREEN_EDGE_MARGIN_FRAC);
  let nx = x;
  let ny = y;
  let nvx = vx;
  let nvy = vy;
  let edgeDrain = 0;

  if (style === "softBounce") {
    if (nx < margin) nvx += (margin - nx) * 0.035;
    if (nx > w - margin) nvx -= (nx - (w - margin)) * 0.035;
    if (ny < margin) nvy += (margin - ny) * 0.035;
    if (ny > h - margin) nvy -= (ny - (h - margin)) * 0.035;
    nvx *= 0.985;
    nvy *= 0.985;
  } else if (style === "hardBounce") {
    if (nx < margin) {
      nx = margin;
      nvx = Math.abs(nvx) * 0.75;
    } else if (nx > w - margin) {
      nx = w - margin;
      nvx = -Math.abs(nvx) * 0.75;
    }
    if (ny < margin) {
      ny = margin;
      nvy = Math.abs(nvy) * 0.75;
    } else if (ny > h - margin) {
      ny = h - margin;
      nvy = -Math.abs(nvy) * 0.75;
    }
  } else if (style === "drain") {
    const k = edgeProximity(nx, ny, w, h, margin);
    edgeDrain = k * k * SCREEN_EDGE_DRAIN_SCALE;
  }

  return { x: nx, y: ny, vx: nvx, vy: nvy, edgeDrain };
}

function computeRepelForceAt(cx, cy, radius, x, y, strengthMul, opts = null) {
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-8 || !radius || dist >= radius) {
    return { fx: 0, fy: 0, mag: 0, dist };
  }
  const power = opts?.power ?? BODY_REPEL_POWER;
  const coreBoost = opts?.coreBoost ?? BODY_REPEL_CORE_BOOST;
  const coreFrac = opts?.coreFrac ?? BODY_REPEL_CORE_FRAC;
  const base = opts?.baseStrength ?? BODY_REPEL_STRENGTH;
  const t = 1 - dist / radius;
  let f = base * strengthMul * Math.pow(t, power);
  if (dist < radius * coreFrac) {
    const k = 1 - dist / (radius * coreFrac);
    f *= 1 + (coreBoost - 1) * k * k;
  }
  return {
    fx: (dx / dist) * f,
    fy: (dy / dist) * f,
    mag: f,
    dist,
  };
}

const handRepelOpts = {
  power: HAND_REPEL_POWER,
  coreBoost: HAND_REPEL_CORE_BOOST,
  coreFrac: HAND_REPEL_CORE_FRAC,
};

function computeRepelForce(x, y, env) {
  let fx = 0;
  let fy = 0;
  let faceDist = Infinity;
  let handDist = Infinity;

  if (env.faceR) {
    const face = computeRepelForceAt(
      env.bodyCx,
      env.bodyCy,
      env.faceR,
      x,
      y,
      env.repelMul ?? 1,
    );
    fx += face.fx;
    fy += face.fy;
    faceDist = face.dist;
  }

  if (env.handPresent && env.handR) {
    const hand = computeRepelForceAt(
      env.handCx,
      env.handCy,
      env.handR,
      x,
      y,
      env.handRepelMul ?? HAND_REPEL_STRENGTH_MUL,
      handRepelOpts,
    );
    fx += hand.fx;
    fy += hand.fy;
    handDist = hand.dist;
  }

  const mag = Math.hypot(fx, fy);
  const dist = Math.min(faceDist, handDist);
  return { fx, fy, mag, dist, faceDist, handDist };
}

function applyBodyRepel(x, y, vx, vy, env, rf = null) {
  const force = rf ?? computeRepelForce(x, y, env);
  return { vx: vx + force.fx, vy: vy + force.fy, rf: force };
}

function nearSphereLifeDrain(x, y, cx, cy, radius, drainMul) {
  if (!radius) return 0;
  const d = Math.hypot(x - cx, y - cy);
  const cutoff = radius * NEAR_HEAD_DRAIN_RADIUS_FRAC;
  if (d >= cutoff) return 0;
  const k = 1 - d / Math.max(cutoff, 1e-6);
  return (NEAR_HEAD_DRAIN_BASE + k * k * NEAR_HEAD_DRAIN_SCALE) * drainMul;
}

/** Extra `life` drain when close to face or hand */
function nearBodyLifeDrain(x, y, env, rf = null) {
  const force = rf ?? computeRepelForce(x, y, env);
  let drain = 0;
  if (env.faceR) {
    drain += nearSphereLifeDrain(
      x,
      y,
      env.bodyCx,
      env.bodyCy,
      env.faceR,
      env.headDrainMul ?? 1,
    );
  }
  if (env.handPresent && env.handR) {
    drain += nearSphereLifeDrain(
      x,
      y,
      env.handCx,
      env.handCy,
      env.handR,
      (env.headDrainMul ?? 1) * HAND_NEAR_DRAIN_MUL,
    );
  }
  if (
    env.handWindEnabled &&
    env.handPresent &&
    env.handR &&
    (env.handSpeed ?? 0) >= HAND_WIND_MIN_SPEED
  ) {
    const d = Math.hypot(x - env.handCx, y - env.handCy);
    const reach = env.handR * HAND_WIND_RADIUS_MUL;
    if (d < reach) {
      const k = (1 - d / reach) * Math.min(1, env.handSpeed / HAND_WIND_MAX_SPEED);
      drain += HAND_WIND_CLEAN_DRAIN * k * k;
    }
  }
  return drain;
}

function lmScreen(lm, p) {
  return { x: (1 - lm.x) * p.width, y: lm.y * p.height };
}

function handScalePx(landmarks, p) {
  const wrist = lmScreen(landmarks[HAND_LM_WRIST], p);
  const mcp = lmScreen(landmarks[HAND_LM_MIDDLE_MCP], p);
  return Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
}

/** Palm reference + avg fingertip spread (open hand = high, closed fist = low) */
function handSpreadRatio(landmarks, p) {
  const scale = handScalePx(landmarks, p);
  if (scale < HAND_SCALE_MIN_PX) return null;
  const palm = lmScreen(landmarks[HAND_LM_MIDDLE_MCP], p);
  let sum = 0;
  for (const i of HAND_FINGER_TIPS) {
    const tip = lmScreen(landmarks[i], p);
    sum += Math.hypot(tip.x - palm.x, tip.y - palm.y);
  }
  return sum / HAND_FINGER_TIPS.length / scale;
}

function handCenter(landmarks, p) {
  const wrist = lmScreen(landmarks[HAND_LM_WRIST], p);
  const palm = lmScreen(landmarks[HAND_LM_MIDDLE_MCP], p);
  return { x: (wrist.x + palm.x) * 0.5, y: (wrist.y + palm.y) * 0.5 };
}

function handBurstOrigin(landmarks, p) {
  return lmScreen(landmarks[HAND_LM_MIDDLE_MCP], p);
}

/** Spray axis: wrist → fingertip cluster (opening direction) */
function handBurstAngle(landmarks, p) {
  const wrist = lmScreen(landmarks[HAND_LM_WRIST], p);
  let tx = 0;
  let ty = 0;
  for (const i of HAND_FINGER_TIPS) {
    const tip = lmScreen(landmarks[i], p);
    tx += tip.x;
    ty += tip.y;
  }
  tx /= HAND_FINGER_TIPS.length;
  ty /= HAND_FINGER_TIPS.length;
  return Math.atan2(ty - wrist.y, tx - wrist.x);
}

function clearHandEnv(env = auraEnv) {
  env.handPresent = false;
  env.handR = 0;
  env.handVelX = 0;
  env.handVelY = 0;
  env.handSpeed = 0;
  env.handSpreadFactor = 1;
  env.handWindEnabled = false;
  env.handGustTurbMul = 1;
  env.handWindBoost = 1;
  handVelReady = false;
  lastHandVelFrame = -1;
}

function updateHandEnv(handLandmarks, p, env = auraEnv) {
  const scale = handScalePx(handLandmarks, p);
  if (scale < HAND_SCALE_MIN_PX) {
    clearHandEnv(env);
    return;
  }
  const center = handCenter(handLandmarks, p);
  const frameCount = p.frameCount ?? 0;
  const dt =
    handVelReady && lastHandVelFrame >= 0
      ? Math.max(1, frameCount - lastHandVelFrame)
      : 1;
  const dx = center.x - prevHandCenterX;
  const dy = center.y - prevHandCenterY;
  const moved = Math.hypot(dx, dy) > HAND_WIND_MOVE_EPS;

  env.handR = scale * HAND_REPEL_RADIUS_FRAC;
  env.handPresent = true;
  env.handRepelMul = HAND_REPEL_STRENGTH_MUL;

  if (!handVelReady) {
    env.handCx = center.x;
    env.handCy = center.y;
    handWindVelX = 0;
    handWindVelY = 0;
    handVelReady = true;
  } else if (moved) {
    handWindVelX = dx / dt;
    handWindVelY = dy / dt;
    env.handCx = center.x;
    env.handCy = center.y;
  } else {
    handWindVelX *= HAND_WIND_VEL_DECAY;
    handWindVelY *= HAND_WIND_VEL_DECAY;
    env.handCx += handWindVelX * dt;
    env.handCy += handWindVelY * dt;
  }

  prevHandCenterX = center.x;
  prevHandCenterY = center.y;
  lastHandVelFrame = frameCount;

  env.handVelX = handWindVelX;
  env.handVelY = handWindVelY;
  env.handSpeed = Math.hypot(handWindVelX, handWindVelY);
  env.handSpreadFactor = mapHandSpreadFactor(
    handSpreadRatio(handLandmarks, p),
  );
  env.handWindEnabled = !!(activeScentKey && oraclePhase === "done");
  env.handGustTurbMul =
    env.handSpeed >= HAND_WIND_GUST_SPEED ? HAND_WIND_GUST_TURB_MUL : 1;
  env.handWindBoost =
    env.handSpeed >= HAND_WIND_GUST_SPEED ? HAND_WIND_GUST_BOOST : 1;
}

let wasHandClosed = false;
let handBurstCooldown = 0;

function updateHandCloseBurst(handLandmarks, p, env) {
  if (handBurstCooldown > 0) handBurstCooldown -= 1;

  if (!activeScentKey || oraclePhase !== "done" || !flowers.length) {
    wasHandClosed = false;
    return;
  }

  const spread = handSpreadRatio(handLandmarks, p);
  if (spread == null) {
    wasHandClosed = false;
    return;
  }

  if (spread < HAND_CLOSE_SPREAD) {
    wasHandClosed = true;
    return;
  }

  if (wasHandClosed && spread > HAND_OPEN_SPREAD && handBurstCooldown <= 0) {
    wasHandClosed = false;
    const origin = handBurstOrigin(handLandmarks, p);
    const angle = handBurstAngle(handLandmarks, p);
    POP_GEN += 1;
    beginExplosionPushAuraAngle(angle);
    spawnHandBurst(origin.x, origin.y, angle, env, p);
    handBurstCooldown = HAND_BURST_COOLDOWN_FRAMES;
  }
}

function radialOutVelocity(px, py, bodyCx, bodyCy, faceW, env = auraEnv) {
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
    PUFF_INIT_SPEED *
    (env.initSpeedMul ?? 1) *
    (0.45 + Math.random() * 0.55);
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
    const radial = DOT_RADIAL_FORCE * 1.3 * (env.radialForceMul ?? 1);
    this.vx += (dx / len) * radial;
    this.vy += (dy / len) * radial;
    const rep = applyBodyRepel(this.x, this.y, this.vx, this.vy, env);
    this.vx = rep.vx;
    this.vy = rep.vy;
    applyHandWindToParticle(this, env);
    applyPeerRepelToVelocity(this, env);
    const turb =
      (env.turbulence ?? PUFF_TURBULENCE) *
      2.8 *
      (env.handGustTurbMul ?? 1);
    this.vx += (Math.random() * 2 - 1) * turb;
    this.vy += (Math.random() * 2 - 1) * turb;
    this.vx *= env.drag ?? PUFF_DRAG;
    this.vy *= env.drag ?? PUFF_DRAG;
    this.x += this.vx;
    this.y += this.vy;
    const edge = applyScreenEdge(this.x, this.y, this.vx, this.vy, env);
    this.x = edge.x;
    this.y = edge.y;
    this.vx = edge.vx;
    this.vy = edge.vy;
    this.life -= 1 + edge.edgeDrain;
    if (this.popGen >= 0 && this.popGen < POP_GEN) {
      this.life -= LEGACY_POP_LIFE_DRAIN;
    }
    this.life -= nearBodyLifeDrain(this.x, this.y, env, rep.rf);
    if (!env.facePresent) {
      this.life -= OUT_OF_FRAME_DRAIN;
    }
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
  constructor(
    x,
    y,
    img,
    faceW,
    faceCx,
    faceCy,
    dotTemplate,
    burstOpts = null,
    auraAssetScale = 1,
    intensity = 0,
    env = auraEnv,
  ) {
    this.x = x;
    this.y = y;
    this.img = img;
    this.dotTemplate = dotTemplate;
    this.shattered = false;
    this.shards = [];
    this.popGen = -1;
    const shatterChance = env.shatterChance ?? SHATTER_ON_REPEL_CHANCE;
    this.shattersOnRepel = shatterChance > 0 && Math.random() < shatterChance;

    const burstMul = burstOpts
      ? burstOpts.visualScale ?? HAND_BURST_VISUAL_SCALE
      : 1;
    const auraMul =
      typeof auraAssetScale === "number" ? auraAssetScale : 1;
    const combined =
      burstMul * auraMul * (env.assetScaleMul ?? 1);
    this.burstVisualScale = combined;

    const s0 =
      faceW *
      (PUFF_SCALE_MIN_FRAC +
        Math.random() * (PUFF_SCALE_MAX_FRAC - PUFF_SCALE_MIN_FRAC)) *
      combined;
    this.w = s0 * (1 + intensity * 0.11);
    this.h = (this.w * img.height) / img.width;

    if (burstOpts) {
      this.popGen = burstOpts.popGen;
      const base = burstOpts.baseAngle;
      const spread = burstOpts.angleSpread ?? HAND_BURST_ANGLE_SPREAD;
      const ang = base + (Math.random() * 2 - 1) * spread;
      const sp =
        PUFF_INIT_SPEED *
        (env.initSpeedMul ?? 1) *
        (burstOpts.speedMul ?? HAND_BURST_SPEED_MUL) *
        (0.62 + Math.random() * 0.58);
      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp;
    } else {
      const { vx, vy } = radialOutVelocity(x, y, faceCx, faceCy, faceW, env);
      this.vx = vx;
      this.vy = vy;
    }
    this.rot = Math.random() * Math.PI * 2;
    this.vr = (Math.random() * 2 - 1) * 0.008;

    const lifeSpan = PUFF_LIFE_MAX - PUFF_LIFE_MIN;
    this.maxLife =
      (PUFF_LIFE_MIN + Math.random() * lifeSpan) * (env.lifeMul ?? 1);
    this.life = this.maxLife;
    this.fadeInFrac = env.fadeInFrac ?? PUFF_FADE_IN_FRAC;
    this.fadeOutFrac = env.fadeOutFrac ?? PUFF_FADE_OUT_FRAC;
    this.solidBoost = env.solidBoost ?? PUFF_SOLID_BOOST;

    const aMin = env.alphaMin ?? PUFF_ALPHA_BASE_MIN;
    const aMax = env.alphaMax ?? PUFF_ALPHA_BASE_MAX;
    this.baseAlpha =
      (aMin + Math.random() * (aMax - aMin)) * (1 + intensity * 0.18);
    initAuraMotionState(this, !!burstOpts);
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
        env,
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
        if (this.shards[i].dead()) {
          this.shards[i] = this.shards[this.shards.length - 1];
          this.shards.pop();
        }
      }
      return;
    }

    maybeEnterDrift(this, env);
    applyDriftVelocityBlend(this);

    let dx = this.x - env.bodyCx;
    let dy = this.y - env.bodyCy;
    let len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      const ang = Math.random() * Math.PI * 2;
      dx = Math.cos(ang);
      dy = Math.sin(ang);
      len = 1;
    }
    const radial =
      RADIAL_FORCE *
      (env.radialForceMul ?? 1) *
      radialForceScaleForParticle(this);
    this.vx += (dx / len) * radial;
    this.vy += (dy / len) * radial;
    const rep = applyBodyRepel(this.x, this.y, this.vx, this.vy, env);
    this.vx = rep.vx;
    this.vy = rep.vy;
    applyHandWindToParticle(this, env);
    applyPeerRepelToVelocity(this, env);
    const turb =
      (env.turbulence ?? PUFF_TURBULENCE) *
      0.025 *
      (env.handGustTurbMul ?? 1);
    this.vx += (Math.random() * 2 - 1) * turb;
    this.vy += (Math.random() * 2 - 1) * turb;
    this.vx *= env.drag ?? PUFF_DRAG;
    this.vy *= env.drag ?? PUFF_DRAG;
    this.x += this.vx;
    this.y += this.vy;
    const edge = applyScreenEdge(this.x, this.y, this.vx, this.vy, env, true);
    this.x = edge.x;
    this.y = edge.y;
    this.vx = edge.vx;
    this.vy = edge.vy;
    this.rot += this.vr;
    this.vr *= PUFF_ROT_DAMP;
    this.life -= 1 + edge.edgeDrain;
    if (this.popGen >= 0 && this.popGen < POP_GEN) {
      this.life -= LEGACY_POP_LIFE_DRAIN;
    }
    this.life -= nearBodyLifeDrain(this.x, this.y, env, rep.rf);
    if (!env.facePresent) {
      this.life -= OUT_OF_FRAME_DRAIN;
    }

    const rf = rep.rf;
    const age = this.ageFrac();
    const pastFade = age >= this.fadeInFrac * 1.02;
    const tooCloseFace =
      env.faceR && rf.faceDist < env.faceR * SHATTER_DIST_FRAC;
    const tooCloseHand =
      env.handPresent &&
      env.handR &&
      rf.handDist < env.handR * SHATTER_DIST_FRAC;
    const tooClose = tooCloseFace || tooCloseHand;
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
    const birth = smoothstep(0, this.fadeInFrac, age);
    const fadeOut = smoothstep(0, this.fadeOutFrac, t);
    const solid = smoothstep(this.fadeInFrac, this.fadeInFrac + 0.06, age);
    const boost = 1 + (this.solidBoost - 1) * solid;
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
    intensity = 0,
    env = auraEnv,
  ) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.g = g;
    this.b = b;
    this.popGen = -1;
    const auraMul =
      typeof auraAssetScale === "number" ? auraAssetScale : 1;
    const scaleMul = (env.assetScaleMul ?? 1) * auraMul;
    this.drawSize = DOT_SIZE * scaleMul * (1 + intensity * 0.14);
    if (burstOpts) {
      this.popGen = burstOpts.popGen;
      const vScale = burstOpts.visualScale ?? HAND_BURST_VISUAL_SCALE;
      this.drawSize = DOT_SIZE * vScale * scaleMul;
      const base = burstOpts.baseAngle;
      const spread = burstOpts.angleSpread ?? HAND_BURST_ANGLE_SPREAD * 1.1;
      const ang = base + (Math.random() * 2 - 1) * spread;
      const sp =
        PUFF_INIT_SPEED *
        (env.initSpeedMul ?? 1) *
        (burstOpts.speedMul ?? HAND_BURST_SPEED_MUL * 1.15) *
        (0.55 + Math.random() * 0.65);
      this.vx = Math.cos(ang) * sp;
      this.vy = Math.sin(ang) * sp;
    } else {
      const { vx, vy } = radialOutVelocity(x, y, faceCx, faceCy, faceW, env);
      this.vx = vx * 1.1;
      this.vy = vy * 1.1;
    }
    this.maxLife =
      (PUFF_LIFE_MIN + Math.random() * (PUFF_LIFE_MAX - PUFF_LIFE_MIN)) *
      DOT_LIFE_MULT *
      (env.lifeMul ?? 1);
    this.life = this.maxLife;
    this.fadeInFrac = env.dotFadeInFrac ?? DOT_FADE_IN_FRAC;
    this.fadeOutFrac = env.dotFadeOutFrac ?? DOT_FADE_OUT_FRAC;
    this.solidBoost = env.dotSolidBoost ?? DOT_SOLID_BOOST;
    const aMin = env.alphaMin ?? PUFF_ALPHA_BASE_MIN;
    const aMax = env.alphaMax ?? PUFF_ALPHA_BASE_MAX;
    this.baseA = aMin + Math.random() * (aMax - aMin);
    initAuraMotionState(this, !!burstOpts);
  }

  step(env) {
    maybeEnterDrift(this, env);
    applyDriftVelocityBlend(this);

    let dx = this.x - env.bodyCx;
    let dy = this.y - env.bodyCy;
    let len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      const ang = Math.random() * Math.PI * 2;
      dx = Math.cos(ang);
      dy = Math.sin(ang);
      len = 1;
    }
    const radial =
      DOT_RADIAL_FORCE *
      (env.radialForceMul ?? 1) *
      radialForceScaleForParticle(this);
    this.vx += (dx / len) * radial;
    this.vy += (dy / len) * radial;
    const rep = applyBodyRepel(this.x, this.y, this.vx, this.vy, env);
    this.vx = rep.vx;
    this.vy = rep.vy;
    applyHandWindToParticle(this, env);
    applyPeerRepelToVelocity(this, env);
    const turb =
      (env.turbulence ?? PUFF_TURBULENCE) *
      0.02 *
      (env.handGustTurbMul ?? 1);
    this.vx += (Math.random() * 2 - 1) * turb;
    this.vy += (Math.random() * 2 - 1) * turb;
    const dotDrag = Math.min(0.998, (env.drag ?? PUFF_DRAG) + 0.005);
    this.vx *= dotDrag;
    this.vy *= dotDrag;
    this.x += this.vx;
    this.y += this.vy;
    const edge = applyScreenEdge(this.x, this.y, this.vx, this.vy, env);
    this.x = edge.x;
    this.y = edge.y;
    this.vx = edge.vx;
    this.vy = edge.vy;
    this.life -= 1 + edge.edgeDrain;
    if (this.popGen >= 0 && this.popGen < POP_GEN) {
      this.life -= LEGACY_POP_LIFE_DRAIN;
    }
    this.life -= nearBodyLifeDrain(this.x, this.y, env, rep.rf);
    if (!env.facePresent) {
      this.life -= OUT_OF_FRAME_DRAIN;
    }
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
    const birth = smoothstep(0, this.fadeInFrac, age);
    const fadeOut = smoothstep(0, this.fadeOutFrac, t);
    const solid = smoothstep(this.fadeInFrac, this.fadeInFrac + 0.06, age);
    const boost = 1 + (this.solidBoost - 1) * solid;
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
    const auraMul = (env.auraAssetScale ?? 1) * (env.assetScaleMul ?? 1);
    const intensity = env.scentIntensity ?? 0;
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
        intensity,
        env,
      ),
    );

    const dotChance =
      DOT_EMIT_CHANCE * (env.dotEmitMul ?? 1) + intensity * 0.12;
    if (tpl.length && Math.random() < dotChance) {
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
          intensity,
          env,
        ),
      );
    }
  }

  update(_frameCount, env) {
    if (!this.ready) return;

    if (env.facePresent && env.scentEnabled) {
      this.spawnAcc += 1 + env.scentIntensity * 0.9;
      const interval = SPAWN_INTERVAL_BASE * (env.spawnIntervalMul ?? 1);
      while (this.spawnAcc >= interval) {
        this.spawnAcc -= interval;
        this.spawnAtAnchor(env);
      }
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      puff.step(env);
      if (puff.dead()) {
        this.puffs[i] = this.puffs[this.puffs.length - 1];
        this.puffs.pop();
      }
    }
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.step(env);
      if (d.dead()) {
        this.dots[i] = this.dots[this.dots.length - 1];
        this.dots.pop();
      }
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
let videoDetectCounter = 0;
let dbgDrawSampleAt = 0;
let flowers = [];
let handLandmarker;
let handResults;
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
let oracleRevealQueued = false;

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
  oracleRevealQueued = false;
  document.getElementById("scent-oracle")?.classList.remove("scent-oracle--fading");
  setOracleUiVisibility("loading");
  if (p5Instance) ensureScentImagesLoaded(p5Instance, scentKey);
}

function updateOracleLoading(nowMs) {
  if (oraclePhase !== "loading" || !pendingOracleScentKey || oracleRevealQueued) return;

  const elapsed = nowMs - oracleRevealStartMs;
  if (elapsed >= ORACLE_LOADING_MS) {
    oracleRevealQueued = true;
    const key = pendingOracleScentKey;
    ensureScentImagesLoaded(p5Instance, key).then((imgs) => {
      if (oraclePhase !== "loading" || pendingOracleScentKey !== key) return;
      if (!imgs?.length || !imgs[0]?.width) {
        oracleRevealQueued = false;
        return;
      }
      pendingOracleScentKey = null;
      beginOracleReveal(key);
    });
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
  wasHandClosed = false;
  handBurstCooldown = 0;
  clearHandEnv();
  explosionPushDirX = 0;
  explosionPushDirY = 0;
  explosionPushFrames = 0;
  pendingOracleScentKey = null;
  oracleRevealQueued = false;
  sessionAuraProfile = null;
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
  sessionAuraProfile = rollAuraProfile(scentKey);
  flowers = makeFlowersFromTemplates(imgs, scentKey);
  syncScentRadios(scentKey);
  console.log(
    `[${SCENT_CONFIG[scentKey].displayName}] ${flowers.length} emitters · aura profile seed ${sessionAuraProfile.seed}`,
    sessionAuraProfile,
  );
}

function applyScentWhenLoaded(p, scentKey) {
  ensureScentImagesLoaded(p, scentKey).then((imgs) => {
    if (imgs?.length && imgs[0]?.width) applyScent(scentKey);
  });
}

const sketch = (p) => {
  p.setup = async () => {
    p5Instance = p;
    debugOverlay = new URLSearchParams(window.location.search).get("debug") === "1";
    p.pixelDensity(1);
    p.createCanvas(p.windowWidth, p.windowHeight);
    lastBodyCx = p.width / 2;
    lastBodyCy = p.height / 2;
    lastFaceW = p.width * 0.32;
    lastFaceH = p.height * 0.42;

    webcam = p.createCapture(
      { video: { facingMode: "user" }, audio: false },
      () => {
        webcam.size(640, 480);
        // #region agent log
        fetch("http://127.0.0.1:7642/ingest/ad7fd6cb-4876-404f-a0b0-0881b6e55fb0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f07143" },
          body: JSON.stringify({
            sessionId: "f07143",
            runId: "pre-fix",
            hypothesisId: "A/E",
            location: "sketch.js:createCapture-callback",
            message: "createCapture callback fired",
            data: {
              webcamWidth: webcam?.width,
              webcamHeight: webcam?.height,
              readyState: webcam?.elt?.readyState,
              hasSrcObject: !!webcam?.elt?.srcObject,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      },
    );
    webcam.elt.playsInline = true;
    webcam.elt.setAttribute("playsinline", "");
    webcam.hide();

    setOracleUiVisibility("waiting");

    const picker = document.getElementById("scent-picker");
    picker?.addEventListener("change", (e) => {
      if (oraclePhase !== "done") return;
      const t = e.target;
      if (t instanceof HTMLInputElement && t.name === "scent" && t.checked) {
        applyScentWhenLoaded(p, t.value);
      }
    });

    document.getElementById("oracle-reload")?.addEventListener("click", () => {
      if (oraclePhase === "loading" || oraclePhase === "revealing") return;
      const hasFace = !!faceResults?.faceLandmarks?.length;
      resetOracleSession(hasFace);
    });

    try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm",
    );
    const landmarkerOptions = {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      },
      runningMode: "VIDEO",
      numFaces: 1,
    };
    try {
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        ...landmarkerOptions,
        baseOptions: { ...landmarkerOptions.baseOptions, delegate: "GPU" },
      });
      // #region agent log
      fetch("http://127.0.0.1:7642/ingest/ad7fd6cb-4876-404f-a0b0-0881b6e55fb0", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f07143" },
        body: JSON.stringify({
          sessionId: "f07143",
          runId: "pre-fix",
          hypothesisId: "B",
          location: "sketch.js:setup-gpu",
          message: "FaceLandmarker GPU ready",
          data: { delegate: "GPU" },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } catch (gpuErr) {
      console.warn("FaceLandmarker GPU failed, falling back to CPU", gpuErr);
      // #region agent log
      fetch("http://127.0.0.1:7642/ingest/ad7fd6cb-4876-404f-a0b0-0881b6e55fb0", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f07143" },
        body: JSON.stringify({
          sessionId: "f07143",
          runId: "pre-fix",
          hypothesisId: "B",
          location: "sketch.js:setup-gpu-fail",
          message: "FaceLandmarker GPU failed",
          data: { error: String(gpuErr) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        ...landmarkerOptions,
        baseOptions: { ...landmarkerOptions.baseOptions, delegate: "CPU" },
      });
      // #region agent log
      fetch("http://127.0.0.1:7642/ingest/ad7fd6cb-4876-404f-a0b0-0881b6e55fb0", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f07143" },
        body: JSON.stringify({
          sessionId: "f07143",
          runId: "pre-fix",
          hypothesisId: "B",
          location: "sketch.js:setup-cpu",
          message: "FaceLandmarker CPU ready",
          data: { delegate: "CPU" },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }
    console.log("FaceLandmarker ready");

    const handOptions = {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      },
      runningMode: "VIDEO",
      numHands: 1,
    };
    try {
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        ...handOptions,
        baseOptions: { ...handOptions.baseOptions, delegate: "GPU" },
      });
      console.log("HandLandmarker ready (GPU)");
    } catch (handGpuErr) {
      console.warn("HandLandmarker GPU failed, falling back to CPU", handGpuErr);
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        ...handOptions,
        baseOptions: { ...handOptions.baseOptions, delegate: "CPU" },
      });
      console.log("HandLandmarker ready (CPU)");
    }
  } catch (setupErr) {
    // #region agent log
    fetch("http://127.0.0.1:7642/ingest/ad7fd6cb-4876-404f-a0b0-0881b6e55fb0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f07143" },
      body: JSON.stringify({
        sessionId: "f07143",
        runId: "pre-fix",
        hypothesisId: "B",
        location: "sketch.js:setup-fatal",
        message: "setup failed",
        data: { error: String(setupErr) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    console.error("Setup failed", setupErr);
    }
  };

  p.draw = () => {
    p.background(0);

    if (webcam?.width > 0) {
      p.push();
      p.translate(p.width, 0);
      p.scale(-1, 1);
      p.image(webcam, 0, 0, p.width, p.height);
      p.pop();
    }

    if (p.frameCount - dbgDrawSampleAt >= 120) {
      dbgDrawSampleAt = p.frameCount;
      const blocked = !faceLandmarker || !webcam?.elt || webcam.elt.readyState < 2;
      // #region agent log
      fetch("http://127.0.0.1:7642/ingest/ad7fd6cb-4876-404f-a0b0-0881b6e55fb0", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f07143" },
        body: JSON.stringify({
          sessionId: "f07143",
          runId: "pre-fix",
          hypothesisId: blocked ? "A/D" : "C",
          location: "sketch.js:draw-sample",
          message: blocked ? "draw blocked or pre-detect" : "draw running detect path",
          data: {
            frameCount: p.frameCount,
            blocked,
            hasLandmarker: !!faceLandmarker,
            webcamWidth: webcam?.width ?? 0,
            readyState: webcam?.elt?.readyState ?? -1,
            paused: webcam?.elt?.paused ?? null,
            oraclePhase,
            landmarkCount: faceResults?.faceLandmarks?.length ?? 0,
            videoDetectCounter,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    }

    if (!faceLandmarker || !webcam?.elt || webcam.elt.readyState < 2) return;

    const now = performance.now();
    if (webcam.elt.currentTime !== lastVideoTime) {
      lastVideoTime = webcam.elt.currentTime;
      if (videoDetectCounter++ % FACE_DETECT_EVERY_FRAMES === 0) {
        faceResults = faceLandmarker.detectForVideo(webcam.elt, now);
        if (handLandmarker) {
          handResults = handLandmarker.detectForVideo(webcam.elt, now);
        }
        // #region agent log
        fetch("http://127.0.0.1:7642/ingest/ad7fd6cb-4876-404f-a0b0-0881b6e55fb0", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f07143" },
          body: JSON.stringify({
            sessionId: "f07143",
            runId: "pre-fix",
            hypothesisId: "C",
            location: "sketch.js:detectForVideo",
            message: "detectForVideo ran",
            data: {
              landmarkCount: faceResults?.faceLandmarks?.length ?? 0,
              videoDetectCounter,
              currentTime: webcam.elt.currentTime,
              timestampMs: now,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      }
    }

    updateOracleLoading(now);
    updateOracleReveal(now);

    if (faceResults?.faceLandmarks?.length) {
      if (oraclePhase === "waiting") {
        startOracleLoading(pickRandomScentKey());
      }

      const landmarks = faceResults.faceLandmarks[0];
      const { faceCx, faceCy, faceW, faceH } = updateFlowerAnchors(
        landmarks,
        p,
        p.frameCount,
      );

      setAuraEnv(true, faceCx, faceCy, faceW, faceH, activeScentKey);

      if (handResults?.landmarks?.length) {
        const handLm = handResults.landmarks[0];
        updateHandEnv(handLm, p, auraEnv);
        updateHandCloseBurst(handLm, p, auraEnv);
      } else {
        clearHandEnv(auraEnv);
      }

      simulateAndDrawAura(p, p.frameCount, auraEnv);
      drawDebugOverlay(p);
      return;
    }

    wasHandClosed = false;
    handBurstCooldown = 0;

    if (handResults?.landmarks?.length) {
      updateHandEnv(handResults.landmarks[0], p, auraEnv);
    } else {
      clearHandEnv(auraEnv);
    }

    setAuraEnv(
      false,
      lastBodyCx,
      lastBodyCy,
      lastFaceW,
      lastFaceH,
      activeScentKey,
    );
    simulateAndDrawAura(p, p.frameCount, auraEnv);
    drawDebugOverlay(p);
  };

  p.windowResized = () => {
    p.pixelDensity(1);
    p.resizeCanvas(p.windowWidth, p.windowHeight);
  };
};

new p5(sketch);
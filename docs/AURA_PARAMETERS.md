# Augmented Face — Parameter reference

Use this document for demos and PDF export (open in VS Code / browser → Print → Save as PDF).

---

## 1. What the experience does

1. Webcam detects the face (MediaPipe).
2. **Scent oracle** picks a perfume (Alima, Aymeric, Jamie, Paloma) or the user chooses one.
3. **Aura** spawns image motifs and colored dots around the jaw/chin.
4. Each scent load rolls a **unique physics profile** (size, speed, opacity, collisions, etc.).
5. After **1–3 seconds**, each aura particle switches to its **own random drift direction**.
6. **Hand wind** swipes disperse the cloud; **fist → open** still triggers a burst; particles **repel from the tracked hand** like the face (unchanged by scent profile).

---

## 2. Scents (fixed per brand)

Configured in `SCENT_CONFIG` in `sketch.js`.

| Scent | Display name | Tagline | Assets | Pool mode | `auraAssetScale` |
|-------|----------------|---------|--------|-----------|------------------|
| **alima** | Alima | Soft floral drift | Flowers + perfume + flower v2 | Off (one image per anchor) | 1.0 |
| **aymeric** | Aymeric | Autumn leaf — Maison Margiela | `aymeric-leaf-autumn.png` | On (random leaf each spawn) | 1.0 |
| **jamie** | Jamie | Salt, citrus, shell-light | Shells, glass, oranges, leaves, bottle | On | ~0.67 (1/1.5) |
| **paloma** | Paloma | Warm sun, tropical lift | Sun, leaves, mango, bottle | On | ~0.67 (1/1.5) |

**Pool mode (`emitFromFullTemplatePool`)**

- **Off**: Each jaw anchor keeps one assigned image (rotates through the list).
- **On**: Every spawn randomly picks any image in the scent’s list (more variety).

**`auraAssetScale`**

- Scales all image puffs and dots for that scent (Jamie/Paloma art is smaller on disk, so scale is reduced).

---

## 3. Random aura profile (unique per scent load)

Rolled once when a scent is applied (oracle reveal, picker, or “New aura”). Same seed is logged in the browser console (`?debug=1` shows it on screen).

| Parameter | Range (typical) | Effect |
|-----------|-----------------|--------|
| **seed** | integer | Reproducible ID for debugging; not shown to users. |
| **assetScaleMul** | 0.88 – 1.22 | Overall size of image puffs for this session. |
| **initSpeedMul** | 0.82 – 1.28 | Initial outward speed from face / burst. |
| **radialForceMul** | 0.85 – 1.25 | Continuous push away from face center. |
| **drag** | 0.982 – 0.993 | Friction (higher = slower, heavier drift). |
| **turbulence** | 0.028 – 0.055 | Random jitter each frame (more = busier, less smooth). |
| **alphaMin / alphaMax** | 0.52–0.72 / 0.78–0.95 | Opacity range of particles. |
| **solidBoost** | 1.05 – 1.18 | Peak brightness during mid-life. |
| **lifeMul** | 0.75 – 1.35 | How long puffs live (higher = longer on screen). |
| **fadeInFrac** | 0.08 – 0.14 | Fraction of life spent fading in (image puffs). |
| **fadeOutFrac** | 0.12 – 0.22 | Fraction of life spent fading out. |
| **spawnIntervalMul** | 0.72 – 1.38 | Spawn rate (lower = denser aura). |
| **dotEmitMul** | 0.65 – 1.45 | How often colored dots appear with each puff. |
| **screenEdge** | see below | **Dots/shards only** — image puffs pass through edges. |
| **faceCollision** | soft / firm / shatter | How particles interact with the face zone. |

### `screenEdge` (dots & shards only)

| Value | Behavior |
|-------|----------|
| **none** | No screen interaction. |
| **softBounce** | Gentle push away from edges. |
| **hardBounce** | Reflect and clamp at edges (can pile at bottom on dots). |
| **drain** | Lose life faster near edges. |

**Image puffs** always pass through screen borders (no bounce) so bottles/leaves do not stack along the bottom edge.

### `faceCollision`

| Value | Repel from face | Near-head drain | Shatter on contact |
|-------|-----------------|-----------------|-------------------|
| **soft** | Normal | Light | No |
| **firm** | Stronger | Strong | Sometimes |
| **shatter** | Medium | Medium | Often (image breaks into dots) |

---

## 4. Two-phase particle motion (aura only)

| Constant | Value | Meaning |
|----------|-------|---------|
| `FLOAT_DELAY_MIN_FRAMES` | 60 | Earliest switch to drift (~1 s at 60 FPS). |
| `FLOAT_DELAY_MAX_FRAMES` | 180 | Latest switch (~3 s). **Random per particle.** |
| `FLOAT_DRIFT_SPEED_MIN/MAX` | 0.28 – 0.62 | Speed after drift starts (random direction). |
| `FLOAT_DRIFT_RADIAL_SCALE` | 0.12 | Weak pull toward face center during drift (12% of normal). |
| `FLOAT_DRIFT_VEL_LERP` | 0.04 | How quickly velocity blends into drift direction. |

**Hand-burst particles** skip this system and keep burst physics.

---

## 5. Soft particle–particle repulsion

Prevents motifs from stacking in one spot without violent bouncing.

| Constant | Value | Meaning |
|----------|-------|---------|
| `PEER_REPEL_RADIUS_FRAC` | 0.14 | Interaction distance as fraction of face width. |
| `PEER_REPEL_STRENGTH` | 0.016 | Push strength (keep low for “soft”). |
| `PEER_REPEL_MAX_NEIGHBORS` | 10 | Max other particles checked per frame (performance). |
| `PEER_REPEL_FORCE_CAP` | 0.055 | Max push per frame (prevents explosions). |

---

## 6. Global physics (all scents)

### Motion from face

| Constant | Meaning |
|----------|---------|
| `RADIAL_FORCE` | Steady outward drift from face center. |
| `PUFF_INIT_SPEED` | Speed when a puff spawns. |
| `PUFF_DRAG` / `DOT_DRAG` | Velocity damping per frame. |
| `PUFF_TURBULENCE` | Random motion noise. |

### Face repel & clearance

| Constant | Meaning |
|----------|---------|
| `BODY_REPEL_STRENGTH` | Push away from face sphere. |
| `BODY_REPEL_RADIUS_FRAC` | Radius of repel zone vs face size. |
| `NEAR_HEAD_DRAIN_*` | Extra life loss near face (clears halo over cheeks). |

### Image puff appearance

| Constant | Meaning |
|----------|---------|
| `PUFF_SCALE_MIN/MAX_FRAC` | Size range vs face width. |
| `PUFF_LIFE_MIN/MAX` | Lifetime in frames. |
| `PUFF_FADE_IN/OUT_FRAC` | Fade curve shape. |

### Dots (color specks)

| Constant | Meaning |
|----------|---------|
| `DOT_EMIT_CHANCE` | Probability of a dot per spawn. |
| `DOT_SIZE` | Dot diameter baseline. |
| `DOT_LIFE_MULT` | Dots live shorter than puffs (× this factor). |

### Anchors (where spawns come from)

| Constant | Meaning |
|----------|---------|
| `ALIMA_COLLAR_COUNT` | 15 emitters along jaw line. |
| `EXTRA_PLACEMENTS` | 5 extra chin/cheek points. |
| `COLLAR_DROP` | Jaw anchors shifted down (fraction of face height). |
| `AURA_JITTER_FRAC` | Random spread around each anchor. |
| `AURA_BIAS_DOWN_FRAC` | Slight downward bias on anchor positions. |

### Spawning limits

| Constant | Meaning |
|----------|---------|
| `SPAWN_INTERVAL_BASE` | Frames between spawns per emitter (÷ profile `spawnIntervalMul`). |
| `MAX_PUFFS_PER_EMITTER` | Cap per anchor (performance). |

---

## 7. Hand close-release burst & hand collision (interaction)

MediaPipe **Hand Landmarker** runs on the same cadence as face (`FACE_DETECT_EVERY_FRAMES`). One hand (`numHands: 1`).

### Gesture (fist → open)

Uses **all five fingertips** vs palm (middle MCP): average tip distance ÷ hand scale.

| Constant | Meaning |
|----------|---------|
| `HAND_CLOSE_SPREAD` | Below this = fist closed (hold). |
| `HAND_OPEN_SPREAD` | Above this after closed = release → burst. |
| `HAND_SCALE_MIN_PX` | Ignore tiny / bogus hand scales. |
| `HAND_BURST_COOLDOWN_FRAMES` | Cooldown after a burst (~24 frames). |

Burst spawns at palm (middle MCP); spray axis is **wrist → fingertip cluster**. More reliable than thumb–index pinch alone.

### Hand repel (like face)

| Constant | Meaning |
|----------|---------|
| `HAND_REPEL_RADIUS_FRAC` | Large repel bubble ≈ hand scale × this. |
| `HAND_REPEL_STRENGTH_MUL` | Hand-only push (ignores aura profile `repelMul`). |
| `HAND_REPEL_POWER` / `CORE_BOOST` / `CORE_FRAC` | Wider, harder shove than face repel. |
| `HAND_NEAR_DRAIN_MUL` | Faster fade when particles sit on the hand zone. |
| *(no hand lerp)* | Hand center/radius follow landmarks **raw each frame**; face still uses `FACE_LERP`. |

Particles get combined repel from **face + hand**; extra life drain near either. Image puffs can shatter when pushed hard against the hand zone (same rules as face).

### Hand wind (movement disperses perfume)

While a scent is active, moving the hand pushes nearby aura and burst particles along the swipe (open palm = stronger fan).

| Constant | Meaning |
|----------|---------|
| `HAND_WIND_MIN_SPEED` | Hand speed (px/frame) before wind applies. |
| `HAND_WIND_MAX_SPEED` | Speed cap for gust strength curve. |
| `HAND_WIND_GUST_SPEED` | Fast swipe: extra wind + turbulence boost. |
| `HAND_WIND_RADIUS_MUL` | Wind reach ≈ `handR ×` this. |
| `HAND_WIND_STRENGTH` | Base push impulse. |
| `HAND_WIND_FORCE_CAP` | Max impulse per frame (raise if gusts feel weak). |
| `HAND_WIND_VEL_DECAY` | Keeps swipe speed between detect ticks (every 2 frames). |
| `HAND_WIND_CLEAN_DRAIN` | Extra particle fade in wind zone while swiping. |
| `HAND_WIND_SPREAD_MIN/MAX` | Closed fist vs open palm multiplier. |

Works together with fist-open burst (burst = punch; wind = continuous fan).

| Burst tuning | |
|--------------|--|
| `HAND_BURST_PUFF_COUNT` / `DOT_COUNT` | Particles per burst. |
| `HAND_BURST_SPEED_MUL` / `ANGLE_SPREAD` | Burst speed and cone. |
| `EXPLOSION_PUSH_FRAMES` | Jaw aura nudge after burst. |

**No** delayed drift on burst particles. Debug: `?debug=1` shows fist state, wind speed, fan factor, and velocity arrow.

---

## 8. Face tracking & UI

| Constant | Meaning |
|----------|---------|
| `FACE_DETECT_EVERY_FRAMES` | Run face + hand MediaPipe every N frames (2 = half CPU). |
| `FACE_LERP` | Smoothing of face position/size. |

Oracle timings: loading ~900 ms, reveal ~3 s, fade ~600 ms (in `sketch.js` as `ORACLE_*_MS`).

---

## 9. Adding more Aymeric art

Place PNGs in `Assets/aymeric/` and add paths to `aymeric.templatePaths` in `sketch.js`, for example:

```js
templatePaths: [
  "Assets/aymeric/aymeric-leaf-autumn.png",
  "Assets/aymeric/aymeric-perfume.png",  // when available
],
```

Use transparent backgrounds for best results over the webcam.

---

## 10. Quick debug

- Run: `npm start` → http://127.0.0.1:5173/
- Add `?debug=1` to the URL for FPS, particle counts, profile seed, dot edge mode, and face collision style.

---

*Generated for the Augmented Face prototype — `sketch.js` is the source of truth for numeric values.*

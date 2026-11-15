# StoneGuard — Kidney-Stone Risk Coach for Astronauts

NASA Space Apps Challenge 2026, challenge CH-05: "Create Health Monitoring
Software for Astronauts on Space Missions".

**One question:** "What do I drink and eat today so I don't form a stone — and
am I at risk right now?"

StoneGuard is a daily, offline-first stone-risk coach. The crew member logs
water, urine colour (1–5), salt/calcium, exercise (ARED), and sleep in about
a minute a day. The app returns a daily stone-risk state (GREEN / AMBER / RED)
plus a concrete timed plan for today — e.g. "Drink 500 ml more before 14:00,
calcium with meals, salt only after your ARED session" — not a tip. Three
amber days in a row flags the Crew Medical Officer.

## What it is

- **Offline-first PWA:** Vite + React + TypeScript, Tailwind CSS, IndexedDB
  (on-device storage), service worker caching the app shell. No cloud call
  in the decision path — it works in airplane mode.
- **Transparent rules, no ML:** the "model" is plain TypeScript in
  `src/lib/score.ts`. Every point has a named driver and a published source,
  shown on screen. The score is a *relative* risk vs the person's own
  baseline, not a clinical probability.
- **FHIR-shaped JSON:** every logged value is also expressible as a FHIR
  Observation (see `src/lib/types.ts`). This is JSON-shaped like FHIR — not
  a claim of FHIR compliance or certification.
- **Decision support, not a diagnosis:** the app never names a disease or a
  drug dose. RED routes to the Crew Medical Officer.

## Data — what is real, what is simulated

**Real (pre-bundled as static JSON in `src/data/baselines.json`, no live
fetch at runtime):**

- OSDR / GeneLab kidney-dysfunction studies in spaceflight — the evidence
  base that kidney function changes in space.
- NLSP / HRP Standard Measures variable list — defines the logged variables
  (fluid intake, urine output, body mass, exercise dose).
- HRP bone/calcium magnitudes — bone loss 1–2% per month without
  countermeasures; released calcium enters blood and urine, which is the
  mechanism linking bone to kidney stones.

**Simulated:** the crew of 4 is generated from published ranges (water
1,400–2,800 ml/day, sleep ~6.09 h ISS average, ARED 0–120 min) and is
labelled **SIMULATED** everywhere in the app and in the code. No real
astronaut records are used — individual astronaut health records are not
open (Privacy Act / IRB). **No stone-incidence rate is quoted anywhere** —
none is established in the sources used.

## Scoring rules (src/lib/score.ts)

| Driver | Points |
|---|---|
| Hydration vs own baseline (ratio ≥1.0 / 0.8–1.0 / 0.6–0.8 / <0.6) | 0 / 1 / 2 / 3 |
| Urine colour 1–2 / 3 / 4 / 5 | 0 / 1 / 2 / 3 |
| Calcium-load proxy: ARED ≥60 min and water <90% of baseline | +1 |
| Sleep < 6 h | +1 |
| Salt 'high' | +1 |
| Calcium with meals (protective) | −1 (floor 0) |
| Personal stone history (tighter thresholds) | +1 |

Thresholds (no stone history): 0–2 GREEN, 3–4 AMBER, 5+ RED.
Thresholds (stone history): 0–1 GREEN, 2–3 AMBER, 4+ RED.
3+ consecutive AMBER days flags the CMO.

## How to run

```bash
npm install
npm run dev      # local development
npm run build    # production build (output: dist/)
npm run preview  # serve the production build locally
```

## Deploy to Vercel

1. In Vercel, **Add New → Project → Import** the `RajabDildar/stoneguard` repo.
2. Framework preset: **Vite**.
3. Build command: `npm run build`. Output directory: `dist`.
4. Deploy. No environment variables are needed. The app is a static PWA;
   the service worker (`public/sw.js`) caches the app shell for offline use.

## Technology / sponsors used

- Vite + React + TypeScript, Tailwind CSS, IndexedDB, hand-drawn SVG.
- Microsoft GitHub Copilot (Free plan) for code completion while building.
- No Azure / Google Cloud in the runtime path — a static host is enough.

## Limits, stated honestly

- Decision support, not a diagnosis.
- Score is relative to the individual's baseline, not a clinical probability.
- No stone-incidence rate is quoted, because none is established in the
  sources used.
- Simulated crew data is labelled as simulated.
- DONKI space weather is not an input to this app.

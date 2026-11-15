import { useEffect, useMemo, useState } from 'react'
import { CREW, generateHistory } from './lib/crew'
import { scoreDay } from './lib/score'
import { loadLogs, saveLog } from './lib/store'
import type { CrewMember, DailyLog, DayScore, RiskState } from './lib/types'

const STATE_STYLE: Record<RiskState, { bg: string; label: string; text: string }> = {
  GREEN: { bg: 'bg-green-600', label: 'GREEN — low risk', text: 'You are on track today.' },
  AMBER: { bg: 'bg-amber-500', label: 'AMBER — stone risk', text: 'Risk is building. Follow today’s plan.' },
  RED: { bg: 'bg-red-600', label: 'RED — high risk', text: 'Notify the Crew Medical Officer today.' },
}

const URINE_COLOURS = ['#f7e98a', '#e8d44d', '#c9a227', '#8a6d1b', '#5c3d0e']

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function emptyLog(member: CrewMember, date: string): DailyLog {
  return {
    subject: `CrewMember/${member.id}`,
    date,
    waterMl: member.baselineWaterMl,
    urineColour: 2,
    urineVolume: 'normal',
    salt: 'normal',
    calciumWithMeals: true,
    aredMinutes: 60,
    sleepHours: 6.5,
  }
}

function scoreSeries(member: CrewMember, logs: DailyLog[]): DayScore[] {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date))
  const out: DayScore[] = []
  let streak = 0
  for (const log of sorted) {
    const s = scoreDay(member, log, streak)
    streak = s.amberStreak
    out.push(s)
  }
  return out
}

export default function App() {
  const [crewId, setCrewId] = useState('crew-1')
  const [allLogs, setAllLogs] = useState<DailyLog[]>([])
  const [loaded, setLoaded] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [kidneyInfo, setKidneyInfo] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const member = CREW.find((c) => c.id === crewId) ?? CREW[0]
  const today = todayIso()

  // Load stored logs; seed the simulated 14-day history on first run.
  useEffect(() => {
    loadLogs().then(async (stored) => {
      if (stored.length === 0) {
        const seeded: DailyLog[] = []
        for (const m of CREW) {
          for (const log of generateHistory(m, today)) {
            seeded.push(log)
            await saveLog(log)
          }
        }
        setAllLogs(seeded)
      } else {
        setAllLogs(stored)
      }
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const memberLogs = useMemo(
    () => allLogs.filter((l) => l.subject === `CrewMember/${member.id}`),
    [allLogs, member],
  )
  const scores = useMemo(() => scoreSeries(member, memberLogs), [member, memberLogs])
  const todayLog = memberLogs.find((l) => l.date === today) ?? emptyLog(member, today)
  const [form, setForm] = useState<DailyLog>(todayLog)

  // Keep the form in sync with the selected crew's stored/seeded log — on
  // first load AND when the crew changes. (The form is initialised once
  // from an empty log list, so without this the first paint would show the
  // hard-coded defaults instead of the crew's real seeded log.)
  // memberLogs/member/today are intentionally not deps: they only change
  // when allLogs or crewId change, and a save must not wipe the form.
  useEffect(() => {
    if (!loaded) return
    setForm(memberLogs.find((l) => l.date === today) ?? emptyLog(member, today))
    setSavedMsg('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, crewId])

  const todayScore = useMemo(() => {
    const prior = scores.filter((s) => s.date < today)
    const streak = prior.length > 0 ? prior[prior.length - 1].amberStreak : 0
    return scoreDay(member, form, streak)
  }, [member, form, scores, today])

  // Has the form been edited since the stored log for today? The trend
  // list scores the stored log, so an edited-but-unsaved form is a draft.
  const storedToday = memberLogs.find((l) => l.date === today)
  const isDirty = useMemo(() => {
    const base = storedToday ?? emptyLog(member, today)
    return (
      (['waterMl', 'urineColour', 'urineVolume', 'salt', 'calciumWithMeals', 'aredMinutes', 'sleepHours'] as const).some(
        (k) => form[k] !== base[k],
      )
    )
  }, [form, storedToday, member, today])

  const save = async () => {
    await saveLog(form)
    setAllLogs((prev) => {
      const rest = prev.filter((l) => !(l.subject === form.subject && l.date === form.date))
      return [...rest, form]
    })
    setSavedMsg('Saved on this device — no internet needed.')
  }

  const set = <K extends keyof DailyLog>(key: K, value: DailyLog[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  if (!loaded) {
    return <div className="p-6 text-slate-600">Loading StoneGuard…</div>
  }

  const state = STATE_STYLE[todayScore.state]
  const last14 = scores.slice(-14)

  // Trend chart geometry (water ml vs baseline).
  const W = 560
  const H = 120
  const maxMl = Math.max(member.baselineWaterMl * 1.2, ...memberLogs.map((l) => l.waterMl))
  const pts = last14
    .map((s, i) => {
      const log = memberLogs.find((l) => l.date === s.date)
      const x = last14.length > 1 ? (i / (last14.length - 1)) * (W - 20) + 10 : W / 2
      const y = H - 15 - ((log?.waterMl ?? 0) / maxMl) * (H - 30)
      return `${x},${y}`
    })
    .join(' ')
  const baselineY = H - 15 - (member.baselineWaterMl / maxMl) * (H - 30)

  return (
    <div className="min-h-screen">
      <header className="bg-[#0f2a43] text-white px-4 py-4">
        <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-2 justify-between">
          <div>
            <h1 className="text-2xl font-bold">StoneGuard</h1>
            <p className="text-sm text-sky-200">Kidney-stone risk coach for astronauts · CH-05</p>
          </div>
          <div className="flex gap-2 text-xs font-semibold">
            <span className={`px-2 py-1 rounded ${online ? 'bg-green-600' : 'bg-amber-500'}`}>
              {online ? '● Online' : '● Offline — app still works'}
            </span>
            <span className="px-2 py-1 rounded bg-sky-700">SIMULATED crew</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <p className="text-xs text-slate-500">
          Decision support, not a diagnosis. This app never names a disease or a drug dose —
          RED routes to the Crew Medical Officer. All crew data below is <strong>SIMULATED</strong>,
          generated from published ranges. No real astronaut records are used.
        </p>

        {/* Crew picker */}
        <section className="bg-white rounded-xl shadow p-4">
          <label className="text-sm font-semibold">Crew member (SIMULATED)</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {CREW.map((c) => (
              <button
                key={c.id}
                onClick={() => setCrewId(c.id)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border ${c.id === crewId ? 'bg-[#0f2a43] text-white border-[#0f2a43]' : 'bg-white border-slate-300'
                  }`}
              >
                {c.name} · {c.role}
                {c.stoneHistory ? ' · stone history' : ''}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Baseline water: {member.baselineWaterMl} ml/day · Stone history:{' '}
            {member.stoneHistory ? 'yes — thresholds are tighter' : 'no'}
          </p>
        </section>

        {/* Risk card */}
        <section className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-bold">Today — {today}</h2>
          <div className={`${state.bg} text-white rounded-lg px-4 py-3 mt-2`}>
            <div className="text-xl font-bold">{state.label}</div>
            <div className="text-sm">{state.text}</div>
            <div className="text-xs opacity-90 mt-1">Score: {todayScore.points} {todayScore.points === 1 ? 'point' : 'points'} · relative risk vs your own baseline</div>
            <div className="text-xs opacity-90 mt-1">
              Thresholds: {member.stoneHistory ? 'GREEN 0–1 · AMBER 2–3 · RED 4+ (stone history — tighter)' : 'GREEN 0–2 · AMBER 3–4 · RED 5+ (no stone history)'}
            </div>
          </div>
          {todayScore.cmoFlag && (
            <p className="mt-2 text-sm font-semibold text-red-700">
              ⚠ CMO flagged — {todayScore.state === 'RED' ? 'RED state.' : 'AMBER for 3 days in a row.'} Notify the
              Crew Medical Officer today.
            </p>
          )}
          <h3 className="font-semibold mt-3">Today’s plan</h3>
          <ul className="list-disc ml-5 text-sm space-y-1">
            {todayScore.plan.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <details className="mt-3 text-sm">
            <summary className="font-semibold cursor-pointer">Why this score? (every point, with its source)</summary>
            <ul className="list-disc ml-5 mt-2 space-y-2">
              {todayScore.reasons.map((r) => (
                <li key={r.driver}>
                  <strong>{r.driver}:</strong> {r.detail}
                  <br />
                  <span className="text-xs text-slate-500">Source: {r.source}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>

        {/* Daily log */}
        <section className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-bold">Daily log — 1 minute</h2>
          <p className="text-xs text-slate-500">Log today’s values, then save. Everything is stored on this device (IndexedDB).</p>

          <label className="block mt-3 text-sm font-semibold">
            Water drunk today: {form.waterMl} ml (baseline {member.baselineWaterMl} ml)
            <input
              type="range"
              min={0}
              max={4000}
              step={50}
              value={form.waterMl}
              onChange={(e) => set('waterMl', Number(e.target.value))}
              className="w-full"
            />
          </label>

          <div className="mt-3">
            <span className="text-sm font-semibold">Urine colour (tap one)</span>
            <div className="flex gap-2 mt-1">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => set('urineColour', n)}
                  className={`w-10 h-10 rounded-full border-2 text-sm font-bold ${form.urineColour === n ? 'border-black scale-110' : 'border-slate-300'
                    }`}
                  style={{ background: URINE_COLOURS[n - 1] }}
                  aria-label={`Urine colour ${n}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">1 = pale, 5 = dark. Darker means more concentrated urine.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="text-sm font-semibold">
              Urine volume
              <select
                value={form.urineVolume}
                onChange={(e) => set('urineVolume', e.target.value as DailyLog['urineVolume'])}
                className="block w-full mt-1 border rounded px-2 py-1"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              Salt at meals
              <select
                value={form.salt}
                onChange={(e) => set('salt', e.target.value as DailyLog['salt'])}
                className="block w-full mt-1 border rounded px-2 py-1"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="text-sm font-semibold">
              ARED exercise (min)
              <input
                type="number"
                min={0}
                max={180}
                value={form.aredMinutes}
                onChange={(e) => set('aredMinutes', Number(e.target.value))}
                className="block w-full mt-1 border rounded px-2 py-1"
              />
            </label>
            <label className="text-sm font-semibold">
              Sleep last night (h)
              <input
                type="number"
                min={0}
                max={12}
                step={0.5}
                value={form.sleepHours}
                onChange={(e) => set('sleepHours', Math.round(Number(e.target.value) * 10) / 10)}
                className="block w-full mt-1 border rounded px-2 py-1"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 mt-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.calciumWithMeals}
              onChange={(e) => set('calciumWithMeals', e.target.checked)}
            />
            Calcium taken with meals (protective)
          </label>

          <button
            onClick={save}
            className="mt-4 w-full bg-[#0f5e8a] text-white font-bold py-2 rounded-lg"
          >
            Save today’s log
          </button>
          {savedMsg && <p className="text-sm text-green-700 mt-2">{savedMsg}</p>}
        </section>

        {/* Trend */}
        <section className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-bold">14-day trend</h2>
          <p className="text-xs text-slate-500">
            Water vs your baseline (dashed line) and the daily risk state. A bad week forming is visible
            before any single bad day.
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2" role="img" aria-label="14-day water intake trend">
            <line x1={0} y1={baselineY} x2={W} y2={baselineY} stroke="#0f5e8a" strokeDasharray="5 4" />
            <text x={W - 4} y={baselineY - 5} textAnchor="end" fontSize="11" fill="#0f5e8a">
              baseline {member.baselineWaterMl} ml
            </text>
            <polyline points={pts} fill="none" stroke="#0f2a43" strokeWidth={2} />
            {last14.map((s, i) => {
              const log = memberLogs.find((l) => l.date === s.date)
              const x = last14.length > 1 ? (i / (last14.length - 1)) * (W - 20) + 10 : W / 2
              const y = H - 15 - ((log?.waterMl ?? 0) / maxMl) * (H - 30)
              const fill = s.state === 'RED' ? '#dc2626' : s.state === 'AMBER' ? '#d97706' : '#16a34a'
              return (
                <circle key={s.date} cx={x} cy={y} r={5} fill={fill}>
                  <title>
                    {s.date}: {log?.waterMl ?? '?'} ml water, {s.state}, {s.points}{' '}
                    {s.points === 1 ? 'point' : 'points'}
                  </title>
                </circle>
              )
            })}
          </svg>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{last14[0]?.date}</span>
            <span>water (ml) vs baseline</span>
            <span>{last14[last14.length - 1]?.date}</span>
          </div>
          <div className="flex gap-4 text-xs mt-1">
            <span><span className="inline-block w-3 h-3 rounded-full bg-green-600 align-middle" /> GREEN</span>
            <span><span className="inline-block w-3 h-3 rounded-full bg-amber-500 align-middle" /> AMBER</span>
            <span><span className="inline-block w-3 h-3 rounded-full bg-red-600 align-middle" /> RED</span>
            <span className="text-slate-500">— dashed: your baseline water</span>
          </div>
          <div className="mt-2 space-y-1">
            {[...last14].reverse().map((s) => (
              <div key={s.date} className="flex justify-between text-sm border-b pb-1">
                <span>{s.date}</span>
                <span className="font-semibold">{s.state}</span>
                {s.date === today && isDirty ? (
                  <span className="text-amber-600 font-semibold">Unsaved changes</span>
                ) : (
                  <span className="text-slate-500">
                    {s.points} {s.points === 1 ? 'pt' : 'pts'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Body figure — simple, static */}
        <section className="bg-white rounded-xl shadow p-4">
          <h2 className="text-lg font-bold">Body figure — tap the kidneys</h2>
          <div className="flex gap-4 items-start">
            <svg
              viewBox="0 0 240 420"
              className="w-64 shrink-0 select-none"
              role="img"
              aria-label="Human figure — tap the kidneys"
            >
              <defs>
                {/* 3D Volumetric Body Silhouette Gradient */}
                <linearGradient id="sgBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#e2e8f0" />
                  <stop offset="45%" stopColor="#cbd5e1" />
                  <stop offset="100%" stopColor="#94a3b8" />
                </linearGradient>

                {/* Inner Torso Cavity Depth Gradient */}
                <radialGradient id="sgCavityGrad" cx="50%" cy="48%" r="52%">
                  <stop offset="0%" stopColor="#0f172a" stopOpacity="0.18" />
                  <stop offset="70%" stopColor="#1e293b" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#334155" stopOpacity="0" />
                </radialGradient>

                {/* 3D Left Kidney Volumetric Radial Gradient */}
                <radialGradient id="sgKidneyGradL" cx="35%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#f87171" />
                  <stop offset="28%" stopColor="#dc2626" />
                  <stop offset="68%" stopColor="#991b1b" />
                  <stop offset="100%" stopColor="#450a0a" />
                </radialGradient>

                {/* 3D Right Kidney Volumetric Radial Gradient */}
                <radialGradient id="sgKidneyGradR" cx="65%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#f87171" />
                  <stop offset="28%" stopColor="#dc2626" />
                  <stop offset="68%" stopColor="#991b1b" />
                  <stop offset="100%" stopColor="#450a0a" />
                </radialGradient>

                {/* Adrenal Gland 3D Gradient */}
                <linearGradient id="sgAdrenalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fde68a" />
                  <stop offset="60%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#b45309" />
                </linearGradient>

                {/* Vascular Gradients (Aorta & Vena Cava) */}
                <linearGradient id="sgAortaGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#991b1b" />
                  <stop offset="50%" stopColor="#ef4444" />
                  <stop offset="100%" stopColor="#7f1d1d" />
                </linearGradient>
                <linearGradient id="sgVenaGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#1e3a8a" />
                  <stop offset="50%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#172554" />
                </linearGradient>

                {/* Soft 3D Organ & Silhouette Elevation Shadows */}
                <filter id="sgOrganShadow" x="-25%" y="-25%" width="150%" height="150%">
                  <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#0f172a" floodOpacity="0.38" />
                </filter>
                <filter id="sgBodyShadow" x="-10%" y="-5%" width="120%" height="112%">
                  <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0f2a43" floodOpacity="0.16" />
                </filter>
              </defs>

              {/* 1. Anatomical 3D Human Body Silhouette */}
              <g filter="url(#sgBodyShadow)">
                {/* Head & Cranium */}
                <path
                  d="M120 12 C136 12 146 24 145 40 C144 54 136 66 120 66 C104 66 96 54 95 40 C94 24 104 12 120 12 Z"
                  fill="url(#sgBodyGrad)"
                  stroke="#0f2a43"
                  strokeWidth={2}
                />
                {/* Torso, Shoulders, Arms, Pelvis & Legs */}
                <path
                  d="M108 65 L106 76 C92 80 68 85 58 98 C49 110 45 135 42 168 C40 188 38 206 43 212 C48 216 54 208 57 190 L65 132 L72 132 C73 154 78 175 78 195 C78 212 72 228 73 248 L75 330 C76 362 78 388 80 400 C82 408 92 408 96 400 C100 385 104 352 106 320 L112 258 L128 258 L134 320 C136 352 140 385 144 400 C148 408 158 408 160 400 C162 388 164 362 165 330 L167 248 C168 228 162 212 162 195 C162 175 167 154 168 132 L175 132 L183 190 C186 208 192 216 197 212 C202 206 200 188 198 168 C195 135 191 110 182 98 C172 85 148 80 134 76 L132 65 Z"
                  fill="url(#sgBodyGrad)"
                  stroke="#0f2a43"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              </g>

              {/* 3D Specular Rim Highlight on Silhouette */}
              <path
                d="M100 24 C104 16 112 15 120 15 M62 102 C54 114 50 140 47 170 M82 140 C84 168 84 195 80 230"
                fill="none"
                stroke="#ffffff"
                strokeWidth={1.8}
                strokeLinecap="round"
                opacity={0.55}
              />

              {/* 2. Retroperitoneal Cavity & Skeletal Landmarks */}
              <ellipse cx={120} cy={186} rx={42} ry={58} fill="url(#sgCavityGrad)" />

              {/* Vertebral Column (T11 - L4) */}
              <g opacity={0.22} fill="#0f2a43">
                <rect x={115} y={122} width={10} height={7} rx={2} />
                <rect x={115} y={132} width={10} height={8} rx={2} />
                <rect x={114} y={143} width={12} height={9} rx={2} />
                <rect x={114} y={155} width={12} height={10} rx={2} />
                <rect x={113} y={168} width={14} height={10} rx={2.5} />
                <rect x={113} y={181} width={14} height={10} rx={2.5} />
                <rect x={113} y={194} width={14} height={10} rx={2.5} />
                <rect x={113} y={207} width={14} height={10} rx={2.5} />
                <rect x={114} y={220} width={12} height={9} rx={2} />
              </g>

              {/* Lower Ribcage Arcs (T10 - T12) */}
              <g fill="none" stroke="#475569" strokeWidth={1.6} strokeLinecap="round" opacity={0.3}>
                <path d="M114 130 C96 132 82 142 78 156" />
                <path d="M126 130 C144 132 158 142 162 156" />
                <path d="M114 142 C98 144 85 154 81 166" />
                <path d="M126 142 C142 144 155 154 159 166" />
                <path d="M114 154 C102 156 90 163 86 172" />
                <path d="M126 154 C138 156 150 163 154 172" />
              </g>

              {/* 3. Vascular System (Inferior Vena Cava, Aorta & Renal Vessels) */}
              <path
                d="M115 128 L115 224 L103 242 M115 224 L123 242"
                fill="none"
                stroke="url(#sgVenaGrad)"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M125 126 L125 224 L115 242 M125 224 L137 242"
                fill="none"
                stroke="url(#sgAortaGrad)"
                strokeWidth={5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M100 185 L125 181" stroke="#dc2626" strokeWidth={3.2} strokeLinecap="round" />
              <path d="M125 176 L142 179" stroke="#dc2626" strokeWidth={3.2} strokeLinecap="round" />
              <path d="M100 189 L115 186" stroke="#2563eb" strokeWidth={3.5} strokeLinecap="round" />
              <path d="M115 181 L142 184" stroke="#2563eb" strokeWidth={3.5} strokeLinecap="round" />

              {/* 4. Ureters & Urinary Bladder */}
              <path
                d="M102 191 C106 210 109 230 113 252"
                fill="none"
                stroke="#d97706"
                strokeWidth={2.2}
                strokeLinecap="round"
                opacity={0.85}
              />
              <path
                d="M138 185 C134 206 131 228 127 252"
                fill="none"
                stroke="#d97706"
                strokeWidth={2.2}
                strokeLinecap="round"
                opacity={0.85}
              />
              <path
                d="M108 250 C108 244 132 244 132 250 C134 260 127 268 120 270 C113 268 106 260 108 250 Z"
                fill="#f59e0b"
                fillOpacity={0.35}
                stroke="#b45309"
                strokeWidth={1.5}
              />

              {/* 5. Animated Tap-Indicator Pulse Rings */}
              <ellipse
                cx={91}
                cy={186}
                rx={20}
                ry={28}
                fill="none"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.65}
              >
                <animate attributeName="rx" values="18;24;18" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="ry" values="26;32;26" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0.15;0.7" dur="2.4s" repeatCount="indefinite" />
              </ellipse>
              <ellipse
                cx={149}
                cy={180}
                rx={20}
                ry={28}
                fill="none"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.65}
              >
                <animate attributeName="rx" values="18;24;18" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="ry" values="26;32;26" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.7;0.15;0.7" dur="2.4s" repeatCount="indefinite" />
              </ellipse>

              {/* 6. Realistic 3D Bean-Shaped Kidneys */}
              {/* Right Kidney (Viewer's Left — anatomically slightly lower due to liver) */}
              <g
                filter="url(#sgOrganShadow)"
                onClick={() => setKidneyInfo(true)}
                style={{ cursor: 'pointer' }}
              >
                <path
                  d="M84 162 C86 155 96 155 100 162 C95 164 88 164 84 162 Z"
                  fill="url(#sgAdrenalGrad)"
                  stroke="#92400e"
                  strokeWidth={1}
                />
                <path
                  d="M98 163 C84 161 74 172 75 187 C76 202 85 213 98 210 C104 208 106 201 103 195 C100 191 98 189 98 186 C98 183 100 181 103 177 C106 171 104 164 98 163 Z"
                  fill="url(#sgKidneyGradL)"
                  stroke="#450a0a"
                  strokeWidth={1.8}
                />
                <path
                  d="M88 168 C81 173 79 182 80 193"
                  fill="none"
                  stroke="#fecaca"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  opacity={0.65}
                />
                <path
                  d="M101 179 C97 183 97 189 101 193"
                  fill="none"
                  stroke="#fca5a5"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  opacity={0.5}
                />
              </g>

              {/* Left Kidney (Viewer's Right — anatomically slightly higher) */}
              <g
                filter="url(#sgOrganShadow)"
                onClick={() => setKidneyInfo(true)}
                style={{ cursor: 'pointer' }}
              >
                <path
                  d="M156 156 C154 149 144 149 140 156 C145 158 152 158 156 156 Z"
                  fill="url(#sgAdrenalGrad)"
                  stroke="#92400e"
                  strokeWidth={1}
                />
                <path
                  d="M142 157 C156 155 166 166 165 181 C164 196 155 207 142 204 C136 202 134 195 137 189 C140 185 142 183 142 180 C142 177 140 175 137 171 C134 165 136 158 142 157 Z"
                  fill="url(#sgKidneyGradR)"
                  stroke="#450a0a"
                  strokeWidth={1.8}
                />
                <path
                  d="M152 162 C159 167 161 176 160 187"
                  fill="none"
                  stroke="#fecaca"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  opacity={0.65}
                />
                <path
                  d="M139 173 C143 177 143 183 139 187"
                  fill="none"
                  stroke="#fca5a5"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  opacity={0.5}
                />
              </g>

              {/* 7. Transparent Hit Areas Around Each Kidney */}
              <ellipse
                cx={91}
                cy={186}
                rx={30}
                ry={38}
                fill="transparent"
                onClick={() => setKidneyInfo(true)}
                style={{ cursor: 'pointer' }}
              />
              <ellipse
                cx={149}
                cy={180}
                rx={30}
                ry={38}
                fill="transparent"
                onClick={() => setKidneyInfo(true)}
                style={{ cursor: 'pointer' }}
              />
            </svg>
            <div className="text-sm">
              {kidneyInfo ? (
                <>
                  <p className="font-semibold">Kidneys — the fluid / bone story</p>
                  <p className="mt-1">
                    In space, unloaded bones release calcium into blood and urine (HRP: bone loss
                    1–2% per month). At the same time astronauts drink less, so urine gets
                    concentrated — and concentrated, calcium-rich urine is where stones form.
                    That is why this app tracks water, urine colour, and exercise together.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Source: NASA HRP 5 Hazards; OSDR / GeneLab kidney-dysfunction studies.
                  </p>
                </>
              ) : (
                <p>Tap the red kidneys to see why bone, water, and stones are one story.</p>
              )}
            </div>
          </div>
        </section>

        {/* Privacy + data */}
        <section className="bg-white rounded-xl shadow p-4 text-sm">
          <h2 className="text-lg font-bold">Privacy &amp; data</h2>
          <ul className="list-disc ml-5 space-y-1 mt-1">
            <li>Your data stays on this device (IndexedDB). No account, no cloud call.</li>
            <li>You see your own full data. A Crew Medical Officer sees a crew summary. Earth sees only consented aggregates.</li>
            <li>Real-data references are bundled in the app: OSDR / GeneLab kidney studies, NLSP Standard Measures variables, HRP bone loss 1–2%/month.</li>
            <li>Crew data is SIMULATED, generated from published ranges. No real astronaut records are used — they are not open.</li>
            <li>Score is a relative risk vs your own baseline, not a clinical probability. No stone-incidence rate is claimed.</li>
          </ul>
        </section>
      </main>

      <footer className="max-w-3xl mx-auto px-4 pb-6 text-xs text-slate-500">
        StoneGuard · NASA Space Apps Challenge 2026, CH-05 · Offline-first PWA · Works in airplane mode ·
        Decision support, not a diagnosis.
      </footer>
    </div>
  )
}

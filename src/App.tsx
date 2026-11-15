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
                className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                  c.id === crewId ? 'bg-[#0f2a43] text-white border-[#0f2a43]' : 'bg-white border-slate-300'
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
                  className={`w-10 h-10 rounded-full border-2 text-sm font-bold ${
                    form.urineColour === n ? 'border-black scale-110' : 'border-slate-300'
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
            <svg viewBox="0 0 120 220" className="w-64 shrink-0" role="img" aria-label="Human figure — tap the kidneys">
              <circle cx={60} cy={22} r={16} fill="#cbd5e1" stroke="#0f2a43" />
              <rect x={42} y={42} width={36} height={90} rx={16} fill="#cbd5e1" stroke="#0f2a43" />
              <rect x={38} y={132} width={18} height={80} rx={8} fill="#cbd5e1" stroke="#0f2a43" />
              <rect x={64} y={132} width={18} height={80} rx={8} fill="#cbd5e1" stroke="#0f2a43" />
              {/* Transparent hit areas around each kidney — a much bigger tap target than the visible shape. */}
              <ellipse cx={48} cy={96} rx={20} ry={26} fill="transparent" onClick={() => setKidneyInfo(true)} style={{ cursor: 'pointer' }} />
              <ellipse cx={72} cy={96} rx={20} ry={26} fill="transparent" onClick={() => setKidneyInfo(true)} style={{ cursor: 'pointer' }} />
              <ellipse
                cx={48}
                cy={96}
                rx={14}
                ry={20}
                fill="#b91c1c"
                stroke="#7f1d1d"
                strokeWidth={2}
                onClick={() => setKidneyInfo(true)}
                style={{ cursor: 'pointer' }}
              />
              <ellipse
                cx={72}
                cy={96}
                rx={14}
                ry={20}
                fill="#b91c1c"
                stroke="#7f1d1d"
                strokeWidth={2}
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

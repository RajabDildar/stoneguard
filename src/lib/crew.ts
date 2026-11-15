import type { CrewMember, DailyLog } from './types'

/**
 * SIMULATED crew of 4. No real astronaut records are used — individual
 * astronaut health records are not open (Privacy Act / IRB). These crew
 * members are generated deterministically from published ranges:
 *  - water intake ~1,400–2,800 ml/day
 *  - sleep ~5.0–7.5 h (ISS average 6.09 h, Barger et al. 2014)
 *  - ARED exercise 0–120 min/day
 *  - urine colour 1–5
 * Every simulated value is labelled SIMULATED in the app and in this file.
 */

export const CREW: CrewMember[] = [
  { id: 'crew-1', name: 'A. Reyes', role: 'Commander', baselineWaterMl: 2500, baselineUrineColour: 2, stoneHistory: false, simulated: true },
  { id: 'crew-2', name: 'M. Chen', role: 'Flight Engineer', baselineWaterMl: 2300, baselineUrineColour: 2, stoneHistory: true, simulated: true },
  { id: 'crew-3', name: 'S. Okafor', role: 'Science Officer', baselineWaterMl: 2700, baselineUrineColour: 1, stoneHistory: false, simulated: true },
  { id: 'crew-4', name: 'L. Novak', role: 'Crew Medical Officer', baselineWaterMl: 2400, baselineUrineColour: 2, stoneHistory: false, simulated: true },
]

/** Deterministic PRNG (mulberry32) so the demo history is stable. */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Generate 14 days of simulated logs ending on `endDate` (ISO date). */
export function generateHistory(member: CrewMember, endDate: string, days = 14): DailyLog[] {
  const seed = [...member.id].reduce((s, c) => s + c.charCodeAt(0), 7)
  const rand = rng(seed)
  const end = new Date(`${endDate}T12:00:00Z`)
  const logs: DailyLog[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end)
    d.setUTCDate(d.getUTCDate() - i)
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    // Crew-2 (stone history) trends drier over the last 3 days — the demo story.
    const drySpell = member.id === 'crew-2' && i < 3
    // Round to the 50 ml slider step, so the value shown always matches
    // the value the slider holds.
    const waterMl =
      Math.round(
        ((drySpell ? 0.55 + rand() * 0.15 : 0.75 + rand() * 0.35) * member.baselineWaterMl) / 50,
      ) * 50
    logs.push({
      subject: `CrewMember/${member.id}`,
      date,
      waterMl,
      urineColour: (drySpell ? 4 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 4)) as 1 | 2 | 3 | 4 | 5,
      urineVolume: waterMl < member.baselineWaterMl * 0.7 ? 'low' : 'normal',
      salt: rand() < 0.3 ? 'high' : 'normal',
      calciumWithMeals: rand() < 0.7,
      aredMinutes: Math.round(30 + rand() * 90),
      sleepHours: Math.round((5 + rand() * 2.5) * 10) / 10,
    })
  }
  return logs
}

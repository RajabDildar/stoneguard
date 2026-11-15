import type { CrewMember, DailyLog, DayScore, RiskState } from './types'

/**
 * StoneGuard scoring — transparent rules in plain TypeScript. No ML, no
 * black box. Every point has a named driver and a published source.
 *
 * The score is a RELATIVE risk vs the person's own baseline, not a clinical
 * probability. No stone-incidence rate is quoted anywhere — none is
 * established in the sources used.
 *
 * Points:
 *  - Hydration vs own baseline: ratio >= 1.0 → 0; 0.8–1.0 → 1; 0.6–0.8 → 2; < 0.6 → 3
 *  - Urine colour 1–2 → 0; 3 → 1; 4 → 2; 5 → 3
 *  - Calcium-load proxy: ARED >= 60 min AND water < 90% of baseline → +1.
 *    Exercise drives bone calcium release (HRP: bone loss 1–2%/month);
 *    labelled as a proxy, not a measured calcium value.
 *  - Sleep < 6 h → +1 (sleep debt is linked to lower intake / worse habits)
 *  - Salt 'high' → +1
 *  - Calcium with meals → −1 (protective; total never below 0)
 *  - Stone history → +1 (thresholds are tighter, and the app says so)
 *
 * Thresholds (no stone history): 0–2 GREEN, 3–4 AMBER, 5+ RED.
 * Thresholds (stone history):     0–1 GREEN, 2–3 AMBER, 4+ RED.
 */

const SRC_HYDRATION = 'NLSP / HRP Standard Measures — fluid intake variable'
const SRC_URINE = 'NLSP / HRP Standard Measures — urine output variable'
const SRC_BONE =
  'NASA HRP — bone loss 1–2% per month without countermeasures; calcium released into blood and urine'
const SRC_SLEEP =
  'Barger et al., Lancet Neurology 2014 — ISS crew average 6.09 h sleep vs 8.5 h scheduled'
const SRC_KIDNEY =
  'OSDR / GeneLab — kidney dysfunction in spaceflight (OSDR paper, example discoveries)'

export function scoreDay(
  member: CrewMember,
  log: DailyLog,
  priorAmberStreak: number,
): DayScore {
  const reasons: DayScore['reasons'] = []
  let points = 0

  const ratio = log.waterMl / member.baselineWaterMl
  if (ratio >= 1) {
    reasons.push({
      driver: 'Hydration',
      detail: `Water ${log.waterMl} ml vs your baseline ${member.baselineWaterMl} ml — at or above baseline.`,
      source: SRC_HYDRATION,
    })
  } else if (ratio >= 0.8) {
    points += 1
    reasons.push({
      driver: 'Hydration',
      detail: `Water ${log.waterMl} ml is ${Math.round(ratio * 100)}% of your baseline — slightly low. +1 point.`,
      source: SRC_HYDRATION,
    })
  } else if (ratio >= 0.6) {
    points += 2
    reasons.push({
      driver: 'Hydration',
      detail: `Water ${log.waterMl} ml is ${Math.round(ratio * 100)}% of your baseline — low. +2 points.`,
      source: SRC_HYDRATION,
    })
  } else {
    points += 3
    reasons.push({
      driver: 'Hydration',
      detail: `Water ${log.waterMl} ml is ${Math.round(ratio * 100)}% of your baseline — well below it. +3 points.`,
      source: SRC_HYDRATION,
    })
  }

  if (log.urineColour <= 2) {
    reasons.push({
      driver: 'Urine colour',
      detail: `Colour ${log.urineColour}/5 (pale) — well hydrated.`,
      source: SRC_URINE,
    })
  } else {
    const p = log.urineColour - 2
    points += p
    reasons.push({
      driver: 'Urine colour',
      detail: `Colour ${log.urineColour}/5 (dark) — urine is concentrated. +${p} points.`,
      source: SRC_URINE,
    })
  }

  if (log.aredMinutes >= 60 && ratio < 0.9) {
    points += 1
    reasons.push({
      driver: 'Calcium load (proxy)',
      detail: `${log.aredMinutes} min ARED with low water — exercise drives bone calcium release, and there is less fluid to dilute it. Labelled as a proxy, not a measured calcium value. +1 point.`,
      source: SRC_BONE,
    })
  }

  if (log.sleepHours < 6) {
    points += 1
    reasons.push({
      driver: 'Sleep',
      detail: `${log.sleepHours} h last night — under 6 h. +1 point.`,
      source: SRC_SLEEP,
    })
  }

  if (log.salt === 'high') {
    points += 1
    reasons.push({
      driver: 'Salt',
      detail: 'High salt at meals with low fluid — more solute to excrete. +1 point.',
      source: SRC_KIDNEY,
    })
  }

  if (log.calciumWithMeals) {
    points = Math.max(0, points - 1)
    reasons.push({
      driver: 'Calcium with meals',
      detail: 'Calcium taken with meals — protective. −1 point.',
      source: SRC_KIDNEY,
    })
  }

  if (member.stoneHistory) {
    points += 1
    reasons.push({
      driver: 'Stone history',
      detail: 'You have a personal history of stones, so thresholds are tighter. +1 point.',
      source: SRC_KIDNEY,
    })
  }

  const redAt = member.stoneHistory ? 4 : 5
  const amberAt = member.stoneHistory ? 2 : 3
  const state: RiskState = points >= redAt ? 'RED' : points >= amberAt ? 'AMBER' : 'GREEN'
  const amberStreak = state === 'AMBER' ? priorAmberStreak + 1 : 0
  const cmoFlag = amberStreak >= 3 || state === 'RED'

  const deficit = Math.max(0, member.baselineWaterMl - log.waterMl)
  const plan: string[] = []
  if (state === 'GREEN') {
    plan.push('Keep doing what you did today — you hit your baseline.')
    plan.push('Calcium with meals, salt only after your ARED session.')
  } else {
    if (deficit > 0) {
      const first = Math.min(500, deficit)
      plan.push(`Drink ${deficit} ml more today — ${first} ml by 14:00, the rest by 18:00.`)
    } else {
      plan.push('Water is on target — keep sipping through the afternoon.')
    }
    plan.push('Take calcium with meals, not on an empty stomach.')
    plan.push('Salt only after your ARED session, not before it.')
    if (state === 'AMBER') {
      plan.push('Re-check tomorrow — one amber day is a warning, not an emergency.')
    }
    if (state === 'RED') {
      plan.push('Notify the Crew Medical Officer today. Do not wait for tomorrow.')
    }
  }
  if (cmoFlag && state === 'AMBER') {
    plan.push('AMBER for 3 days in a row — the CMO has been flagged.')
  }

  return { date: log.date, points, state, reasons, cmoFlag, amberStreak, plan }
}

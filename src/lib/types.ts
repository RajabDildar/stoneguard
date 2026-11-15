// StoneGuard data model.
// Every health entry is shaped like a FHIR Observation (code, value, unit,
// effectiveDateTime, subject) — JSON-shaped like FHIR. This is NOT a claim
// of FHIR compliance or certification.

export type RiskState = 'GREEN' | 'AMBER' | 'RED'

export interface CrewMember {
  id: string
  name: string
  role: string
  /** Normal daily water intake, ml — the person's own pre-flight baseline. */
  baselineWaterMl: number
  /** Normal urine colour, 1 (pale) – 5 (dark). */
  baselineUrineColour: 1 | 2 | 3 | 4 | 5
  /** Personal history of kidney stones — thresholds are tighter if true. */
  stoneHistory: boolean
  /** Simulated crew are clearly labelled everywhere they appear. */
  simulated: boolean
}

export interface DailyLog {
  /** Composite key: "CrewMember/crew-1|2026-11-15". */
  id?: string
  /** FHIR-style: subject reference, e.g. "CrewMember/crew-1". */
  subject: string
  /** ISO date, e.g. "2026-11-15". */
  date: string
  /** Water drunk today, ml. */
  waterMl: number
  /** Urine colour, 1 (pale) – 5 (dark). */
  urineColour: 1 | 2 | 3 | 4 | 5
  /** Rough urine volume today: 'low' | 'normal' | 'high'. */
  urineVolume: 'low' | 'normal' | 'high'
  /** Salt at meals: 'low' | 'normal' | 'high'. */
  salt: 'low' | 'normal' | 'high'
  /** Calcium taken with meals (protective). */
  calciumWithMeals: boolean
  /** ARED resistive-exercise minutes today. */
  aredMinutes: number
  /** Sleep last night, hours. */
  sleepHours: number
}

/** One scored day, with the reasoning shown — never a black box. */
export interface DayScore {
  date: string
  points: number
  state: RiskState
  /** Per-driver explanation, each with its source. */
  reasons: { driver: string; detail: string; source: string }[]
  /** True when this is the 3rd (or later) amber day in a row — flag the CMO. */
  cmoFlag: boolean
  /** Consecutive amber days including today. */
  amberStreak: number
  /** Timed hydration plan for today. */
  plan: string[]
}

/** FHIR-shaped Observation for one logged value. */
export interface FhirObservation {
  resourceType: 'Observation'
  code: { text: string }
  subject: { reference: string }
  effectiveDateTime: string
  valueQuantity?: { value: number; unit: string }
  valueCodeableConcept?: { text: string }
}

export function toFhirObservations(log: DailyLog): FhirObservation[] {
  const at = `${log.date}T12:00:00Z`
  const obs = (code: string, value: number, unit: string): FhirObservation => ({
    resourceType: 'Observation',
    code: { text: code },
    subject: { reference: log.subject },
    effectiveDateTime: at,
    valueQuantity: { value, unit },
  })
  return [
    obs('Fluid intake — water', log.waterMl, 'mL'),
    obs('Urine colour (1 pale – 5 dark)', log.urineColour, 'score'),
    obs('Resistive exercise (ARED)', log.aredMinutes, 'min'),
    obs('Sleep duration', log.sleepHours, 'h'),
  ]
}

import type { DailyLog } from './types'

/**
 * On-device storage. IndexedDB first; if it is unavailable (private mode,
 * old browser), fall back to localStorage. Nothing ever leaves the device —
 * there is no cloud call in the decision path.
 */

const DB_NAME = 'stoneguard'
const STORE_NAME = 'daily-logs'
const LS_KEY = 'stoneguard:logs:v1'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function lsLoad(): DailyLog[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as DailyLog[]
  } catch {
    return []
  }
}

function lsSave(logs: DailyLog[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(logs))
  } catch {
    // Storage full or unavailable — the in-memory state still works.
  }
}

export async function loadLogs(): Promise<DailyLog[]> {
  try {
    const db = await openDb()
    return await new Promise<DailyLog[]>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).getAll()
      req.onsuccess = () => resolve((req.result as DailyLog[]).sort((a, b) => a.date.localeCompare(b.date)))
      req.onerror = () => resolve(lsLoad())
    })
  } catch {
    return lsLoad()
  }
}

export async function saveLog(log: DailyLog): Promise<void> {
  const entry: DailyLog = { ...log, id: `${log.subject}|${log.date}` }
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    const logs = lsLoad().filter((l) => l.id !== entry.id)
    logs.push(entry)
    lsSave(logs)
  }
}

export async function clearLogs(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    lsSave([])
  }
}

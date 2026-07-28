// One-time localStorage key migration for the CAEP → Finance Now rename (2026-07).
//
// Call at MODULE SCOPE in the file that owns the key, above any zustand
// `create()`/`persist()` call, so the copy happens before the store rehydrates.
// The old key is left in place deliberately: an older build running in another
// tab (or a rollback) keeps working, and the copy is idempotent — once the new
// key exists it is never overwritten.
export function migrateStorageKey(oldKey: string, newKey: string): void {
  if (typeof window === 'undefined') return
  try {
    if (window.localStorage.getItem(newKey) !== null) return
    const legacy = window.localStorage.getItem(oldKey)
    if (legacy !== null) window.localStorage.setItem(newKey, legacy)
  } catch { /* storage unavailable (SSR, private mode, quota) */ }
}

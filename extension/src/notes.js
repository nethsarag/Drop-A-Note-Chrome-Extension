// LOCAL-FIRST notes store.
// The UI reads/writes localStorage (instant, works offline).
// Firebase sync runs in the background via sync.js and never blocks the UI.

const key = (uid) => `dan:notes:${uid}`
const mem = {}
const subs = new Map()

function load(uid) {
  if (mem[uid]) return mem[uid]
  try { mem[uid] = JSON.parse(localStorage.getItem(key(uid))) || [] } catch { mem[uid] = [] }
  return mem[uid]
}
function persist(uid) {
  try { localStorage.setItem(key(uid), JSON.stringify(mem[uid])) } catch {}
}
function visible(uid) {
  return load(uid)
    .filter((n) => !n._del)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(({ _v, _dirty, _del, ...n }) => n)
}
function emit(uid) {
  const list = visible(uid)
  subs.get(uid)?.forEach((cb) => cb(list))
}

// Hooks used by sync.js
export const store = {
  onLocalChange: null,
  getDirty: (uid) => load(uid).filter((n) => n._dirty).map((n) => ({ ...n })),
  markSynced(uid, id, v) {
    const arr = load(uid)
    const i = arr.findIndex((n) => n.id === id)
    if (i < 0 || (arr[i]._v || 0) !== (v || 0)) return // edited again meanwhile; stays dirty
    if (arr[i]._del) arr.splice(i, 1)
    else delete arr[i]._dirty
    persist(uid)
  },
  applyRemote(uid, docs, removedIds, authoritativeIds) {
    const arr = load(uid)
    let changed = false
    for (const r of docs) {
      const n = arr.find((x) => x.id === r.id)
      if (n?._dirty) continue // local unsynced edit wins until it is pushed
      if (n) Object.assign(n, r)
      else arr.push({ ...r })
      changed = true
    }
    for (const id of removedIds) {
      const i = arr.findIndex((n) => n.id === id)
      if (i >= 0 && !arr[i]._dirty) { arr.splice(i, 1); changed = true }
    }
    if (authoritativeIds) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (!arr[i]._dirty && !authoritativeIds.has(arr[i].id)) { arr.splice(i, 1); changed = true }
      }
    }
    if (changed) { persist(uid); emit(uid) }
  }
}

function mutate(uid, fn) {
  fn(load(uid))
  persist(uid)
  emit(uid)
  store.onLocalChange?.()
}

export function newNoteId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20)
}

export function subscribeNotes(uid, callback) {
  if (!subs.has(uid)) subs.set(uid, new Set())
  subs.get(uid).add(callback)
  callback(visible(uid)) // instant, from local storage

  let cancelled = false
  let stop = null
  setTimeout(() => {
    import('./sync.js')
      .then((m) => { if (!cancelled) stop = m.startSync(uid, store) })
      .catch(() => {})
  }, 100) // let the popup paint first

  return () => {
    cancelled = true
    subs.get(uid)?.delete(callback)
    stop?.()
  }
}

export function saveNote(uid, id, { title, body }) {
  const now = Date.now()
  mutate(uid, (arr) => {
    let n = arr.find((x) => x.id === id)
    if (!n) { n = { id, title: '', body: '', pinned: false, createdAt: now }; arr.push(n) }
    Object.assign(n, { title, body, updatedAt: now, _dirty: true, _v: (n._v || 0) + 1 })
    delete n._del
  })
  return Promise.resolve()
}

export function deleteNote(uid, id) {
  return deleteMany(uid, [id])
}

export function setPinned(uid, ids, pinned) {
  mutate(uid, (arr) => {
    arr.forEach((n) => {
      if (ids.includes(n.id)) Object.assign(n, { pinned, _dirty: true, _v: (n._v || 0) + 1 })
    })
  })
  return Promise.resolve()
}

export function deleteMany(uid, ids) {
  mutate(uid, (arr) => {
    arr.forEach((n) => {
      if (ids.includes(n.id)) Object.assign(n, { _del: true, _dirty: true, _v: (n._v || 0) + 1 })
    })
  })
  return Promise.resolve()
}
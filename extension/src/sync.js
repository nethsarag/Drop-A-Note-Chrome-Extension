// Background Firebase sync. Loaded lazily AFTER the popup has painted.
import { collection, doc, onSnapshot, setDoc, deleteDoc, Timestamp } from 'firebase/firestore'
import { db } from './firebase.js'

const ms = (t, fallback) => (t?.toMillis ? t.toMillis() : fallback)

export function startSync(uid, store) {
  const col = collection(db, 'users', uid, 'notes')
  let flushing = false
  let again = false

  async function flush() {
    if (flushing) { again = true; return }
    flushing = true
    try {
      do {
        again = false
        const dirty = store.getDirty(uid)
        // offline: these promises wait until the connection returns
        await Promise.all(dirty.map(async (n) => {
          const ref = doc(col, n.id)
          if (n._del) await deleteDoc(ref)
          else {
            await setDoc(ref, {
              title: n.title || '',
              body: n.body || '',
              pinned: !!n.pinned,
              createdAt: Timestamp.fromMillis(n.createdAt || n.updatedAt || Date.now()),
              updatedAt: Timestamp.fromMillis(n.updatedAt || Date.now())
            })
          }
          store.markSynced(uid, n.id, n._v)
        }))
      } while (again)
    } catch {
      /* stays dirty; retried next time the popup opens */
    } finally {
      flushing = false
    }
  }

  store.onLocalChange = flush
  let first = true
  const unsub = onSnapshot(col, (snap) => {
    const now = Date.now()
    const docs = []
    const removed = []
    snap.docChanges().forEach((c) => {
      if (c.type === 'removed') { removed.push(c.doc.id); return }
      const d = c.doc.data({ serverTimestamps: 'estimate' })
      docs.push({
        id: c.doc.id,
        title: d.title || '',
        body: d.body || '',
        pinned: !!d.pinned,
        createdAt: ms(d.createdAt, now),
        updatedAt: ms(d.updatedAt, now)
      })
    })
    const fromServer = !snap.metadata.fromCache
    store.applyRemote(uid, docs, removed, first && fromServer ? new Set(snap.docs.map((d) => d.id)) : null)
    if (fromServer) first = false
    flush()
  }, () => {})

  flush() // push anything left unsynced from a previous session

  return () => { unsub(); if (store.onLocalChange === flush) store.onLocalChange = null }
}
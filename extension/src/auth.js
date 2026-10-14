// Lazy auth: the popup paints from a cached user immediately;
// the Firebase SDK loads in the background to confirm / refresh it.
const CACHE = 'dan:user'

const fb = () => Promise.all([import('firebase/auth/web-extension'), import('./firebase.js')])

// The popup closes when the Google sign-in window opens, so the OAuth flow runs
// in the background service worker (public/background.js) - unchanged.
export function startLogin() {
  chrome.runtime.sendMessage({ type: 'login' })
}

export async function consumePendingLogin() {
  const { pendingLogin } = await chrome.storage.session.get('pendingLogin')
  if (!pendingLogin) return null
  await chrome.storage.session.remove('pendingLogin')
  if (pendingLogin.error) throw new Error(pendingLogin.error)
  const [a, f] = await fb()
  const credential = a.GoogleAuthProvider.credential(null, pendingLogin.token)
  try {
    return await a.signInWithCredential(f.auth, credential)
  } catch (error) {
    if (error?.code === 'auth/invalid-credential') {
      throw new Error('Google sign-in is configured for a different Firebase project. Use a Web application OAuth client from the Firebase project configured in firebase.js.')
    }
    throw error
  }
}

export async function logout() {
  const [a, f] = await fb()
  await a.signOut(f.auth)
}

export function onAuthStateChanged(callback) {
  let last
  const emit = (u) => {
    const uid = u?.uid ?? null
    if (uid === last) return // never re-render for the same user
    last = uid
    callback(u)
  }

  let cached = null
  try { cached = JSON.parse(localStorage.getItem(CACHE)) } catch {}
  if (cached?.uid) emit(cached) // instant

  let off = () => {}
  let dead = false
  setTimeout(() => {
    fb().then(([a, f]) => {
      if (dead) return
      off = a.onAuthStateChanged(f.auth, (u) => {
        if (u) {
          const slim = { uid: u.uid, displayName: u.displayName, email: u.email }
          try { localStorage.setItem(CACHE, JSON.stringify(slim)) } catch {}
          emit(slim)
        } else {
          try { localStorage.removeItem(CACHE) } catch {}
          emit(null)
        }
      })
    }).catch(() => { if (!cached?.uid) emit(null) })
  }, cached?.uid ? 150 : 0)

  return () => { dead = true; off() }
}
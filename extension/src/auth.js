import { GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged } from 'firebase/auth/web-extension'
import { auth } from './firebase.js'

// The popup closes as soon as the Google sign-in window opens, so the OAuth
// flow runs in the background service worker (public/background.js). It leaves
// the result in chrome.storage.session, and the popup finishes the Firebase
// sign-in here the next time it is open.

export function startLogin() {
  chrome.runtime.sendMessage({ type: 'login' })
}

export async function consumePendingLogin() {
  const { pendingLogin } = await chrome.storage.session.get('pendingLogin')
  if (!pendingLogin) return null
  await chrome.storage.session.remove('pendingLogin')
  if (pendingLogin.error) throw new Error(pendingLogin.error)
  const credential = GoogleAuthProvider.credential(null, pendingLogin.token)
  try {
    return await signInWithCredential(auth, credential)
  } catch (error) {
    if (error?.code === 'auth/invalid-credential') {
      throw new Error('Google sign-in is configured for a different Firebase project. Use a Web application OAuth client from the Firebase project configured in firebase.js.')
    }
    throw error
  }
}

export async function logout() {
  await signOut(auth)
}

export { onAuthStateChanged }
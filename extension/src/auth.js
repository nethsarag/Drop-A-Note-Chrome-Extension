import { GoogleAuthProvider, signInWithCredential, signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase.js'

function getGoogleToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'No token'))
      } else {
        resolve(token)
      }
    })
  })
}

export async function login() {
  const token = await getGoogleToken()
  const credential = GoogleAuthProvider.credential(null, token)
  return signInWithCredential(auth, credential)
}

export async function logout() {
  await signOut(auth)
  await chrome.identity.clearAllCachedAuthTokens()
}

export { onAuthStateChanged }
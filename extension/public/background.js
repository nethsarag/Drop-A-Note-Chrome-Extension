// Runs the Google OAuth flow with chrome.identity.launchWebAuthFlow, which works
// in Chrome, Brave and Edge (getAuthToken only works in Chrome with a signed-in profile).

// Replace this with a Web application OAuth client ID from the same Google Cloud / Firebase project.
const CLIENT_ID = '163907376482-d96bglvmq7aag9othpqcnhgisrdidp29.apps.googleusercontent.com'
let loginInProgress = false

async function googleSignIn() {
  if (CLIENT_ID.startsWith('REPLACE_WITH_')) {
    throw new Error('Google sign-in is not configured. Replace CLIENT_ID in background.js with a Google Cloud Web application OAuth client ID.')
  }
  const state = crypto.randomUUID()
  const redirectUri = chrome.identity.getRedirectURL()
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  })
  let redirect
  try {
    redirect = await chrome.identity.launchWebAuthFlow({
      url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params,
      interactive: true
    })
  } catch (error) {
    throw new Error(`${error?.message || 'Google sign-in failed'} Authorized redirect URI: ${redirectUri}`)
  }
  const frag = new URLSearchParams(new URL(redirect).hash.slice(1))
  if (frag.get('state') !== state) throw new Error('Sign-in failed (state mismatch)')
  const token = frag.get('access_token')
  if (!token) throw new Error(frag.get('error') || 'No token returned')
  return token
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'login') return
  if (loginInProgress) return
  loginInProgress = true
  // keep the service worker alive while the user is in the sign-in window
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000)
  googleSignIn()
    .then((token) => chrome.storage.session.set({ pendingLogin: { token } }))
    .catch((e) => chrome.storage.session.set({ pendingLogin: { error: e.message } }))
    .finally(() => {
      clearInterval(keepAlive)
      loginInProgress = false
    })
})

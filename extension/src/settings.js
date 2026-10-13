// Theme (light / dark) handling. The choice is saved in chrome.storage.local
// so it is remembered the next time the popup opens.
const KEY = 'theme'

export function currentTheme() {
  return document.documentElement.dataset.theme || 'light'
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}

export async function loadTheme() {
  try {
    const stored = await chrome.storage.local.get(KEY)
    applyTheme(stored[KEY] === 'dark' ? 'dark' : 'light')
  } catch {
    applyTheme('light')
  }
}

export async function saveTheme(theme) {
  applyTheme(theme)
  try {
    await chrome.storage.local.set({ [KEY]: theme })
  } catch {
    /* theme still applies for this session */
  }
}
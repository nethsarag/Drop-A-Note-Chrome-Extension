import './styles.css'
import { auth } from './firebase.js'
import { startLogin, consumePendingLogin, logout, onAuthStateChanged } from './auth.js'
import { subscribeNotes, saveNote, deleteNote, newNoteId, setPinned, deleteMany } from './notes.js'

const GITHUB_URL = 'https://github.com/nethsarag' // <- change me
const app = document.getElementById('app')

/* ============================== helpers ============================== */

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k.includes('-') || k === 'role') el.setAttribute(k, v)
    else el[k] = v
  }
  el.append(...children.filter((c) => c != null && c !== false))
  return el
}

// Simple outline icons (static, trusted strings)
const ICONS = {
  compose: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  trash: ['M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6'],
  copy: ['M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  pin: ['M12 17v5', 'M9 3h6l-1 7 3 3v2H7v-2l3-3z'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  x: ['M6 6l12 12', 'M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  note: ['M6 3h9l4 4v14H6z', 'M15 3v4h4', 'M9 12h7', 'M9 16h7'],
  select: ['M9 11l3 3 8-8', 'M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9']
}
function icon(name, size = 22, filled = false) {
  const s = document.createElement('span')
  s.className = 'ico'
  s.setAttribute('aria-hidden', 'true')
  s.innerHTML =
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" ` +
    `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">` +
    ICONS[name].map((d) => `<path d="${d}"/>`).join('') + '</svg>'
  return s
}

function fmtDate(ts) {
  const d = ts?.toDate ? ts.toDate() : null
  if (!d) return ''
  const now = new Date()
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  if (now - d < 6 * 864e5) return d.toLocaleDateString([], { weekday: 'long' })
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

/* ============================== theme ============================== */

function getTheme() { try { return localStorage.getItem('theme') || 'system' } catch { return 'system' } }
function applyTheme(t) {
  const root = document.documentElement
  if (t === 'light' || t === 'dark') root.dataset.theme = t
  else delete root.dataset.theme
  try { localStorage.setItem('theme', t) } catch {}
}
applyTheme(getTheme())

/* ============================== toast + action sheet ============================== */

let toastEl = null
let toastTimer = null
function toast(text) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' })
    document.body.append(toastEl)
  }
  toastEl.textContent = text
  requestAnimationFrame(() => toastEl.classList.add('show'))
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600)
}

let sheetOpen = false
function confirmSheet({ title, message, confirm }) {
  return new Promise((resolve) => {
    const prev = document.activeElement
    sheetOpen = true
    const done = (value) => {
      sheetOpen = false
      document.removeEventListener('keydown', onKey, true)
      scrim.classList.add('out')
      setTimeout(() => scrim.remove(), 180)
      prev?.focus?.()
      resolve(value)
    }
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false) } }
    const cancel = h('button', { class: 'opt cancel', onclick: () => done(false) }, 'Cancel')
    const scrim = h('div', { class: 'scrim', onclick: (e) => { if (e.target === scrim) done(false) } },
      h('div', { class: 'sheet', role: 'alertdialog', 'aria-label': title },
        h('div', { class: 'card' },
          h('div', { class: 'hd' }, h('b', {}, title), message),
          h('button', { class: 'opt danger', onclick: () => done(true) }, confirm)
        ),
        h('div', { class: 'card' }, cancel)
      )
    )
    document.addEventListener('keydown', onKey, true)
    document.body.append(scrim)
    cancel.focus() // safest default for a destructive action
  })
}

/* ============================== state ============================== */

let currentUser = null
let notes = []
let loaded = false
let loadError = false
let unsubscribe = null
let view = 'login'
let repaint = null

let query = ''
let selecting = false
const selected = new Set()
let loginMessage = ''

function stopListening() { if (unsubscribe) { unsubscribe(); unsubscribe = null } }

function mount(el, dir = 'none', extra = '') {
  el.classList.add('screen')
  if (extra) el.classList.add(extra)
  if (dir !== 'none') el.classList.add(dir)
  app.replaceChildren(el)
}

/* ============================== login ============================== */

function renderLogin() {
  view = 'login'
  repaint = null
  const msg = h('p', { class: 'msg' + (loginMessage ? ' err' : ''), role: 'status' }, loginMessage)
  const button = h('button', {
    class: 'btn',
    onclick: () => {
      button.disabled = true
      msg.className = 'msg'
      msg.textContent = 'A Google sign-in window is opening. When you finish, click the Drop A Note icon again.'
      startLogin()
    }
  }, 'Sign in with Google')
  mount(h('div', { style: 'display:flex;flex-direction:column;height:100%' },
    h('div', { class: 'login' },
      h('div', { class: 'logo' }, icon('note', 40)),
      h('h1', {}, 'Drop A Note'),
      h('p', {}, 'Quick, private notes that sync with your Google account.'),
      button,
      msg
    )
  ))
}

function renderFatalError(message) {
  view = 'error'
  mount(h('div', { style: 'display:flex;flex-direction:column;height:100%' },
    h('div', { class: 'login' },
      h('h1', {}, 'Something went wrong'),
      h('p', { class: 'msg err' }, message)
    )
  ))
}

async function checkPendingLogin() {
  try {
    await consumePendingLogin()
  } catch (e) {
    const m = e?.message || ''
    loginMessage = /did not approve|closed|cancel/i.test(m) ? 'Sign-in was cancelled.' : m || 'Unable to sign in. Please try again.'
    if (!auth.currentUser) renderLogin()
  }
}
window.addEventListener('error', (e) => renderFatalError(e.error?.message || 'The extension could not start. Reload it from chrome://extensions.'))
window.addEventListener('unhandledrejection', (e) => renderFatalError(e.reason?.message || 'The extension could not start. Reload it from chrome://extensions.'))
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.pendingLogin?.newValue) checkPendingLogin()
})

/* ============================== notes list ============================== */

function noteTitle(n) { return (n.title || '').trim() || 'Untitled' }
function notePreview(n) { return (n.body || '').split('\n').find((l) => l.trim()) || 'No additional text' }

function renderList(dir = 'none') {
  view = 'list'
  const user = currentUser

  const titleEl = h('h1', { class: 'large-title' })
  const actions = h('div', { class: 'top-actions' })
  const searchInput = h('input', {
    type: 'search', placeholder: 'Search', 'aria-label': 'Search notes', value: query,
    oninput: () => { query = searchInput.value; paint() }
  })
  const clearBtn = h('button', { class: 'clear', 'aria-label': 'Clear search', onclick: () => { query = ''; searchInput.value = ''; paint(); searchInput.focus() } }, icon('x', 12))
  const searchWrap = h('label', { class: 'search' }, icon('search', 16), searchInput, clearBtn)
  const top = h('div', { class: 'top' }, h('div', { class: 'top-row' }, titleEl, actions), searchWrap)
  const scroll = h('div', { class: 'scroll', onscroll: () => top.classList.toggle('scrolled', scroll.scrollTop > 2) })
  const bar = h('div', { class: 'bar hidden' })

  const root = h('div', { style: 'display:flex;flex-direction:column;height:100%' }, top, scroll, bar)
  mount(root, dir)

  function exitSelect() { selecting = false; selected.clear(); paint() }
  function toggle(id) { selected.has(id) ? selected.delete(id) : selected.add(id); paint() }

  async function onPin() {
    const sel = notes.filter((n) => selected.has(n.id))
    if (!sel.length) return
    const pin = !sel.every((n) => n.pinned)
    try {
      await setPinned(user.uid, sel.map((n) => n.id), pin)
      toast(pin ? 'Pinned' : 'Unpinned')
      exitSelect()
    } catch { toast('Could not update. Try again.') }
  }
  async function onDelete() {
    const count = selected.size
    if (!count) return
    const ok = await confirmSheet({
      title: count === 1 ? 'Delete this note?' : `Delete ${count} notes?`,
      message: 'This can’t be undone.',
      confirm: count === 1 ? 'Delete Note' : `Delete ${count} Notes`
    })
    if (!ok) return
    try { await deleteMany(user.uid, [...selected]); toast('Deleted'); exitSelect() }
    catch { toast('Could not delete. Try again.') }
  }
  function onSelectAll() {
    const shown = visible()
    const all = shown.every((n) => selected.has(n.id))
    shown.forEach((n) => (all ? selected.delete(n.id) : selected.add(n.id)))
    paint()
  }

  function visible() {
    const q = query.trim().toLowerCase()
    return q ? notes.filter((n) => (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q)) : notes
  }

  function row(n) {
    const isSel = selected.has(n.id)
    const props = { class: 'row' + (isSel ? ' selected' : ''), type: 'button', onclick: () => (selecting ? toggle(n.id) : renderEditor(n)) }
    if (selecting) props['aria-pressed'] = String(isSel)
    return h('button', props,
      selecting && h('span', { class: 'radio' }, icon('check', 14)),
      h('div', { class: 'row-main' },
        h('div', { class: 'row-title' }, h('span', {}, noteTitle(n)), n.pinned && !selecting && h('span', { class: 'pin' }, icon('pin', 14, true))),
        h('div', { class: 'row-sub' }, h('span', { class: 'row-date' }, fmtDate(n.updatedAt)), h('span', { class: 'row-prev' }, notePreview(n)))
      )
    )
  }

  function emptyState(iconName, heading, text, withButton) {
    return h('div', { class: 'empty' }, icon(iconName, 44), h('h2', {}, heading), h('p', {}, text),
      withButton && h('button', { class: 'btn', onclick: () => renderEditor(null) }, 'New Note'))
  }

  function paint() {
    for (const id of [...selected]) if (!notes.some((n) => n.id === id)) selected.delete(id)
    const shown = visible()
    const searching = query.trim().length > 0

    // header
    titleEl.textContent = selecting ? (selected.size ? `${selected.size} Selected` : 'Select Items') : 'Notes'
    clearBtn.classList.toggle('hidden', !query)
    searchWrap.classList.toggle('hidden', !notes.length)
    actions.replaceChildren(
      ...(selecting
        ? [h('button', { class: 'text-btn strong', onclick: exitSelect }, 'Done')]
        : [
            notes.length > 0 && h('button', { class: 'text-btn', onclick: () => { selecting = true; paint() } }, 'Select'),
            h('button', { class: 'icon-btn', 'aria-label': 'New note', title: 'New note', onclick: () => renderEditor(null) }, icon('compose')),
            h('button', { class: 'avatar', 'aria-label': 'Settings', title: 'Settings', onclick: () => renderSettings() }, (user.displayName || user.email || '?')[0].toUpperCase())
          ].filter(Boolean))
    )

    // body
    if (!loaded) scroll.replaceChildren()
    else if (loadError) scroll.replaceChildren(emptyState('note', 'Can’t Load Notes', 'Check your connection and reopen Drop A Note.'))
    else if (!notes.length) scroll.replaceChildren(emptyState('note', 'No Notes', 'Capture a thought, a snippet, or a to-do. Your notes sync to your Google account.', true))
    else if (!shown.length) scroll.replaceChildren(emptyState('search', 'No Results', 'Try a different search.'))
    else {
      const pinned = searching ? [] : shown.filter((n) => n.pinned)
      const rest = searching ? shown : shown.filter((n) => !n.pinned)
      const parts = []
      if (pinned.length) parts.push(h('div', { class: 'sec' }, 'Pinned'), h('div', { class: 'group' }, ...pinned.map(row)))
      if (rest.length) parts.push(h('div', { class: 'sec' }, searching ? 'Results' : 'Notes'), h('div', { class: 'group' }, ...rest.map(row)))
      scroll.replaceChildren(...parts)
    }

    // bottom bar (selection mode)
    bar.classList.toggle('hidden', !selecting)
    if (selecting) {
      const sel = notes.filter((n) => selected.has(n.id))
      const allPinned = sel.length > 0 && sel.every((n) => n.pinned)
      const allSelected = shown.length > 0 && shown.every((n) => selected.has(n.id))
      const mk = (cls, ic, label, fn, disabled) => h('button', { class: cls, onclick: fn, disabled }, icon(ic, 22), label)
      bar.replaceChildren(
        mk('', 'pin', allPinned ? 'Unpin' : 'Pin', onPin, !selected.size),
        mk('', 'select', allSelected ? 'Deselect All' : 'Select All', onSelectAll, !shown.length),
        mk('danger', 'trash', 'Delete', onDelete, !selected.size)
      )
    }
  }

  repaint = paint
  paint()
}

/* ============================== editor ============================== */

function renderEditor(note) {
  view = 'editor'
  repaint = null
  const user = currentUser
  const id = note?.id ?? newNoteId(user.uid)
  let exists = !!note
  let pinned = !!note?.pinned
  let timer = null
  let statusTimer = null

  const status = h('span', { class: 'status', 'aria-live': 'polite' })
  const title = h('input', { class: 'e-title', 'aria-label': 'Title', placeholder: 'Title', value: note?.title ?? '', oninput: schedule,
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); body.focus() } } })
  const body = h('textarea', { class: 'e-body', 'aria-label': 'Note', placeholder: 'Start writing…', value: note?.body ?? '', oninput: schedule })

  function setStatus(text) {
    status.style.opacity = '1'
    status.textContent = text
    clearTimeout(statusTimer)
    if (text === 'Saved') statusTimer = setTimeout(() => (status.style.opacity = '0'), 1500)
  }
  function schedule() { setStatus(''); clearTimeout(timer); timer = setTimeout(flush, 600) }
  async function flush() {
    clearTimeout(timer); timer = null
    if (!exists && !title.value.trim() && !body.value.trim()) return
    const isNew = !exists
    exists = true
    setStatus('Saving…')
    try {
      await saveNote(user.uid, id, { title: title.value, body: body.value }, isNew)
      if (isNew && pinned) await setPinned(user.uid, [id], true)
      setStatus('Saved')
    } catch { if (isNew) exists = false; setStatus('Couldn’t save') }
  }
  const onHide = () => { if (timer) flush() }
  window.addEventListener('pagehide', onHide)

  async function leave() {
    if (timer) await flush()
    clearTimeout(timer); clearTimeout(statusTimer)
    window.removeEventListener('pagehide', onHide)
    renderList('back')
  }
  editorLeave = leave

  const pinBtn = h('button', { class: 'icon-btn' + (pinned ? ' on' : ''), 'aria-label': 'Pin note', 'aria-pressed': String(pinned), title: 'Pin',
    onclick: async () => {
      pinned = !pinned
      pinBtn.classList.toggle('on', pinned)
      pinBtn.setAttribute('aria-pressed', String(pinned))
      pinBtn.replaceChildren(icon('pin', 22, pinned))
      toast(pinned ? 'Pinned' : 'Unpinned')
      if (exists) { try { await setPinned(user.uid, [id], pinned) } catch { toast('Could not update pin') } }
    } }, icon('pin', 22, pinned))

  const stamp = (note?.updatedAt?.toDate ? note.updatedAt.toDate() : new Date())
    .toLocaleString([], { dateStyle: 'long', timeStyle: 'short' })

  mount(h('div', { style: 'display:flex;flex-direction:column;height:100%' },
    h('div', { class: 'nav' },
      h('div', { class: 'left' }, h('button', { class: 'text-btn', onclick: leave }, icon('chevronLeft', 20), 'Notes')),
      h('div', { class: 'mid' }, status),
      h('div', { class: 'right' },
        h('button', { class: 'icon-btn', 'aria-label': 'Copy note text', title: 'Copy text',
          onclick: async () => {
            if (!body.value.trim()) { toast('Nothing to copy'); return }
            try { await navigator.clipboard.writeText(body.value); toast('Copied') } catch { toast('Couldn’t copy') }
          } }, icon('copy')),
        pinBtn,
        h('button', { class: 'icon-btn danger', 'aria-label': 'Delete note', title: 'Delete',
          onclick: async () => {
            if (!exists) { clearTimeout(timer); timer = null; await leave(); return }
            const ok = await confirmSheet({ title: 'Delete this note?', message: 'This can’t be undone.', confirm: 'Delete Note' })
            if (!ok) return
            try { clearTimeout(timer); timer = null; await deleteNote(user.uid, id); toast('Deleted'); await leave() }
            catch { toast('Could not delete. Try again.') }
          } }, icon('trash'))
      )
    ),
    h('div', { class: 'stamp' }, stamp),
    title,
    body
  ), 'push', 'editor')

  if (note) body.focus(); else title.focus()
}
let editorLeave = null

/* ============================== settings ============================== */

function renderSettings() {
  view = 'settings'
  repaint = null
  const user = currentUser
  const theme = getTheme()
  const version = chrome.runtime.getManifest().version

  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Appearance' },
    ...[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([val, label]) =>
      h('button', { role: 'radio', 'aria-checked': String(val === theme), 'data-v': val, onclick: () => {
        applyTheme(val)
        seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === val)))
      } }, label))
  )

  mount(h('div', { style: 'display:flex;flex-direction:column;height:100%' },
    h('div', { class: 'nav' },
      h('div', { class: 'left' }, h('button', { class: 'text-btn', onclick: () => renderList('back') }, icon('chevronLeft', 20), 'Notes')),
      h('div', { class: 'mid' }, 'Settings'),
      h('div', { class: 'right' })
    ),
    h('div', { class: 'scroll' },
      h('div', { class: 'sec' }, 'Account'),
      h('div', { class: 'group' },
        h('div', { class: 's-account' },
          h('div', { class: 'big' }, (user.displayName || user.email || '?')[0].toUpperCase()),
          h('div', {}, user.displayName && h('b', {}, user.displayName), h('small', {}, user.email || 'Signed in with Google'))
        )
      ),
      h('div', { class: 'sec' }, 'Appearance'),
      h('div', { class: 'group' }, h('div', { class: 'row static' }, seg)),
      h('div', { class: 'sec' }, 'About'),
      h('div', { class: 'group' },
        h('a', { class: 'row static', href: GITHUB_URL, target: '_blank', rel: 'noreferrer' }, h('span', { class: 'grow' }, 'Follow on GitHub'), h('span', { class: 'chev' }, icon('chevronRight', 18))),
        h('div', { class: 'row static' }, h('span', { class: 'grow' }, 'Version'), h('span', { class: 'value' }, version)),
        h('div', { class: 'row static' }, h('span', { class: 'grow' }, 'Developed by'), h('span', { class: 'value' }, 'Areca'))
      ),
      h('div', { class: 'sec' }, ''),
      h('div', { class: 'group' }, h('button', { class: 'row center static', onclick: logout }, 'Sign Out'))
    )
  ), 'push')
}

/* ============================== keyboard + auth ============================== */

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || sheetOpen) return
  if (view === 'editor') editorLeave?.()
  else if (view === 'settings') renderList('back')
  else if (view === 'list' && selecting) { selecting = false; selected.clear(); repaint?.() }
})

onAuthStateChanged(auth, (user) => {
  stopListening()
  currentUser = user
  notes = []; loaded = false; loadError = false
  selecting = false; selected.clear(); query = ''
  if (user) {
    unsubscribe = subscribeNotes(user.uid,
      (list) => { notes = list; loaded = true; loadError = false; if (view === 'list') repaint?.() },
      () => { loaded = true; loadError = true; if (view === 'list') repaint?.() })
    renderList()
  } else {
    renderLogin()
  }
})

checkPendingLogin()
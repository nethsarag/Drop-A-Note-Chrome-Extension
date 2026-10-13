import './styles.css'
import { auth } from './firebase.js'
import { startLogin, consumePendingLogin, logout, onAuthStateChanged } from './auth.js'
import { subscribeNotes, saveNote, deleteNote, deleteNotes, newNoteId } from './notes.js'
import { loadTheme, saveTheme, currentTheme } from './settings.js'

const app = document.getElementById('app')
let unsubscribe = null

loadTheme()

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k.includes('-')) el.setAttribute(k, v)
    else el[k] = v
  }
  el.append(...children)
  return el
}

// Replaces the whole screen. `cls` can be 'slide-in' for a sliding transition.
function show(cls, ...children) {
  app.replaceChildren(h('div', { class: ('page ' + cls).trim() }, ...children))
}

function menuIcon() {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round'
  })) svg.setAttribute(k, v)
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', 'M4 7h16M4 12h16M4 17h16')
  svg.append(path)
  return svg
}

function renderFatalError(message) {
  show('',
    h('div', { class: 'center' },
      h('h1', {}, 'Drop A Note'),
      h('p', { class: 'err' }, message)
    )
  )
}

window.addEventListener('error', (event) => {
  renderFatalError(event.error?.message || 'The extension could not start. Reload it from chrome://extensions.')
})
window.addEventListener('unhandledrejection', (event) => {
  renderFatalError(event.reason?.message || 'The extension could not start. Reload it from chrome://extensions.')
})

function stopListening() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null }
}

let loginMessage = ''

function renderLogin() {
  const note = h('p', { class: loginMessage ? 'err' : 'hint' }, loginMessage)
  const button = h('button', {
    class: 'primary',
    onclick: () => {
      button.disabled = true
      note.className = 'hint'
      note.textContent = 'A Google sign-in window is opening. When you finish, click the Drop A Note icon again.'
      startLogin()
    }
  }, 'Sign in with Google')
  show('',
    h('div', { class: 'center' },
      h('h1', {}, 'Drop A Note'),
      button,
      note
    )
  )
}

async function checkPendingLogin() {
  try {
    await consumePendingLogin()
  } catch (e) {
    const msg = e?.message || ''
    loginMessage = /did not approve|closed|cancel/i.test(msg)
      ? 'Sign-in was cancelled.'
      : msg || 'Unable to sign in. Please try again.'
    if (!auth.currentUser) renderLogin()
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.pendingLogin?.newValue) checkPendingLogin()
})

/* ---------- Notes list (with select + delete) ---------- */

function renderList(user) {
  stopListening()
  let notes = []
  let selectMode = false
  let confirming = false
  let busy = false
  let firstPaint = true
  let message = ''
  const selected = new Set()

  const header = h('div', { class: 'bar' })
  const list = h('div', { class: 'list' })
  show('', header, list)

  function resetConfirm() { confirming = false; message = '' }

  function draw() { drawHeader(); drawItems() }

  function exitSelect() {
    selectMode = false
    selected.clear()
    resetConfirm()
    draw()
  }

  async function onDelete() {
    if (!selected.size || busy) return
    if (!confirming) { confirming = true; drawHeader(); return }
    busy = true
    drawHeader()
    const ids = [...selected]
    try {
      await deleteNotes(user.uid, ids)
      notes = notes.filter((n) => !selected.has(n.id))
      selected.clear()
      selectMode = false
      resetConfirm()
    } catch {
      message = 'Error deleting'
      confirming = false
    }
    busy = false
    draw()
  }

  function drawHeader() {
    if (!selectMode) {
      header.replaceChildren(
        h('strong', {}, 'Drop A Note'),
        h('span', { class: 'grow' }),
        notes.length ? h('button', { class: 'ghost', onclick: () => { selectMode = true; draw() } }, 'Select') : '',
        h('button', { class: 'primary', onclick: () => renderEditor(user, null) }, '+ New'),
        h('button', {
          class: 'ghost icon-btn', title: 'Settings', 'aria-label': 'Settings',
          onclick: () => renderSettings(user)
        }, menuIcon())
      )
      return
    }
    const allSelected = notes.length > 0 && selected.size === notes.length
    header.replaceChildren(
      h('label', { class: 'check-all' },
        h('input', {
          type: 'checkbox',
          checked: allSelected,
          onchange: (e) => {
            selected.clear()
            if (e.target.checked) notes.forEach((n) => selected.add(n.id))
            resetConfirm()
            draw()
          }
        }),
        'Select all'
      ),
      message ? h('span', { class: 'status err' }, message) : '',
      h('span', { class: 'grow' }),
      h('button', {
        class: 'danger-solid',
        disabled: !selected.size || busy,
        onclick: onDelete
      }, confirming ? `Confirm (${selected.size})` : selected.size ? `Delete (${selected.size})` : 'Delete'),
      h('button', { class: 'ghost', onclick: exitSelect }, 'Cancel')
    )
  }

  function drawItems() {
    if (!notes.length) {
      list.replaceChildren(h('p', { class: 'empty' }, 'No notes yet. Click + New.'))
      return
    }
    list.replaceChildren(
      ...notes.map((n, i) => {
        const text = [
          h('div', { class: 'item-title' }, n.title || 'Untitled'),
          h('div', { class: 'item-body' }, (n.body || '').slice(0, 80))
        ]
        let row
        if (selectMode) {
          row = h('label', { class: 'item select-row' + (selected.has(n.id) ? ' picked' : '') },
            h('input', {
              type: 'checkbox',
              checked: selected.has(n.id),
              'aria-label': 'Select ' + (n.title || 'Untitled'),
              onchange: (e) => {
                if (e.target.checked) selected.add(n.id); else selected.delete(n.id)
                row.classList.toggle('picked', e.target.checked)
                resetConfirm()
                drawHeader()
              }
            }),
            h('div', { class: 'item-text' }, ...text)
          )
        } else {
          row = h('button', { class: 'item', type: 'button', onclick: () => renderEditor(user, n) }, ...text)
        }
        if (firstPaint) {
          row.classList.add('enter')
          row.style.animationDelay = Math.min(i, 8) * 30 + 'ms'
        }
        return row
      })
    )
    firstPaint = false
  }

  drawHeader()
  unsubscribe = subscribeNotes(user.uid, (data) => {
    notes = data
    const ids = new Set(data.map((n) => n.id))
    for (const id of [...selected]) if (!ids.has(id)) selected.delete(id)
    if (!notes.length) selectMode = false
    draw()
  }, () => {
    list.replaceChildren(h('p', { class: 'empty err' }, 'Unable to load notes. Check your connection and try again.'))
  })
}

/* ---------- Settings page ---------- */

function renderSettings(user) {
  stopListening()

  const darkToggle = h('input', {
    type: 'checkbox',
    'aria-label': 'Dark mode',
    checked: currentTheme() === 'dark',
    onchange: (e) => saveTheme(e.target.checked ? 'dark' : 'light')
  })

  const name = user.displayName || user.email || '?'
  const avatar = user.photoURL
    ? h('img', { class: 'avatar', src: user.photoURL, alt: '', referrerPolicy: 'no-referrer' })
    : h('div', { class: 'avatar fallback' }, name.charAt(0).toUpperCase())

  show('slide-in',
    h('div', { class: 'bar' },
      h('button', { class: 'ghost', onclick: () => renderList(user) }, '← Back'),
      h('strong', {}, 'Settings')
    ),
    h('div', { class: 'settings' },
      h('section', {},
        h('h2', {}, 'Appearance'),
        h('div', { class: 'row' },
          h('span', {}, 'Dark mode'),
          h('label', { class: 'switch' }, darkToggle, h('span', { class: 'slider' }))
        )
      ),
      h('section', {},
        h('h2', {}, 'Account'),
        h('div', { class: 'account' },
          avatar,
          h('div', { class: 'account-text' },
            h('div', { class: 'account-name' }, user.displayName || 'Signed in'),
            h('div', { class: 'account-email' }, user.email || '')
          )
        ),
        h('button', { class: 'outline', onclick: logout }, 'Sign out')
      )
    )
  )
}

/* ---------- Note editor ---------- */

function renderEditor(user, note) {
  stopListening()
  const id = note?.id ?? newNoteId(user.uid)
  let exists = !!note
  let timer = null
  let armed = false

  const status = h('span', { class: 'status' })
  const title = h('input', {
    class: 'title', 'aria-label': 'Note title', placeholder: 'Title', value: note?.title ?? '', oninput: schedule
  })
  const body = h('textarea', {
    class: 'body', 'aria-label': 'Note body', placeholder: 'Start writing…', value: note?.body ?? '', oninput: schedule
  })

  function schedule() {
    status.textContent = ''
    clearTimeout(timer)
    timer = setTimeout(flush, 500)
  }

  async function flush() {
    clearTimeout(timer)
    timer = null
    if (!exists && !title.value.trim() && !body.value.trim()) return
    const isNew = !exists
    exists = true
    status.textContent = 'Saving…'
    try {
      await saveNote(user.uid, id, { title: title.value, body: body.value }, isNew)
      status.textContent = 'Saved'
    } catch (e) {
      if (isNew) exists = false
      status.textContent = 'Error saving'
    }
  }

  const onHide = () => { if (timer) flush() }
  window.addEventListener('pagehide', onHide)

  async function leave(saveFirst) {
    if (saveFirst && timer) await flush()
    clearTimeout(timer)
    timer = null
    window.removeEventListener('pagehide', onHide)
    renderList(user)
  }

  const del = h('button', {
    class: 'ghost danger',
    onclick: async () => {
      if (!armed) { armed = true; del.textContent = 'Click again to delete'; return }
      del.disabled = true
      try {
        if (exists) await deleteNote(user.uid, id)
        await leave(false)
      } catch {
        del.disabled = false
        status.textContent = 'Error deleting'
      }
    }
  }, 'Delete')

  show('slide-in',
    h('div', { class: 'bar' },
      h('button', { class: 'ghost', onclick: () => leave(true) }, '← Back'),
      h('span', { class: 'grow' }),
      status,
      del
    ),
    title,
    body
  )
  if (note) body.focus(); else title.focus()
}

onAuthStateChanged(auth, (user) => {
  stopListening()
  if (user) renderList(user)
  else renderLogin()
})

checkPendingLogin()
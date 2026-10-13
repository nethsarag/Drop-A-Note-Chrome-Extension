import './styles.css'
import { auth } from './firebase.js'
import { startLogin, consumePendingLogin, logout, onAuthStateChanged } from './auth.js'
import { subscribeNotes, saveNote, deleteNote, newNoteId } from './notes.js'

const app = document.getElementById('app')
let unsubscribe = null

function renderFatalError(message) {
  app.replaceChildren(
    h('div', { class: 'center' },
      h('h1', {}, 'Drop A Note'),
      h('p', { class: 'err' }, message)
    )
  )
}

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
  app.replaceChildren(
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

  window.addEventListener('error', (event) => {
    renderFatalError(event.error?.message || 'The extension could not start. Reload it from chrome://extensions.')
  })

  window.addEventListener('unhandledrejection', (event) => {
    renderFatalError(event.reason?.message || 'The extension could not start. Reload it from chrome://extensions.')
  })
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.pendingLogin?.newValue) checkPendingLogin()
})

function renderList(user) {
  stopListening()
  const list = h('div', { class: 'list' })
  app.replaceChildren(
    h('div', { class: 'bar' },
      h('strong', {}, 'Drop A Note'),
      h('span', { class: 'grow' }),
      h('button', { class: 'primary', onclick: () => renderEditor(user, null) }, '+ New'),
      h('button', { class: 'ghost', title: user.email, onclick: logout }, 'Sign out')
    ),
    list
  )
  unsubscribe = subscribeNotes(user.uid, (notes) => {
    if (!notes.length) {
      list.replaceChildren(h('p', { class: 'empty' }, 'No notes yet. Click + New.'))
      return
    }
    list.replaceChildren(
      ...notes.map((n) =>
        h('button', {
          class: 'item',
          type: 'button',
          onclick: () => renderEditor(user, n)
        },
          h('div', { class: 'item-title' }, n.title || 'Untitled'),
          h('div', { class: 'item-body' }, (n.body || '').slice(0, 80))
        )
      )
    )
  }, () => {
    list.replaceChildren(h('p', { class: 'empty err' }, 'Unable to load notes. Check your connection and try again.'))
  })
}

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

  app.replaceChildren(
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
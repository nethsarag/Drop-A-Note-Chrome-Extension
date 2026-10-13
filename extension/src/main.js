import './styles.css'
import { auth } from './firebase.js'
import { login, logout, onAuthStateChanged } from './auth.js'

const app = document.getElementById('app')

function renderLogin() {
  app.innerHTML = `
    <div class="center">
      <h1>Drop A Note</h1>
      <button id="login">Sign in with Google</button>
      <p id="err" class="err"></p>
    </div>`
  document.getElementById('login').onclick = async () => {
    try { await login() }
    catch (e) { document.getElementById('err').textContent = e.message }
  }
}

function renderHome(user) {
  app.innerHTML = `
    <div class="center">
      <p>Signed in as <strong id="email"></strong></p>
      <button id="logout">Sign out</button>
    </div>`
  document.getElementById('email').textContent = user.email
  document.getElementById('logout').onclick = logout
}

onAuthStateChanged(auth, (user) => (user ? renderHome(user) : renderLogin()))
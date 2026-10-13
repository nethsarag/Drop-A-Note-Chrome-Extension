import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyCXoD-PAWEQUJKU1BuXVYzyNNoY4U-0Gdg",
  authDomain: "drop-a-note.firebaseapp.com",
  projectId: "drop-a-note",
  storageBucket: "drop-a-note.firebasestorage.app",
  messagingSenderId: "163907376482",
  appId: "1:163907376482:web:b723c2fa4ee774219c883b"
};

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, { localCache: persistentLocalCache() })
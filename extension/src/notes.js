import {
  collection, doc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from 'firebase/firestore'
import { db } from './firebase.js'

const notesCol = (uid) => collection(db, 'users', uid, 'notes')

export function newNoteId(uid) {
  return doc(notesCol(uid)).id
}

export function subscribeNotes(uid, callback, onError) {
  const q = query(notesCol(uid), orderBy('updatedAt', 'desc'))
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }))
    )
  }, onError)
}

export function saveNote(uid, id, { title, body }, isNew) {
  const ref = doc(notesCol(uid), id)
  if (isNew) {
    return setDoc(ref, {
      title, body,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  }
  return updateDoc(ref, { title, body, updatedAt: serverTimestamp() })
}

export function deleteNote(uid, id) {
  return deleteDoc(doc(notesCol(uid), id))
}
// Cloud layer: Firebase Authentication (Google sign-in) + Firestore.
// The rest of the app talks to Firebase only through the functions exported here.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut,
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  getFirestore, collection, doc, onSnapshot, getDocs, addDoc, updateDoc, deleteDoc, query, where, writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- Auth ---------- */
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}

/* ---------- Members: members/{uid} = { name: "kasia" | "emilia" | "ola" } ----------
   Created by the owner in the Firebase console (this is the "approval" step). */
export function watchMembership(uid, onChange, onError) {
  return onSnapshot(doc(db, 'members', uid), snap => onChange(snap.exists() ? snap.data() : null), onError);
}

export async function loadMembers() {
  const snap = await getDocs(collection(db, 'members'));
  const byUid = {};
  snap.forEach(d => { byUid[d.id] = d.data().name; });
  return byUid;
}

/* ---------- Entries: entries/{id} = { uid, date, start, end, note } ---------- */
export function watchEntries(fromDateKey, toDateKey, onChange, onError) {
  const q = query(
    collection(db, 'entries'),
    where('date', '>=', fromDateKey),
    where('date', '<=', toDateKey),
  );
  return onSnapshot(q, snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
}

export function createEntry(data) {
  return addDoc(collection(db, 'entries'), data);
}

export function updateEntry(id, data) {
  return updateDoc(doc(db, 'entries', id), data);
}

export function deleteEntry(id) {
  return deleteDoc(doc(db, 'entries', id));
}

/* ---------- Repeating entries (series) ----------
   A series is just many normal entries sharing the same seriesId.
   Batches are atomic: either all entries are saved, or none. Max 500 operations per batch. */
export function createEntries(list) {
  const batch = writeBatch(db);
  list.forEach(data => batch.set(doc(collection(db, 'entries')), data));
  return batch.commit();
}

export async function findSeries(seriesId) {
  const snap = await getDocs(query(collection(db, 'entries'), where('seriesId', '==', seriesId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function updateEntries(ids, data) {
  const batch = writeBatch(db);
  ids.forEach(id => batch.update(doc(db, 'entries', id), data));
  return batch.commit();
}

export function deleteEntries(ids) {
  const batch = writeBatch(db);
  ids.forEach(id => batch.delete(doc(db, 'entries', id)));
  return batch.commit();
}

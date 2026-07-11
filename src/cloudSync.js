// src/cloudSync.js
// Syncs the app's local data (profile, scan results, scan history, habits,
// water intake, journal entries) to Firestore, keyed by the signed-in
// user's uid. One document per user at users/{uid} — simple, well within
// Firestore's free tier, and easy to reason about.

import { db } from "./firebase";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

const userDocRef = (uid) => doc(db, "users", uid);

/** Pulls the user's cloud document. Returns null if it doesn't exist yet
 *  (e.g. first login, or a user who signed up before cloud sync existed). */
export async function pullUserData(uid) {
  if (!uid) return null;
  try {
    const snap = await getDoc(userDocRef(uid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    console.error("[cloudSync] pull failed:", err.message);
    return null;
  }
}

/** Merges the given fields into the user's cloud document. Safe to call
 *  frequently — merge:true means it never clobbers fields not passed in. */
export async function pushUserData(uid, fields) {
  if (!uid) return;
  try {
    await setDoc(userDocRef(uid), { ...fields, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    console.error("[cloudSync] push failed:", err.message);
  }
}

/** Permanently deletes a user's cloud document. Used for account deletion. */
export async function deleteUserCloudData(uid) {
  if (!uid) return;
  try {
    await deleteDoc(userDocRef(uid));
  } catch (err) {
    console.error("[cloudSync] delete failed:", err.message);
  }
}

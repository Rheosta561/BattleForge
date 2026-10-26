'use strict';

const User = require('../../../models/User');

class UserStore {
  constructor (firestore = null) {
    this.firestore = firestore;
  }

  getDb () {
    if (this.firestore) {
      return this.firestore;
    }
    const { getFirestoreDb } = require('../../../config/firebase');
    this.firestore = getFirestoreDb();
    return this.firestore;
  }

  async findUser (uid) {
    if (!uid || typeof uid !== 'string') {
      return null;
    }
    const db = this.getDb();
    if (!db) {
      return null;
    }

    const docSnapshot = await db.collection('users').doc(uid).get();
    if (!docSnapshot.exists) {
      return null;
    }

    return User.fromFirestore(docSnapshot.data(), uid);
  }

  async upsertFromFirebaseClaims (claims) {
    if (!claims || !claims.uid) {
      return null;
    }

    const db = this.getDb();
    if (!db) {
      return null;
    }

    const uid = claims.uid;
    const userRef = db.collection('users').doc(uid);
    const existingSnap = await userRef.get();
    const now = new Date();

    if (!existingSnap.exists) {
      const newUser = new User({
        uid,
        displayName: claims.name || null,
        photoURL: claims.picture || null,
        email: claims.email || null,
        phoneNumber: claims.phone_number || null,
        emailVerified: claims.email_verified === true,
        preferences: { units: 'metric', timezone: 'UTC' },
        profileStatus: 'active',
        createdAt: now,
        updatedAt: now
      });

      await userRef.set(newUser.toFirestore());
      return newUser;
    }

    const existingUser = User.fromFirestore(existingSnap.data(), uid);
    const updates = {
      updatedAt: now
    };

    if (claims.email && claims.email !== existingUser.email) {
      updates.email = claims.email.toLowerCase();
    }
    if (typeof claims.email_verified === 'boolean' && claims.email_verified !== existingUser.emailVerified) {
      updates.emailVerified = claims.email_verified;
    }
    if (claims.name && claims.name !== existingUser.displayName) {
      updates.displayName = claims.name;
    }
    if (claims.picture && claims.picture !== existingUser.photoURL) {
      updates.photoURL = claims.picture;
    }
    if (claims.phone_number && claims.phone_number !== existingUser.phoneNumber) {
      updates.phoneNumber = claims.phone_number;
    }

    await userRef.update(updates);
    return User.fromFirestore({ ...existingUser.toFirestore(), ...updates }, uid);
  }
}

let defaultUserStore = null;
function getUserStore (firestore) {
  if (firestore) {
    return new UserStore(firestore);
  }
  if (!defaultUserStore) {
    defaultUserStore = new UserStore();
  }
  return defaultUserStore;
}

module.exports = {
  UserStore,
  getUserStore
};

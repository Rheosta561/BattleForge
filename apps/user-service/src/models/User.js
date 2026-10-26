'use strict';

const PROFILE_STATUSES = Object.freeze(['active', 'pendingDeletion']);
const UNITS = Object.freeze(['metric', 'imperial']);

class User {
  constructor ({
    uid,
    displayName = null,
    photoURL = null,
    email = null,
    phoneNumber = null,
    emailVerified = false,
    preferences = {},
    profileStatus = 'active',
    createdAt = new Date(),
    updatedAt = new Date()
  } = {}) {
    if (!uid || typeof uid !== 'string' || !uid.trim()) {
      throw new TypeError('User requires a non-empty string uid');
    }

    this.uid = uid.trim();
    this.displayName = displayName && typeof displayName === 'string' ? displayName.trim().slice(0, 100) : null;
    this.photoURL = photoURL && typeof photoURL === 'string' ? photoURL.trim().slice(0, 500) : null;
    this.email = email && typeof email === 'string' ? email.trim().toLowerCase() : null;
    this.phoneNumber = phoneNumber && typeof phoneNumber === 'string' ? phoneNumber.trim() : null;
    this.emailVerified = Boolean(emailVerified);
    this.preferences = {
      units: preferences && UNITS.includes(preferences.units) ? preferences.units : 'metric',
      timezone: preferences && typeof preferences.timezone === 'string' ? preferences.timezone.slice(0, 50) : 'UTC'
    };
    this.profileStatus = PROFILE_STATUSES.includes(profileStatus) ? profileStatus : 'active';
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  toFirestore () {
    return {
      uid: this.uid,
      displayName: this.displayName,
      photoURL: this.photoURL,
      email: this.email,
      phoneNumber: this.phoneNumber,
      emailVerified: this.emailVerified,
      preferences: this.preferences,
      profileStatus: this.profileStatus,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  toSafeJSON () {
    return {
      uid: this.uid,
      displayName: this.displayName,
      photoURL: this.photoURL,
      email: this.email,
      phoneNumber: this.phoneNumber,
      emailVerified: this.emailVerified,
      preferences: this.preferences,
      profileStatus: this.profileStatus,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    };
  }

  static fromFirestore (data, uid) {
    if (!data) return null;
    const toDate = val => {
      if (!val) return new Date();
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    return new User({
      uid: uid || data.uid,
      displayName: data.displayName,
      photoURL: data.photoURL,
      email: data.email,
      phoneNumber: data.phoneNumber,
      emailVerified: data.emailVerified,
      preferences: data.preferences,
      profileStatus: data.profileStatus,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt)
    });
  }
}

User.PROFILE_STATUSES = PROFILE_STATUSES;
User.UNITS = UNITS;

module.exports = User;

'use strict';

const crypto = require('crypto');

const REVOCATION_REASONS = Object.freeze({
  LOGOUT: 'LOGOUT',
  ROTATED: 'ROTATED',
  REUSE_DETECTED: 'REUSE_DETECTED',
  ADMIN_REVOCATION: 'ADMIN_REVOCATION',
  USER_REQUEST: 'USER_REQUEST'
});

const CLIENT_TYPES = Object.freeze(['web', 'expo']);

class Session {
  constructor ({
    sessionId = crypto.randomUUID(),
    uid,
    refreshTokenHash,
    tokenFamilyId = crypto.randomUUID(),
    createdAt = new Date(),
    expiresAt,
    lastUsedAt = null,
    revokedAt = null,
    revocationReason = null,
    refreshTokenVersion = 1,
    clientType = null,
    deviceLabel = null
  } = {}) {
    if (!uid || typeof uid !== 'string' || !uid.trim()) {
      throw new TypeError('Session requires a non-empty string uid');
    }
    if (!refreshTokenHash || typeof refreshTokenHash !== 'string' || refreshTokenHash.length !== 64) {
      throw new TypeError('Session requires a valid 64-character SHA-256 refreshTokenHash');
    }

    this.sessionId = sessionId;
    this.uid = uid.trim();
    this.refreshTokenHash = refreshTokenHash.toLowerCase();
    this.tokenFamilyId = tokenFamilyId;
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.expiresAt = expiresAt ? (expiresAt instanceof Date ? expiresAt : new Date(expiresAt)) : new Date(this.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    this.lastUsedAt = lastUsedAt ? (lastUsedAt instanceof Date ? lastUsedAt : new Date(lastUsedAt)) : null;
    this.revokedAt = revokedAt ? (revokedAt instanceof Date ? revokedAt : new Date(revokedAt)) : null;
    this.revocationReason = revocationReason || null;
    this.refreshTokenVersion = Number.isInteger(refreshTokenVersion) && refreshTokenVersion > 0 ? refreshTokenVersion : 1;
    this.clientType = clientType && CLIENT_TYPES.includes(clientType) ? clientType : null;
    this.deviceLabel = deviceLabel && typeof deviceLabel === 'string' ? deviceLabel.slice(0, 100) : null;
  }

  isExpired (referenceDate = new Date()) {
    const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    return ref.getTime() >= this.expiresAt.getTime();
  }

  isRevoked () {
    return this.revokedAt !== null;
  }

  isActive (referenceDate = new Date()) {
    return !this.isRevoked() && !this.isExpired(referenceDate);
  }

  toFirestore () {
    return {
      sessionId: this.sessionId,
      uid: this.uid,
      refreshTokenHash: this.refreshTokenHash,
      tokenFamilyId: this.tokenFamilyId,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      lastUsedAt: this.lastUsedAt,
      revokedAt: this.revokedAt,
      revocationReason: this.revocationReason,
      refreshTokenVersion: this.refreshTokenVersion,
      clientType: this.clientType,
      deviceLabel: this.deviceLabel
    };
  }

  static fromFirestore (data, id) {
    if (!data) return null;
    const toDate = val => {
      if (!val) return null;
      if (typeof val.toDate === 'function') return val.toDate();
      return new Date(val);
    };

    return new Session({
      sessionId: id || data.sessionId,
      uid: data.uid,
      refreshTokenHash: data.refreshTokenHash,
      tokenFamilyId: data.tokenFamilyId,
      createdAt: toDate(data.createdAt),
      expiresAt: toDate(data.expiresAt),
      lastUsedAt: toDate(data.lastUsedAt),
      revokedAt: toDate(data.revokedAt),
      revocationReason: data.revocationReason,
      refreshTokenVersion: data.refreshTokenVersion,
      clientType: data.clientType,
      deviceLabel: data.deviceLabel
    });
  }
}

Session.REVOCATION_REASONS = REVOCATION_REASONS;
Session.CLIENT_TYPES = CLIENT_TYPES;

module.exports = Session;

'use strict';

const crypto = require('crypto');
const Session = require('../../../models/Session');

const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

class SessionStoreError extends Error {
  constructor (code, message) {
    super(message);
    this.name = 'SessionStoreError';
    this.code = code;
  }
}

class SessionStore {
  constructor (firestore = null) {
    this.firestore = firestore;
  }

  static hashSecret (secret) {
    return crypto.createHash('sha256').update(String(secret)).digest('hex');
  }

  static generateSecret () {
    return crypto.randomBytes(32).toString('hex');
  }

  static formatRefreshToken (sessionId, secret) {
    return `${sessionId}.${secret}`;
  }

  static parseRefreshToken (token) {
    if (typeof token !== 'string') {
      return null;
    }
    const dotIndex = token.indexOf('.');
    if (dotIndex === -1) {
      return null;
    }
    const sessionId = token.slice(0, dotIndex).trim();
    const secret = token.slice(dotIndex + 1).trim();
    if (!sessionId || !secret || secret.length !== 64) {
      return null;
    }
    return { sessionId, secret };
  }

  getDb () {
    if (this.firestore) {
      return this.firestore;
    }
    const { getFirestoreDb } = require('../../../config/firebase');
    this.firestore = getFirestoreDb();
    return this.firestore;
  }

  async createSession (uid, { clientType = null, deviceLabel = null, ttlSeconds = DEFAULT_SESSION_TTL_SECONDS } = {}) {
    if (!uid || typeof uid !== 'string' || !uid.trim()) {
      throw new TypeError('uid is required to create a session');
    }

    const sessionId = crypto.randomUUID();
    const secret = SessionStore.generateSecret();
    const refreshTokenHash = SessionStore.hashSecret(secret);
    const tokenFamilyId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const session = new Session({
      sessionId,
      uid: uid.trim(),
      refreshTokenHash,
      tokenFamilyId,
      createdAt: now,
      expiresAt,
      lastUsedAt: now,
      refreshTokenVersion: 1,
      clientType,
      deviceLabel
    });

    const db = this.getDb();
    if (db) {
      await db.collection('sessions').doc(sessionId).set(session.toFirestore());
    }

    return {
      sessionId,
      uid: session.uid,
      refreshToken: SessionStore.formatRefreshToken(sessionId, secret),
      expiresAt: session.expiresAt,
      tokenFamilyId: session.tokenFamilyId
    };
  }

  async rotateSession (refreshToken) {
    const parsed = SessionStore.parseRefreshToken(refreshToken);
    if (!parsed) {
      throw new SessionStoreError('AUTH_TOKEN_MALFORMED', 'The refresh token format is invalid');
    }

    const { sessionId, secret } = parsed;
    const incomingHash = SessionStore.hashSecret(secret);
    const db = this.getDb();

    if (!db) {
      throw new SessionStoreError('STORE_UNAVAILABLE', 'Firestore session store is unavailable');
    }

    return await db.runTransaction(async (transaction) => {
      const sessionRef = db.collection('sessions').doc(sessionId);
      const docSnapshot = await transaction.get(sessionRef);

      if (!docSnapshot.exists) {
        throw new SessionStoreError('SESSION_NOT_FOUND', 'Session not found');
      }

      const session = Session.fromFirestore(docSnapshot.data(), sessionId);
      const now = new Date();

      if (session.isExpired(now)) {
        throw new SessionStoreError('AUTH_TOKEN_EXPIRED', 'The refresh token session has expired');
      }

      if (session.isRevoked()) {
        throw new SessionStoreError('AUTH_TOKEN_REVOKED', 'The session has been revoked');
      }

      // Constant-time compare of refresh token hash
      const bufStored = Buffer.from(session.refreshTokenHash, 'hex');
      const bufIncoming = Buffer.from(incomingHash, 'hex');
      const isMatch = bufStored.length === bufIncoming.length && crypto.timingSafeEqual(bufStored, bufIncoming);

      if (!isMatch) {
        // REUSE DETECTED: A previously used or invalid token was submitted!
        // Immediately revoke session
        transaction.update(sessionRef, {
          revokedAt: now,
          revocationReason: Session.REVOCATION_REASONS.REUSE_DETECTED
        });

        throw new SessionStoreError('AUTH_TOKEN_REUSED', 'Refresh token reuse detected; session revoked');
      }

      // Generate new rotated secret
      const newSecret = SessionStore.generateSecret();
      const newHash = SessionStore.hashSecret(newSecret);
      const newVersion = session.refreshTokenVersion + 1;

      transaction.update(sessionRef, {
        refreshTokenHash: newHash,
        refreshTokenVersion: newVersion,
        lastUsedAt: now
      });

      return {
        sessionId,
        uid: session.uid,
        tokenFamilyId: session.tokenFamilyId,
        newRefreshToken: SessionStore.formatRefreshToken(sessionId, newSecret),
        refreshTokenVersion: newVersion
      };
    });
  }

  async revokeSession (sessionIdOrToken, reason = Session.REVOCATION_REASONS.LOGOUT) {
    let sessionId = sessionIdOrToken;
    if (typeof sessionIdOrToken === 'string' && sessionIdOrToken.includes('.')) {
      const parsed = SessionStore.parseRefreshToken(sessionIdOrToken);
      if (parsed) {
        sessionId = parsed.sessionId;
      }
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return false;
    }

    const db = this.getDb();
    if (!db) {
      return false;
    }

    const sessionRef = db.collection('sessions').doc(sessionId);
    const docSnapshot = await sessionRef.get();
    if (!docSnapshot.exists) {
      return false;
    }

    const now = new Date();
    await sessionRef.update({
      revokedAt: now,
      revocationReason: reason
    });

    return true;
  }

  async getSession (sessionId) {
    if (!sessionId || typeof sessionId !== 'string') {
      return null;
    }
    const db = this.getDb();
    if (!db) {
      return null;
    }
    const docSnapshot = await db.collection('sessions').doc(sessionId).get();
    if (!docSnapshot.exists) {
      return null;
    }
    return Session.fromFirestore(docSnapshot.data(), sessionId);
  }
}

let defaultStore = null;
function getSessionStore (firestore) {
  if (firestore) {
    return new SessionStore(firestore);
  }
  if (!defaultStore) {
    defaultStore = new SessionStore();
  }
  return defaultStore;
}

module.exports = {
  SessionStore,
  SessionStoreError,
  getSessionStore,
  DEFAULT_SESSION_TTL_SECONDS
};

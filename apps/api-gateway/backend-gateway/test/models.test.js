'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { Session, User } = require('../models');

test('Session model validates required fields, expiry, and revocation', () => {
  const hash = crypto.createHash('sha256').update('sample-secret').digest('hex');
  const session = new Session({
    uid: 'firebase-user-1',
    refreshTokenHash: hash,
    clientType: 'web'
  });

  assert.equal(session.uid, 'firebase-user-1');
  assert.equal(session.refreshTokenHash, hash);
  assert.equal(session.clientType, 'web');
  assert.equal(session.isActive(), true);
  assert.equal(session.isRevoked(), false);
  assert.equal(session.isExpired(), false);

  // Rejects missing uid or bad hash
  assert.throws(() => new Session({ uid: '', refreshTokenHash: hash }), TypeError);
  assert.throws(() => new Session({ uid: 'user', refreshTokenHash: 'too-short' }), TypeError);

  // Serialization to and from Firestore
  const firestoreDoc = session.toFirestore();
  assert.equal(firestoreDoc.refreshTokenHash, hash);
  const hydrated = Session.fromFirestore(firestoreDoc, session.sessionId);
  assert.equal(hydrated.sessionId, session.sessionId);
  assert.equal(hydrated.uid, 'firebase-user-1');

  // Test expired session
  const expiredSession = new Session({
    uid: 'user-2',
    refreshTokenHash: hash,
    expiresAt: new Date(Date.now() - 1000)
  });
  assert.equal(expiredSession.isExpired(), true);
  assert.equal(expiredSession.isActive(), false);

  // Test revoked session
  const revokedSession = new Session({
    uid: 'user-3',
    refreshTokenHash: hash,
    revokedAt: new Date(),
    revocationReason: Session.REVOCATION_REASONS.LOGOUT
  });
  assert.equal(revokedSession.isRevoked(), true);
  assert.equal(revokedSession.isActive(), false);
});

test('User model serializes to safe JSON without leaking internal metadata', () => {
  const user = new User({
    uid: 'user-123',
    email: 'VIKING@LAGERTHA.DEV',
    displayName: 'Lagertha',
    emailVerified: true
  });

  assert.equal(user.email, 'viking@lagertha.dev');
  assert.equal(user.preferences.units, 'metric');
  assert.equal(user.profileStatus, 'active');

  const safeJson = user.toSafeJSON();
  assert.equal(safeJson.uid, 'user-123');
  assert.equal(safeJson.email, 'viking@lagertha.dev');
  assert.ok(typeof safeJson.createdAt === 'string');

  const doc = user.toFirestore();
  const hydrated = User.fromFirestore(doc, 'user-123');
  assert.equal(hydrated.uid, 'user-123');
  assert.equal(hydrated.displayName, 'Lagertha');
});

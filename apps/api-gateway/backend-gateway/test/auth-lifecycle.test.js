'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const firebaseStub = require('./helpers/firebase-stub');
const { createAccessTokenService } = require('../plugins/firebase-auth/lib/access-token');
const { SessionStore, SessionStoreError } = require('../plugins/firebase-auth/lib/session-store');
const { UserStore } = require('../plugins/firebase-auth/lib/user-store');
const { createSessionHandler } = require('../plugins/firebase-auth/lib/create-session');
const { createRefreshHandler } = require('../plugins/firebase-auth/lib/refresh-session');
const { createLogoutHandler } = require('../plugins/firebase-auth/lib/logout-session');
const { createMeHandler } = require('../plugins/firebase-auth/lib/auth-me');
const Session = require('../models/Session');

const SECRET = 'test-only-access-token-signing-key-0123456789';
const ISSUER = 'https://auth.lagertha.test';
const AUDIENCE = 'lagertha-api-test';
const tokenService = createAccessTokenService({
  LAGERTHA_ACCESS_TOKEN_SECRET: SECRET,
  LAGERTHA_ACCESS_TOKEN_ISSUER: ISSUER,
  LAGERTHA_ACCESS_TOKEN_AUDIENCE: AUDIENCE
});

function createMockFirestore () {
  const store = new Map(); // collection -> docId -> data

  function getCollection (col) {
    if (!store.has(col)) {
      store.set(col, new Map());
    }
    return store.get(col);
  }

  let transactionQueue = Promise.resolve();

  const firestore = {
    _store: store,
    collection (colName) {
      const colMap = getCollection(colName);
      return {
        doc (docId) {
          return {
            id: docId,
            async get () {
              const data = colMap.get(docId);
              return {
                exists: data !== undefined,
                id: docId,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
              };
            },
            async set (data) {
              colMap.set(docId, JSON.parse(JSON.stringify(data)));
            },
            async update (updates) {
              const existing = colMap.get(docId);
              if (!existing) {
                throw new Error(`Doc ${docId} does not exist`);
              }
              const merged = { ...existing, ...JSON.parse(JSON.stringify(updates)) };
              colMap.set(docId, merged);
            }
          };
        }
      };
    },
    async runTransaction (updateFunction) {
      // In Firestore, concurrent transactions on the same document are sequenced/retried.
      const task = async () => {
        const transaction = {
          async get (docRef) {
            return await docRef.get();
          },
          async set (docRef, data) {
            return await docRef.set(data);
          },
          async update (docRef, updates) {
            return await docRef.update(updates);
          }
        };
        return await updateFunction(transaction);
      };

      const result = transactionQueue.then(task, task);
      transactionQueue = result;
      return await result;
    }
  };

  return firestore;
}

function makeResponse () {
  return {
    statusCode: 200,
    headersSent: false,
    headers: {},
    locals: {},
    body: null,
    status (code) {
      this.statusCode = code;
      return this;
    },
    json (body) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
    setHeader (name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader (name) {
      return this.headers[name.toLowerCase()];
    }
  };
}

function makeRequest (options = {}) {
  return {
    originalUrl: options.url || '/auth/session',
    headers: options.headers || {},
    body: options.body || {},
    egContext: options.egContext || { requestID: 'test-req-id' },
    user: options.user || null,
    lagerthaIdentity: options.lagerthaIdentity || null
  };
}

test.beforeEach(() => {
  firebaseStub.reset();
});

test('SessionStore creates persistent session in Firestore without storing raw token', async () => {
  const mockDb = createMockFirestore();
  const sessionStore = new SessionStore(mockDb);

  const session = await sessionStore.createSession('firebase-uid-1', {
    clientType: 'web',
    deviceLabel: 'MacBook Pro'
  });

  assert.ok(session.sessionId);
  assert.ok(session.refreshToken.startsWith(session.sessionId + '.'));
  assert.equal(session.uid, 'firebase-uid-1');

  // Verify Firestore document
  const rawDoc = mockDb._store.get('sessions').get(session.sessionId);
  assert.ok(rawDoc);
  assert.equal(rawDoc.uid, 'firebase-uid-1');
  assert.equal(rawDoc.clientType, 'web');
  assert.equal(rawDoc.deviceLabel, 'MacBook Pro');
  assert.equal(rawDoc.revokedAt, null);
  assert.equal(rawDoc.refreshTokenVersion, 1);

  // Assert raw secret is NOT stored in the database
  const secret = session.refreshToken.split('.')[1];
  assert.notEqual(rawDoc.refreshTokenHash, secret);
  assert.equal(rawDoc.refreshTokenHash, SessionStore.hashSecret(secret));
});

test('SessionStore rotates token atomically and increments version', async () => {
  const mockDb = createMockFirestore();
  const sessionStore = new SessionStore(mockDb);

  const session = await sessionStore.createSession('firebase-uid-2');
  const initialToken = session.refreshToken;

  const rotation = await sessionStore.rotateSession(initialToken);
  assert.equal(rotation.sessionId, session.sessionId);
  assert.equal(rotation.uid, 'firebase-uid-2');
  assert.equal(rotation.refreshTokenVersion, 2);
  assert.notEqual(rotation.newRefreshToken, initialToken);

  // Check updated database state
  const updatedDoc = mockDb._store.get('sessions').get(session.sessionId);
  assert.equal(updatedDoc.refreshTokenVersion, 2);
  assert.equal(updatedDoc.revokedAt, null);
  const newSecret = rotation.newRefreshToken.split('.')[1];
  assert.equal(updatedDoc.refreshTokenHash, SessionStore.hashSecret(newSecret));
});

test('SessionStore detects token reuse, immediately revokes session and throws AUTH_TOKEN_REUSED', async () => {
  const mockDb = createMockFirestore();
  const sessionStore = new SessionStore(mockDb);

  const session = await sessionStore.createSession('firebase-uid-3');
  const tokenV1 = session.refreshToken;

  // Legitimate first rotation
  const rot1 = await sessionStore.rotateSession(tokenV1);
  assert.equal(rot1.refreshTokenVersion, 2);

  // Attacker attempts to replay tokenV1
  await assert.rejects(
    sessionStore.rotateSession(tokenV1),
    err => {
      assert.equal(err.code, 'AUTH_TOKEN_REUSED');
      return true;
    }
  );

  // Verify that the session is now revoked in Firestore
  const revokedDoc = mockDb._store.get('sessions').get(session.sessionId);
  assert.ok(revokedDoc.revokedAt !== null);
  assert.equal(revokedDoc.revocationReason, Session.REVOCATION_REASONS.REUSE_DETECTED);

  // Attempting to rotate with legitimate tokenV2 now fails because session was revoked
  await assert.rejects(
    sessionStore.rotateSession(rot1.newRefreshToken),
    err => {
      assert.equal(err.code, 'AUTH_TOKEN_REVOKED');
      return true;
    }
  );
});

test('Concurrent refresh requests with the same token result in one success and one failure', async () => {
  const mockDb = createMockFirestore();
  const sessionStore = new SessionStore(mockDb);

  const session = await sessionStore.createSession('concurrent-uid');
  const token = session.refreshToken;

  // Fire two rotation attempts concurrently
  const [res1, res2] = await Promise.allSettled([
    sessionStore.rotateSession(token),
    sessionStore.rotateSession(token)
  ]);

  // One must succeed and one must fail (due to token reuse / revocation)
  const succeeded = [res1, res2].filter(r => r.status === 'fulfilled');
  const rejected = [res1, res2].filter(r => r.status === 'rejected');

  assert.equal(succeeded.length, 1, 'Exactly one concurrent refresh should succeed');
  assert.equal(rejected.length, 1, 'Exactly one concurrent refresh should fail');
  assert.ok(
    rejected[0].reason.code === 'AUTH_TOKEN_REUSED' || rejected[0].reason.code === 'AUTH_TOKEN_REVOKED',
    'Failing concurrent refresh was rejected for reuse or revocation'
  );
});


test('SessionStore rejects expired sessions', async () => {
  const mockDb = createMockFirestore();
  const sessionStore = new SessionStore(mockDb);

  const session = await sessionStore.createSession('firebase-uid-4', { ttlSeconds: -10 }); // already expired
  await assert.rejects(
    sessionStore.rotateSession(session.refreshToken),
    err => {
      assert.equal(err.code, 'AUTH_TOKEN_EXPIRED');
      return true;
    }
  );
});

test('SessionStore revokes session on logout', async () => {
  const mockDb = createMockFirestore();
  const sessionStore = new SessionStore(mockDb);

  const session = await sessionStore.createSession('firebase-uid-5');
  const revoked = await sessionStore.revokeSession(session.refreshToken, Session.REVOCATION_REASONS.LOGOUT);
  assert.equal(revoked, true);

  const doc = mockDb._store.get('sessions').get(session.sessionId);
  assert.ok(doc.revokedAt !== null);
  assert.equal(doc.revocationReason, 'LOGOUT');
});

test('POST /auth/session creates persistent session, upserts user profile, and returns both access & refresh tokens', async () => {
  const mockDb = createMockFirestore();
  const sessionStore = new SessionStore(mockDb);
  const userStore = new UserStore(mockDb);

  const handler = createSessionHandler({
    verifyFirebaseIdToken: firebaseStub.defaultVerifyIdToken,
    tokenService,
    sessionStore,
    userStore
  });

  const req = makeRequest({
    url: '/auth/session',
    headers: { authorization: `Bearer ${firebaseStub.VALID_TOKEN}` },
    body: { clientType: 'web', deviceLabel: 'Safari on iPhone' }
  });
  const res = makeResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.accessToken);
  assert.ok(res.body.data.refreshToken);
  assert.equal(res.body.data.tokenType, 'Bearer');
  assert.equal(res.body.data.expiresIn, 900);

  // Verify access token is a valid Lagertha JWT
  const verified = tokenService.verify(res.body.data.accessToken);
  assert.equal(verified.sub, 'test-user-123');

  // Verify user was provisioned in Firestore users/{uid}
  const userDoc = mockDb._store.get('users').get('test-user-123');
  assert.ok(userDoc);
  assert.equal(userDoc.uid, 'test-user-123');
  assert.equal(userDoc.email, 'tester@example.com');
  assert.equal(userDoc.displayName, 'Test User');
  assert.equal(userDoc.profileStatus, 'active');
});

test('POST /auth/refresh rotates token, issues new access token, and rejects invalid inputs', async () => {
  const mockDb = createMockFirestore();
  const sessionStore = new SessionStore(mockDb);
  const refreshHandler = createRefreshHandler({ tokenService, sessionStore });

  // Create active session
  const session = await sessionStore.createSession('test-user-123');

  // Test missing token
  const emptyRes = makeResponse();
  await refreshHandler(makeRequest({ body: {} }), emptyRes);
  assert.equal(emptyRes.statusCode, 401);
  assert.equal(emptyRes.body.error.code, 'AUTH_TOKEN_MISSING');

  // Test successful refresh via body
  const successRes = makeResponse();
  await refreshHandler(makeRequest({ body: { refreshToken: session.refreshToken } }), successRes);
  assert.equal(successRes.statusCode, 200);
  assert.equal(successRes.body.success, true);
  assert.ok(successRes.body.data.accessToken);
  assert.ok(successRes.body.data.refreshToken);
  assert.notEqual(successRes.body.data.refreshToken, session.refreshToken);
  assert.equal(tokenService.verify(successRes.body.data.accessToken).sub, 'test-user-123');

  // Test successful refresh via cookie
  const cookieRes = makeResponse();
  await refreshHandler(makeRequest({
    headers: { cookie: `refresh-token=${encodeURIComponent(successRes.body.data.refreshToken)}` }
  }), cookieRes);
  assert.equal(cookieRes.statusCode, 200);
  assert.ok(cookieRes.body.data.accessToken);

  // Test malformed token
  const malformedRes = makeResponse();
  await refreshHandler(makeRequest({ body: { refreshToken: 'invalid-token' } }), malformedRes);
  assert.equal(malformedRes.statusCode, 401);
  assert.equal(malformedRes.body.error.code, 'AUTH_TOKEN_MALFORMED');
});

test('POST /auth/logout revokes session and clears cookies', async () => {
  const mockDb = createMockFirestore();
  const sessionStore = new SessionStore(mockDb);
  const logoutHandler = createLogoutHandler({ sessionStore });

  const session = await sessionStore.createSession('test-user-logout');
  const res = makeResponse();

  await logoutHandler(makeRequest({ body: { refreshToken: session.refreshToken } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);

  // Session must now be revoked in Firestore
  const doc = mockDb._store.get('sessions').get(session.sessionId);
  assert.ok(doc.revokedAt !== null);

  // Cookies must be cleared
  const setCookie = res.headers['set-cookie'];
  assert.ok(setCookie);
  assert.ok(setCookie.some(c => c.includes('access-token=') && c.includes('Max-Age=0')));
  assert.ok(setCookie.some(c => c.includes('refresh-token=') && c.includes('Max-Age=0')));
});

test('GET /auth/me returns authenticated user profile without sensitive data', async () => {
  const mockDb = createMockFirestore();
  const userStore = new UserStore(mockDb);
  const meHandler = createMeHandler({ userStore, tokenService });

  // Provision test user
  await userStore.upsertFromFirebaseClaims({
    uid: 'viking-warrior-1',
    email: 'lagertha@kattegat.dev',
    name: 'Lagertha Lothbrok',
    picture: 'https://cdn.lagertha.dev/avatar.jpg'
  });

  const validJwt = tokenService.issue('viking-warrior-1');

  // Request with valid access token in Authorization header
  const req = makeRequest({
    url: '/auth/me',
    headers: { authorization: `Bearer ${validJwt}` }
  });
  const res = makeResponse();

  await meHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.uid, 'viking-warrior-1');
  assert.equal(res.body.data.displayName, 'Lagertha Lothbrok');
  assert.equal(res.body.data.email, 'lagertha@kattegat.dev');
  assert.equal(res.body.data.preferences.units, 'metric');
  assert.equal(res.body.data.profileStatus, 'active');
  assert.equal(res.body.data.refreshToken, undefined);
  assert.equal(res.body.data.refreshTokenHash, undefined);

  // Unauthenticated request is rejected
  const unauthRes = makeResponse();
  await meHandler(makeRequest({ url: '/auth/me' }), unauthRes);
  assert.equal(unauthRes.statusCode, 401);
  assert.equal(unauthRes.body.error.code, 'ACCESS_TOKEN_MISSING');
});

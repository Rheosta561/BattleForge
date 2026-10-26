'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const firebaseStub = require('./helpers/firebase-stub');
const { createAccessTokenService } = require('../plugins/firebase-auth/lib/access-token');
const { authenticateAccessToken } = require('../plugins/firebase-auth/lib/access-authenticate');
const { createSessionHandler } = require('../plugins/firebase-auth/lib/create-session');
const { verifyFirebaseIdToken } = require('../plugins/firebase-auth/lib/authenticate');
const lagerthaAuthPolicy = require('../plugins/firebase-auth/policies/lagertha-auth');

const SECRET = 'test-only-access-token-signing-key-0123456789';
const ISSUER = 'https://auth.lagertha.test';
const AUDIENCE = 'lagertha-api-test';
const testEnv = {
  LAGERTHA_ACCESS_TOKEN_SECRET: SECRET,
  LAGERTHA_ACCESS_TOKEN_ISSUER: ISSUER,
  LAGERTHA_ACCESS_TOKEN_AUDIENCE: AUDIENCE
};
const tokenService = createAccessTokenService(testEnv);

function makeResponse () {
  return {
    statusCode: 200,
    headersSent: false,
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
    setHeader () {}
  };
}

function makeRequest (authorization, originalUrl = '/users', headers = {}) {
  return {
    originalUrl,
    headers: {
      ...headers,
      ...(authorization === undefined ? {} : { authorization })
    },
    egContext: { requestID: 'jwt-test' }
  };
}

function runAccessPolicy (req, res, service = tokenService) {
  return new Promise((resolve, reject) => {
    const originalJson = res.json.bind(res);
    res.json = body => {
      originalJson(body);
      resolve();
    };

    authenticateAccessToken(req, res, err => {
      if (err) {
        reject(err);
      } else {
        resolve(true);
      }
    }, { tokenService: service });
  });
}

function signToken (overrides = {}, signingSecret = SECRET, algorithm = 'HS256', expiresIn = 900) {
  const claims = {
    token_use: 'lagertha_access',
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'firebase-user-123',
    jti: 'test-token-id',
    ...overrides
  };

  return jwt.sign(claims, signingSecret, {
    algorithm,
    expiresIn
  });
}

test.beforeEach(() => {
  firebaseStub.reset();
});

test('issues a short-lived JWT with required claims and minimal identity data', () => {
  const token = tokenService.issue('verified-firebase-uid');
  const claims = tokenService.verify(token);
  const decoded = jwt.decode(token, { complete: true });

  assert.equal(decoded.header.alg, 'HS256');
  assert.equal(claims.iss, ISSUER);
  assert.equal(claims.aud, AUDIENCE);
  assert.equal(claims.sub, 'verified-firebase-uid');
  assert.equal(claims.token_use, 'lagertha_access');
  assert.ok(claims.jti);
  assert.ok(Number.isInteger(claims.iat));
  assert.equal(claims.exp - claims.iat, 900);
  assert.equal(Object.keys(claims).sort().join(','), 'aud,exp,iat,iss,jti,sub,token_use');
  assert.notEqual(tokenService.issue('verified-firebase-uid'), token);
});

test('missing or weak signing configuration fails securely', () => {
  assert.throws(
    () => createAccessTokenService({}),
    /LAGERTHA_ACCESS_TOKEN_SECRET must be configured/
  );
  assert.throws(
    () => createAccessTokenService({ ...testEnv, LAGERTHA_ACCESS_TOKEN_SECRET: 'short' }),
    /at least 32 bytes/
  );
  assert.throws(
    () => createAccessTokenService({ ...testEnv, LAGERTHA_ACCESS_TOKEN_ISSUER: '' }),
    /LAGERTHA_ACCESS_TOKEN_ISSUER must be configured/
  );
  assert.throws(
    () => createAccessTokenService({ ...testEnv, LAGERTHA_ACCESS_TOKEN_AUDIENCE: '' }),
    /LAGERTHA_ACCESS_TOKEN_AUDIENCE must be configured/
  );
});

test('gateway access policy cannot be constructed without signing configuration', () => {
  const names = [
    'LAGERTHA_ACCESS_TOKEN_SECRET',
    'LAGERTHA_ACCESS_TOKEN_ISSUER',
    'LAGERTHA_ACCESS_TOKEN_AUDIENCE'
  ];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));

  for (const name of names) {
    delete process.env[name];
  }

  try {
    assert.throws(
      () => lagerthaAuthPolicy.policy({}),
      /LAGERTHA_ACCESS_TOKEN_SECRET must be configured/
    );
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous[name];
      }
    }
  }
});

test('Firebase service-account private key cannot be reused as the access-token secret', () => {
  const privateKey = '-----BEGIN PRIVATE KEY-----test-only-----END PRIVATE KEY-----';
  assert.throws(
    () => createAccessTokenService({
      ...testEnv,
      LAGERTHA_ACCESS_TOKEN_SECRET: privateKey,
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ private_key: privateKey })
    }),
    /must be dedicated/
  );
});

test('valid access JWT authenticates and attaches the Lagertha identity', async () => {
  const token = tokenService.issue('verified-firebase-uid');
  const req = makeRequest(`Bearer ${token}`);
  const res = makeResponse();
  let nextCalls = 0;

  await new Promise((resolve, reject) => {
    authenticateAccessToken(req, res, err => {
      if (err) return reject(err);
      nextCalls++;
      resolve();
    }, { tokenService });
  });

  assert.equal(nextCalls, 1);
  assert.equal(req.egContext.lagertha.uid, 'verified-firebase-uid');
  assert.equal(req.lagerthaIdentity, req.egContext.lagertha);
  assert.equal(req.user, req.egContext.lagertha);
  assert.ok(Object.isFrozen(req.lagerthaIdentity));
});

test('access JWT cookie is accepted and conflicting credentials are rejected', async () => {
  const token = tokenService.issue('verified-firebase-uid');
  const cookieRequest = makeRequest(undefined, '/users', { cookie: `access-token=${token}` });
  const cookieResponse = makeResponse();
  await runAccessPolicy(cookieRequest, cookieResponse);
  assert.equal(cookieRequest.egContext.lagertha.uid, 'verified-firebase-uid');

  const conflicting = makeRequest(`Bearer ${token}`, '/users', { cookie: 'access-token=another-token' });
  const conflictingResponse = makeResponse();
  await runAccessPolicy(conflicting, conflictingResponse);
  assert.equal(conflictingResponse.statusCode, 401);
  assert.equal(conflictingResponse.body.error.code, 'ACCESS_TOKEN_CONFLICT');
});

test('missing and malformed access credentials are rejected', async () => {
  for (const [authorization, expectedCode] of [
    [undefined, 'ACCESS_TOKEN_MISSING'],
    ['Bearer', 'ACCESS_TOKEN_MALFORMED'],
    ['Basic dXNlcg==', 'ACCESS_TOKEN_MALFORMED']
  ]) {
    const res = makeResponse();
    await runAccessPolicy(makeRequest(authorization), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, expectedCode);
  }
});

test('expired, incorrectly signed, wrong issuer, and wrong audience tokens are rejected', async () => {
  const tokens = [
    [signToken({}, SECRET, 'HS256', -1), 'ACCESS_TOKEN_EXPIRED'],
    [signToken({}, 'different-test-only-signing-key-0123456789'), 'ACCESS_TOKEN_INVALID'],
    [signToken({ iss: 'https://wrong-issuer.test' }), 'ACCESS_TOKEN_INVALID'],
    [signToken({ aud: 'wrong-audience' }), 'ACCESS_TOKEN_INVALID']
  ];

  for (const [token, expectedCode] of tokens) {
    const res = makeResponse();
    await runAccessPolicy(makeRequest(`Bearer ${token}`), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, expectedCode);
    assert.ok(!JSON.stringify(res.body).includes(SECRET));
    assert.ok(!JSON.stringify(res.body).includes(token));
  }
});

test('unexpected signing algorithms are rejected', async () => {
  const token = signToken({}, SECRET, 'HS384');
  const res = makeResponse();

  await runAccessPolicy(makeRequest(`Bearer ${token}`), res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'ACCESS_TOKEN_INVALID');
});

test('Firebase ID tokens are not accepted as Lagertha access tokens', async () => {
  const res = makeResponse();

  await runAccessPolicy(makeRequest(`Bearer ${firebaseStub.VALID_TOKEN}`), res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'ACCESS_TOKEN_INVALID');
});

test('Lagertha access tokens are not accepted as Firebase ID tokens', async () => {
  const token = tokenService.issue('verified-firebase-uid');

  await assert.rejects(verifyFirebaseIdToken(token));
});

test('session endpoint verifies Firebase identity before issuing only an access token', async () => {
  const handler = createSessionHandler({
    verifyFirebaseIdToken: firebaseStub.defaultVerifyIdToken,
    tokenService
  });
  const res = makeResponse();

  await handler(makeRequest(`Bearer ${firebaseStub.VALID_TOKEN}`, '/auth/session'), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.tokenType, 'Bearer');
  assert.equal(res.body.data.expiresIn, 900);
  assert.equal(res.body.data.refreshToken, undefined);
  assert.equal(tokenService.verify(res.body.data.accessToken).sub, 'test-user-123');
});

test('session endpoint accepts an access-token cookie containing a Firebase ID token', async () => {
  const handler = createSessionHandler({
    verifyFirebaseIdToken: firebaseStub.defaultVerifyIdToken,
    tokenService
  });
  const res = makeResponse();

  await handler(makeRequest(undefined, '/auth/session', {
    cookie: `access-token=${firebaseStub.VALID_TOKEN}`
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(tokenService.verify(res.body.data.accessToken).sub, 'test-user-123');
});

test('session endpoint rejects missing and invalid Firebase ID tokens', async () => {
  const handler = createSessionHandler({
    verifyFirebaseIdToken: firebaseStub.defaultVerifyIdToken,
    tokenService
  });

  for (const [authorization, expectedCode] of [
    [undefined, 'AUTH_TOKEN_MISSING'],
    ['Bearer', 'AUTH_TOKEN_MALFORMED'],
    [`Bearer ${firebaseStub.EXPIRED_TOKEN}`, 'AUTH_TOKEN_EXPIRED'],
    ['Bearer invalid-test-token', 'AUTH_TOKEN_INVALID']
  ]) {
    const res = makeResponse();
    await handler(makeRequest(authorization, '/auth/session'), res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error.code, expectedCode);
    assert.ok(!JSON.stringify(res.body).includes('test-user-123'));
    assert.ok(!JSON.stringify(res.body).includes('invalid signature'));
  }
});

test('session endpoint rejects conflicting header and cookie Firebase credentials', async () => {
  let verificationCalls = 0;
  const handler = createSessionHandler({
    verifyFirebaseIdToken: async () => {
      verificationCalls++;
      return firebaseStub.defaultClaims;
    },
    tokenService
  });
  const res = makeResponse();

  await handler(makeRequest(`Bearer ${firebaseStub.VALID_TOKEN}`, '/auth/session', {
    cookie: 'access-token=another-firebase-token'
  }), res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'AUTH_TOKEN_CONFLICT');
  assert.equal(verificationCalls, 0);
});

test('health remains public while user APIs reject Firebase ID tokens', async () => {
  const healthRes = makeResponse();
  let healthNextCalls = 0;
  authenticateAccessToken(makeRequest(undefined, '/health'), healthRes, () => {
    healthNextCalls++;
  }, { publicPaths: ['/health'], tokenService });
  assert.equal(healthNextCalls, 1);

  const usersRes = makeResponse();
  await runAccessPolicy(makeRequest(`Bearer ${firebaseStub.VALID_TOKEN}`, '/users'), usersRes);
  assert.equal(usersRes.statusCode, 401);
  assert.equal(usersRes.body.error.code, 'ACCESS_TOKEN_INVALID');
});

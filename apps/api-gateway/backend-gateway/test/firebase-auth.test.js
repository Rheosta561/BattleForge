'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub `config/firebase` BEFORE anything requires it: these tests must never
// execute the real Firebase initialization or need real Firebase credentials.
const stub = require('./helpers/firebase-stub');

const policy = require('../plugins/firebase-auth/policies/firebase-auth');

function makeReq (overrides = {}) {
  return {
    method: 'GET',
    originalUrl: '/users',
    headers: {},
    egContext: { requestID: 'req-unit-test' },
    ...overrides
  };
}

function makeRes () {
  return {
    statusCode: 200,
    headersSent: false,
    locals: { standardResponseRequestId: 'req-unit-test' },
    body: null,
    responded: false,
    setHeader () {},
    status (code) {
      this.statusCode = code;
      return this;
    },
    json (payload) {
      this.responded = true;
      this.headersSent = true;
      this.body = payload;
      return this;
    },
    send (payload) {
      this.responded = true;
      this.headersSent = true;
      this.body = payload;
      return this;
    },
    end () {
      this.headersSent = true;
      return this;
    }
  };
}

/**
 * Run the policy middleware and resolve once it either calls `next()` or
 * sends a response.
 */
function runPolicy (req, res, publicPaths = []) {
  const middleware = policy.policy({ publicPaths }, {});
  const state = { nextCalls: 0 };

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        resolve(state);
      }
    };

    const originalJson = res.json.bind(res);
    res.json = payload => {
      originalJson(payload);
      settle();
    };

    const next = err => {
      if (err) {
        if (!settled) {
          settled = true;
          reject(err);
        }
        return;
      }
      state.nextCalls++;
      settle();
    };

    try {
      middleware(req, res, next);
    } catch (err) {
      reject(err);
    }
  });
}

function assertUnauthorized (res, code) {
  assert.equal(res.statusCode, 401);
  assert.equal(res.responded, true);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, code);
  assert.equal(typeof res.body.error.message, 'string');
  assert.equal(res.body.error.details, undefined);
}

/** Replace the stub verifier and return its call list. */
function trackVerify (impl) {
  const calls = [];
  stub.setVerifyIdToken(token => {
    calls.push(token);
    return impl(token);
  });
  return calls;
}

test.beforeEach(() => {
  stub.reset();
});

test('missing token -> 401 AUTH_TOKEN_MISSING', async () => {
  const calls = trackVerify(stub.defaultVerifyIdToken);
  const req = makeReq();
  const res = makeRes();

  await runPolicy(req, res);

  assertUnauthorized(res, 'AUTH_TOKEN_MISSING');
  assert.equal(calls.length, 0);
});

test('malformed bearer tokens -> 401 AUTH_TOKEN_MALFORMED', async () => {
  const malformed = [
    'Bearer',
    'Bearer ',
    'Bearer two words',
    'Basic dXNlcg==',
    'Token abc',
    'bearer'
  ];

  for (const authorization of malformed) {
    stub.reset();
    const req = makeReq({ headers: { authorization } });
    const res = makeRes();

    await runPolicy(req, res);

    assert.equal(res.statusCode, 401, `expected 401 for ${JSON.stringify(authorization)}`);
    assert.equal(res.body.error.code, 'AUTH_TOKEN_MALFORMED');
  }
});

test('invalid token -> 401 AUTH_TOKEN_INVALID without Firebase internals', async () => {
  trackVerify(() => Promise.reject(Object.assign(new Error('Firebase ID token has invalid signature.'), { code: 'auth/argument-error' })));
  const req = makeReq({ headers: { authorization: 'Bearer bogus' } });
  const res = makeRes();

  await runPolicy(req, res);

  assertUnauthorized(res, 'AUTH_TOKEN_INVALID');
  const serialized = JSON.stringify(res.body);
  assert.ok(!serialized.includes('invalid signature'), 'must not leak the Firebase error message');
  assert.ok(!serialized.includes('auth/argument-error'), 'must not leak the Firebase error code');
  assert.ok(!serialized.includes('stack'), 'must not leak stack traces');
});

test('unexpected (non-Firebase) verification error -> 401 AUTH_TOKEN_INVALID', async () => {
  trackVerify(() => Promise.reject(new TypeError('network blew up')));
  const req = makeReq({ headers: { authorization: 'Bearer whatever' } });
  const res = makeRes();

  await runPolicy(req, res);

  assertUnauthorized(res, 'AUTH_TOKEN_INVALID');
  assert.ok(!JSON.stringify(res.body).includes('network blew up'));
});

test('verification resolving without a uid -> 401 AUTH_TOKEN_INVALID', async () => {
  trackVerify(() => Promise.resolve({ email: 'no-uid@example.com' }));
  const req = makeReq({ headers: { authorization: 'Bearer whatever' } });
  const res = makeRes();

  await runPolicy(req, res);

  assertUnauthorized(res, 'AUTH_TOKEN_INVALID');
});

test('expired token -> 401 AUTH_TOKEN_EXPIRED', async () => {
  trackVerify(() => Promise.reject(Object.assign(new Error('Firebase ID token has expired.'), { code: 'auth/id-token-expired' })));
  const req = makeReq({ headers: { authorization: 'Bearer stale' } });
  const res = makeRes();

  await runPolicy(req, res);

  assertUnauthorized(res, 'AUTH_TOKEN_EXPIRED');
  assert.ok(!JSON.stringify(res.body).includes('auth/id-token-expired'));
});

test('valid token -> identity attached to egContext and req.user, next() called', async () => {
  const calls = trackVerify(stub.defaultVerifyIdToken);
  const req = makeReq({ headers: { authorization: `Bearer ${stub.VALID_TOKEN}` } });
  const res = makeRes();

  const { nextCalls } = await runPolicy(req, res);

  assert.equal(nextCalls, 1);
  assert.equal(res.responded, false);
  assert.deepEqual(calls, [stub.VALID_TOKEN]);

  const identity = req.egContext.firebase;
  assert.equal(identity.uid, 'test-user-123');
  assert.equal(identity.email, 'tester@example.com');
  assert.equal(identity.emailVerified, true);
  assert.equal(identity.name, 'Test User');
  assert.equal(identity.signInProvider, 'password');
  assert.equal(identity.authTime, 1700000000);
  assert.equal(req.user, identity);
  assert.ok(Object.isFrozen(identity), 'identity must be immutable');
});

test('bearer scheme is case-insensitive', async () => {
  const req = makeReq({ headers: { authorization: `bEaReR ${stub.VALID_TOKEN}` } });
  const res = makeRes();

  const { nextCalls } = await runPolicy(req, res);

  assert.equal(nextCalls, 1);
  assert.equal(req.egContext.firebase.uid, 'test-user-123');
});

test('token supplied through the access-token cookie -> accepted', async () => {
  const req = makeReq({ headers: { cookie: `access-token=${stub.VALID_TOKEN}` } });
  const res = makeRes();

  const { nextCalls } = await runPolicy(req, res);

  assert.equal(nextCalls, 1);
  assert.equal(req.egContext.firebase.uid, 'test-user-123');
});

test('URL-encoded and quoted cookie values are decoded', async () => {
  const encoded = makeReq({ headers: { cookie: 'access-token=valid%2Dtest%2Dtoken' } });
  const encodedRes = makeRes();
  assert.equal((await runPolicy(encoded, encodedRes)).nextCalls, 1);

  const quoted = makeReq({ headers: { cookie: `access-token="${stub.VALID_TOKEN}"` } });
  const quotedRes = makeRes();
  assert.equal((await runPolicy(quoted, quotedRes)).nextCalls, 1);
});

test('identical header and cookie tokens are accepted (verified once)', async () => {
  const calls = trackVerify(stub.defaultVerifyIdToken);
  const req = makeReq({
    headers: {
      authorization: `Bearer ${stub.VALID_TOKEN}`,
      cookie: `access-token=${stub.VALID_TOKEN}`
    }
  });
  const res = makeRes();

  const { nextCalls } = await runPolicy(req, res);

  assert.equal(nextCalls, 1);
  assert.deepEqual(calls, [stub.VALID_TOKEN]);
});

test('conflicting header and cookie tokens -> 401 AUTH_TOKEN_CONFLICT without verifying', async () => {
  const calls = trackVerify(stub.defaultVerifyIdToken);
  const req = makeReq({
    headers: {
      authorization: 'Bearer header-token',
      cookie: 'access-token=cookie-token'
    }
  });
  const res = makeRes();

  await runPolicy(req, res);

  assertUnauthorized(res, 'AUTH_TOKEN_CONFLICT');
  assert.equal(calls.length, 0, 'conflicting tokens must be rejected before verification');
});

test('malformed Authorization header wins over a valid cookie -> 401', async () => {
  const req = makeReq({
    headers: {
      authorization: 'Basic dXNlcg==',
      cookie: `access-token=${stub.VALID_TOKEN}`
    }
  });
  const res = makeRes();

  await runPolicy(req, res);

  assertUnauthorized(res, 'AUTH_TOKEN_MALFORMED');
});

test('configured public health route is reachable without a token', async () => {
  const calls = trackVerify(stub.defaultVerifyIdToken);
  const req = makeReq({ originalUrl: '/health' });
  const res = makeRes();

  const { nextCalls } = await runPolicy(req, res, ['/health']);

  assert.equal(nextCalls, 1);
  assert.equal(res.responded, false);
  assert.equal(calls.length, 0);
  assert.equal(req.egContext.firebase, undefined);
});

test('public route wildcards match prefixes only', async () => {
  const calls = trackVerify(stub.defaultVerifyIdToken);

  const health = makeReq({ originalUrl: '/users/health/live?deep=1' });
  const healthRes = makeRes();
  assert.equal((await runPolicy(health, healthRes, ['/users/*'])).nextCalls, 1);
  assert.equal(healthRes.responded, false);

  // `/users/*` must NOT cover the parent path — it still requires a token.
  const users = makeReq({ originalUrl: '/users' });
  const usersRes = makeRes();
  await runPolicy(users, usersRes, ['/users/*']);
  assertUnauthorized(usersRes, 'AUTH_TOKEN_MISSING');

  assert.equal(calls.length, 0);
});

test('public routes ignore the query string when matching', async () => {
  const req = makeReq({ originalUrl: '/users/public?anything=1' });
  const res = makeRes();

  const { nextCalls } = await runPolicy(req, res, ['/users/public']);

  assert.equal(nextCalls, 1);
});

test('UIDs from the body, query string or headers are never trusted', async () => {
  // Spoofing attempts with a valid token: the Firebase claims win.
  const spoofed = makeReq({
    headers: { authorization: `Bearer ${stub.VALID_TOKEN}`, 'x-firebase-uid': 'attacker' },
    body: { uid: 'attacker' },
    query: { uid: 'attacker' }
  });
  const spoofedRes = makeRes();
  assert.equal((await runPolicy(spoofed, spoofedRes)).nextCalls, 1);
  assert.equal(spoofed.egContext.firebase.uid, 'test-user-123');

  // Spoofing attempts without a token: still rejected.
  const anonymous = makeReq({
    headers: { 'x-firebase-uid': 'attacker' },
    body: { uid: 'attacker' },
    query: { uid: 'attacker' }
  });
  const anonymousRes = makeRes();
  await runPolicy(anonymous, anonymousRes);
  assertUnauthorized(anonymousRes, 'AUTH_TOKEN_MISSING');
});

test('401 responses use the standard gateway envelope with the request id', async () => {
  const req = makeReq();
  const res = makeRes();

  await runPolicy(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    success: false,
    error: {
      code: 'AUTH_TOKEN_MISSING',
      message: 'A Firebase ID token is required'
    },
    meta: { requestId: 'req-unit-test' }
  });
});

test('policy schema declares defaults that express-gateway (ajv) will apply', () => {
  const Ajv = require('ajv');
  const ajv = new Ajv({ useDefaults: true, coerceTypes: true });

  const validate = ajv.compile(policy.schema);

  const params = {};
  assert.equal(validate(params), true, ajv.errorsText());
  assert.deepEqual(params.publicPaths, [], 'schema default must populate publicPaths');

  assert.equal(validate({ publicPaths: ['/health'] }), true);
  assert.equal(validate({ publicPaths: 'not-an-array' }), false);
});

test('plugin registers its policy through the express-gateway plugin API', () => {
  const plugin = require('../plugins/firebase-auth');

  assert.equal(plugin.version, '1.0.0');
  assert.equal(typeof plugin.init, 'function');
  assert.equal(plugin.schema.$id, 'http://express-gateway.io/schemas/plugins/firebase-auth.json');

  const registered = [];
  plugin.init({
    registerPolicy: p => registered.push(p),
    logger: { debug () {} }
  });

  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, 'firebase-auth');
  assert.equal(typeof registered[0].policy, 'function');
  assert.equal(registered[0].schema.$id, 'http://express-gateway.io/schemas/policies/firebase-auth.json');
});

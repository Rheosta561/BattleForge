'use strict';

/**
 * Installs a stub for `config/firebase.js` in the CommonJS require cache, so
 * unit tests (and the stubbed live run via `node -r test/helpers/firebase-stub.js`)
 * never execute the real Firebase initialization and never need credentials.
 *
 * `config/firebase.js` itself is required lazily by the policy, so installing
 * this stub before any request is handled is enough.
 */

const FIREBASE_MODULE_PATH = require.resolve('../../config/firebase');

const VALID_TOKEN = 'valid-test-token';
const EXPIRED_TOKEN = 'expired-test-token';

const defaultClaims = Object.freeze({
  uid: 'test-user-123',
  email: 'tester@example.com',
  email_verified: true,
  name: 'Test User',
  picture: 'https://example.com/avatar.png',
  phone_number: null,
  auth_time: 1700000000,
  firebase: { sign_in_provider: 'password' }
});

function defaultVerifyIdToken (token) {
  if (token === VALID_TOKEN) {
    return Promise.resolve({ ...defaultClaims });
  }

  const error = new Error(
    token === EXPIRED_TOKEN
      ? 'Firebase ID token has expired.'
      : 'Firebase ID token has invalid signature.'
  );
  error.code = token === EXPIRED_TOKEN ? 'auth/id-token-expired' : 'auth/argument-error';
  return Promise.reject(error);
}

let verifyIdToken = defaultVerifyIdToken;

const stubExports = {
  firebaseApp: null,
  firebaseAuth: {
    // Delegates through a mutable binding so tests can swap the verifier
    // after this module has been loaded.
    verifyIdToken: token => verifyIdToken(token)
  }
};

require.cache[FIREBASE_MODULE_PATH] = {
  id: FIREBASE_MODULE_PATH,
  filename: FIREBASE_MODULE_PATH,
  loaded: true,
  exports: stubExports,
  children: [],
  paths: []
};

module.exports = {
  FIREBASE_MODULE_PATH,
  VALID_TOKEN,
  EXPIRED_TOKEN,
  defaultClaims,
  defaultVerifyIdToken,
  setVerifyIdToken (fn) {
    verifyIdToken = typeof fn === 'function' ? fn : defaultVerifyIdToken;
  },
  reset () {
    verifyIdToken = defaultVerifyIdToken;
  }
};

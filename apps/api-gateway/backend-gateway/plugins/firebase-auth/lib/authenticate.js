'use strict';

const ApiResponse = require('../../../lib/Response');
const { AppError } = require('../../../lib/AppError');

const COOKIE_NAME = 'access-token';

let pluginLogger = null;

/** Called by the plugin with the express-gateway logger. Never logs tokens. */
function setLogger (logger) {
  pluginLogger = logger;
}

function logDebug (message) {
  if (pluginLogger && typeof pluginLogger.debug === 'function') {
    pluginLogger.debug(message);
  }
}

/**
 * Extract a token from an `Authorization: Bearer <token>` header.
 * Returns { state: 'absent' | 'ok' | 'malformed', token }.
 *
 * The scheme is case-insensitive (RFC 7235) and exactly one credential is
 * accepted; `Bearer`, `Bearer ` and `Bearer a b` are malformed.
 */
function readBearerToken (authorizationHeader) {
  if (!authorizationHeader) {
    return { state: 'absent', token: null };
  }

  const match = /^bearer[ \t]+(\S+)$/i.exec(String(authorizationHeader));
  if (!match) {
    return { state: 'malformed', token: null };
  }

  return { state: 'ok', token: match[1] };
}

/** Read and URL-decode the `access-token` cookie; returns null when absent. */
function readCookieToken (cookieHeader) {
  if (!cookieHeader) {
    return null;
  }

  for (const part of String(cookieHeader).split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() !== COOKIE_NAME) {
      continue;
    }

    let value = part.slice(separator + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch (err) {
      return value; // not URL-encoded; leave as-is (verification will decide)
    }
  }

  return null;
}

/** Path without query string, e.g. `/users?page=2` -> `/users`. */
function requestPath (req) {
  const url = req.originalUrl || req.url || '';
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/**
 * Public path patterns: an exact path (`/health`), or a trailing `*` prefix
 * match (`/users/*` matches everything below `/users/`).
 */
function matchesPublicPath (pathname, pattern) {
  if (pattern.endsWith('*')) {
    return pathname.startsWith(pattern.slice(0, -1));
  }
  return pathname === pattern;
}

function isPublicRoute (req, publicPaths) {
  if (!publicPaths.length) {
    return false;
  }
  const pathname = requestPath(req);
  return publicPaths.some(pattern => typeof pattern === 'string' && matchesPublicPath(pathname, pattern));
}

/**
 * Attach the verified Firebase identity to the request.
 *
 * `req.egContext` is express-gateway's per-request extension mechanism: the
 * identity is readable from policies, expressions and templates
 * (e.g. `${firebase.uid}` in log/rate-limit actions). `req.user` mirrors it
 * for generic express conventions (`egContext.consumer` resolves to `req.user`).
 *
 * Only claims from `verifyIdToken()` are ever used — never values supplied by
 * the client in the body, query string or headers.
 */
function attachIdentity (req, claims) {
  const identity = Object.freeze({
    uid: claims.uid,
    email: claims.email || null,
    emailVerified: claims.email_verified === true,
    name: claims.name || null,
    picture: claims.picture || null,
    phoneNumber: claims.phone_number || null,
    signInProvider: (claims.firebase && claims.firebase.sign_in_provider) || null,
    authTime: typeof claims.auth_time === 'number' ? claims.auth_time : null
  });

  if (!req.egContext) {
    req.egContext = {};
  }
  req.egContext.firebase = identity;
  req.user = identity;

  return identity;
}

/**
 * Verify a token with the single Firebase Admin instance from
 * `config/firebase.js`. Required lazily so unit tests can stub
 * `config/firebase` in the require cache without ever executing the real
 * initialization or needing real credentials.
 */
function verifyIdToken (token) {
  const { firebaseAuth } = require('../../../config/firebase');
  return firebaseAuth.verifyIdToken(token);
}

/** Send a standardized 401 envelope via the gateway's ApiResponse/AppError. */
function reject (res, code, message) {
  return ApiResponse.sendError(res, new AppError({ statusCode: 401, code, message }));
}

async function runAuthentication (req, res, next, options) {
  const publicPaths = options.publicPaths;

  if (isPublicRoute(req, publicPaths)) {
    return next();
  }

  const headers = req.headers || {};
  const bearer = readBearerToken(headers.authorization);
  const cookieToken = readCookieToken(headers.cookie);
  const headerToken = bearer.state === 'ok' ? bearer.token : null;

  if (bearer.state === 'malformed') {
    return reject(res, 'AUTH_TOKEN_MALFORMED', 'The Authorization header must contain a single Bearer token');
  }

  if (!headerToken && !cookieToken) {
    return reject(res, 'AUTH_TOKEN_MISSING', 'A Firebase ID token is required');
  }

  if (headerToken && cookieToken && headerToken !== cookieToken) {
    return reject(res, 'AUTH_TOKEN_CONFLICT', 'The Authorization header and access-token cookie do not match');
  }

  const token = headerToken || cookieToken;

  let claims;
  try {
    claims = await verifyIdToken(token);
  } catch (err) {
    // Never expose Firebase error details to clients — log only the error code.
    logDebug(`firebase-auth: ID token rejected (${(err && err.code) || (err && err.name) || 'unknown'})`);

    if (err && err.code === 'auth/id-token-expired') {
      return reject(res, 'AUTH_TOKEN_EXPIRED', 'The authentication token has expired');
    }
    return reject(res, 'AUTH_TOKEN_INVALID', 'The authentication token is invalid');
  }

  if (!claims || typeof claims.uid !== 'string' || !claims.uid) {
    logDebug('firebase-auth: ID token verification returned no uid');
    return reject(res, 'AUTH_TOKEN_INVALID', 'The authentication token is invalid');
  }

  attachIdentity(req, claims);

  // Kept outside every try/catch so errors thrown downstream are never
  // misreported as authentication failures.
  return next();
}

/**
 * Gateway policy middleware. Verifies the Firebase ID token and attaches the
 * verified identity, or rejects with a standardized 401 envelope.
 * Fails closed on unexpected errors.
 */
async function authenticate (req, res, next, options = {}) {
  try {
    return await runAuthentication(req, res, next, {
      publicPaths: Array.isArray(options.publicPaths) ? options.publicPaths : []
    });
  } catch (err) {
    logDebug(`firebase-auth: unexpected authentication failure (${(err && err.name) || 'Error'})`);
    if (res.headersSent) {
      return next(err);
    }
    return reject(res, 'AUTH_TOKEN_INVALID', 'The authentication token is invalid');
  }
}

module.exports = {
  authenticate,
  setLogger
};

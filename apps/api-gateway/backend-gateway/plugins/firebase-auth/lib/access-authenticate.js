'use strict';

const ApiResponse = require('../../../lib/Response');
const { AppError } = require('../../../lib/AppError');
const { isPublicRoute, readBearerToken, readCookieToken } = require('./authenticate');

function reject (res, code, message) {
  return ApiResponse.sendError(res, new AppError({ statusCode: 401, code, message }));
}

function authenticateAccessToken (req, res, next, options = {}) {
  if (isPublicRoute(req, options.publicPaths || [])) {
    return next();
  }

  const bearer = readBearerToken(req.headers && req.headers.authorization);
  const cookieToken = readCookieToken(req.headers && req.headers.cookie);
  if (bearer.state === 'malformed') {
    return reject(res, 'ACCESS_TOKEN_MALFORMED', 'The Authorization header must contain a single Bearer token');
  }
  if (bearer.state === 'absent' && !cookieToken) {
    return reject(res, 'ACCESS_TOKEN_MISSING', 'A Lagertha access token is required');
  }
  if (bearer.state === 'ok' && cookieToken && bearer.token !== cookieToken) {
    return reject(res, 'ACCESS_TOKEN_CONFLICT', 'The Authorization header and access-token cookie do not match');
  }

  let claims;
  try {
    claims = options.tokenService.verify(bearer.state === 'ok' ? bearer.token : cookieToken);
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      return reject(res, 'ACCESS_TOKEN_EXPIRED', 'The Lagertha access token has expired');
    }
    return reject(res, 'ACCESS_TOKEN_INVALID', 'The Lagertha access token is invalid');
  }

  const identity = Object.freeze({
    uid: claims.sub,
    tokenId: claims.jti,
    issuedAt: claims.iat,
    expiresAt: claims.exp
  });

  if (!req.egContext) {
    req.egContext = {};
  }
  req.egContext.lagertha = identity;
  req.lagerthaIdentity = identity;
  req.user = identity;

  return next();
}

module.exports = { authenticateAccessToken };

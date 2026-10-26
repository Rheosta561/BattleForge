'use strict';

const ApiResponse = require('../../../lib/Response');
const { AppError } = require('../../../lib/AppError');
const { readBearerToken, readCookieToken } = require('./authenticate');

function reject (res, code, message) {
  return ApiResponse.sendError(res, new AppError({ statusCode: 401, code, message }));
}

function createSessionHandler ({ verifyFirebaseIdToken, tokenService }) {
  return async function createSession (req, res) {
    const bearer = readBearerToken(req.headers && req.headers.authorization);
    const cookieToken = readCookieToken(req.headers && req.headers.cookie);

    if (bearer.state === 'malformed') {
      return reject(res, 'AUTH_TOKEN_MALFORMED', 'The Authorization header must contain a single Bearer token');
    }
    if (bearer.state === 'absent' && !cookieToken) {
      return reject(res, 'AUTH_TOKEN_MISSING', 'A Firebase ID token is required');
    }
    if (bearer.state === 'ok' && cookieToken && bearer.token !== cookieToken) {
      return reject(res, 'AUTH_TOKEN_CONFLICT', 'The Authorization header and access-token cookie do not match');
    }

    let firebaseClaims;
    try {
      firebaseClaims = await verifyFirebaseIdToken(bearer.state === 'ok' ? bearer.token : cookieToken);
    } catch (err) {
      if (err && err.code === 'auth/id-token-expired') {
        return reject(res, 'AUTH_TOKEN_EXPIRED', 'The Firebase ID token has expired');
      }
      return reject(res, 'AUTH_TOKEN_INVALID', 'The Firebase ID token is invalid');
    }

    if (!firebaseClaims || typeof firebaseClaims.uid !== 'string' || !firebaseClaims.uid) {
      return reject(res, 'AUTH_TOKEN_INVALID', 'The Firebase ID token is invalid');
    }

    let accessToken;
    try {
      accessToken = tokenService.issue(firebaseClaims.uid);
    } catch (err) {
      return ApiResponse.sendError(
        res,
        new AppError({
          statusCode: 500,
          code: 'ACCESS_TOKEN_ISSUANCE_FAILED',
          message: 'The application session could not be established'
        })
      );
    }

    return ApiResponse.sendSuccess(
      res,
      {
        accessToken,
        tokenType: 'Bearer',
        expiresIn: tokenService.expiresIn
      },
      { message: 'Application session established' }
    );
  };
}

module.exports = { createSessionHandler };

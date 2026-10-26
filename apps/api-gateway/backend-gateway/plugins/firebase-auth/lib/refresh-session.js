'use strict';

const ApiResponse = require('../../../lib/Response');
const { AppError } = require('../../../lib/AppError');
const { readCookie, setAuthCookies } = require('./cookies');

function reject (res, statusCode, code, message) {
  return ApiResponse.sendError(res, new AppError({ statusCode, code, message }));
}

function createRefreshHandler ({ tokenService, sessionStore }) {
  if (!sessionStore) {
    const { getSessionStore } = require('./session-store');
    sessionStore = getSessionStore();
  }

  return async function refreshSession (req, res) {
    const bodyToken = req.body && typeof req.body.refreshToken === 'string' ? req.body.refreshToken.trim() : null;
    const cookieToken = readCookie(req.headers && req.headers.cookie, 'refresh-token');
    const headerToken = req.headers && typeof req.headers['x-refresh-token'] === 'string' ? req.headers['x-refresh-token'].trim() : null;

    const token = bodyToken || cookieToken || headerToken;
    if (!token) {
      return reject(res, 401, 'AUTH_TOKEN_MISSING', 'A refresh token is required');
    }

    let rotationResult;
    try {
      rotationResult = await sessionStore.rotateSession(token);
    } catch (err) {
      if (err.code === 'AUTH_TOKEN_MALFORMED') {
        return reject(res, 401, 'AUTH_TOKEN_MALFORMED', err.message);
      }
      if (err.code === 'SESSION_NOT_FOUND') {
        return reject(res, 401, 'AUTH_TOKEN_INVALID', 'The session is invalid or not found');
      }
      if (err.code === 'AUTH_TOKEN_EXPIRED') {
        return reject(res, 401, 'AUTH_TOKEN_EXPIRED', err.message);
      }
      if (err.code === 'AUTH_TOKEN_REVOKED') {
        return reject(res, 401, 'AUTH_TOKEN_REVOKED', err.message);
      }
      if (err.code === 'AUTH_TOKEN_REUSED') {
        return reject(res, 401, 'AUTH_TOKEN_REVOKED', 'Refresh token reuse detected; session revoked');
      }
      return reject(res, 500, 'REFRESH_FAILED', 'Failed to refresh application session');
    }

    let newAccessToken;
    try {
      newAccessToken = tokenService.issue(rotationResult.uid);
    } catch {
      return reject(res, 500, 'ACCESS_TOKEN_ISSUANCE_FAILED', 'Failed to issue new access token');
    }

    if (cookieToken) {
      setAuthCookies(res, {
        accessToken: newAccessToken,
        refreshToken: rotationResult.newRefreshToken,
        isSecure: process.env.NODE_ENV === 'production'
      });
    }

    return ApiResponse.sendSuccess(
      res,
      {
        accessToken: newAccessToken,
        refreshToken: rotationResult.newRefreshToken,
        tokenType: 'Bearer',
        expiresIn: tokenService.expiresIn
      },
      { message: 'Session refreshed successfully' }
    );
  };
}

module.exports = { createRefreshHandler };

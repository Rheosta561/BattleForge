'use strict';

const ApiResponse = require('../../../lib/Response');
const { readCookie, clearAuthCookies } = require('./cookies');
const Session = require('../../../models/Session');

function createLogoutHandler ({ sessionStore } = {}) {
  if (!sessionStore) {
    const { getSessionStore } = require('./session-store');
    sessionStore = getSessionStore();
  }

  return async function logoutSession (req, res) {
    const bodyToken = req.body && typeof req.body.refreshToken === 'string' ? req.body.refreshToken.trim() : null;
    const cookieToken = readCookie(req.headers && req.headers.cookie, 'refresh-token');
    const headerToken = req.headers && typeof req.headers['x-refresh-token'] === 'string' ? req.headers['x-refresh-token'].trim() : null;
    const sessionId = req.body && typeof req.body.sessionId === 'string' ? req.body.sessionId.trim() : null;

    const tokenOrId = bodyToken || cookieToken || headerToken || sessionId;
    if (tokenOrId && sessionStore) {
      try {
        await sessionStore.revokeSession(tokenOrId, Session.REVOCATION_REASONS.LOGOUT);
      } catch {
        // Revocation failure is handled gracefully without leaking internal details
      }
    }

    clearAuthCookies(res);

    return ApiResponse.sendSuccess(
      res,
      null,
      { message: 'Logged out successfully' }
    );
  };
}

module.exports = { createLogoutHandler };

'use strict';

const { createSessionHandler } = require('../../lib/create-session');
const { createRefreshHandler } = require('../../lib/refresh-session');
const { createLogoutHandler } = require('../../lib/logout-session');
const { createMeHandler } = require('../../lib/auth-me');
const { createAccessTokenService } = require('../../lib/access-token');
const { verifyFirebaseIdToken } = require('../../lib/authenticate');
const { getSessionStore } = require('../../lib/session-store');
const { getUserStore } = require('../../lib/user-store');

module.exports = {
  name: 'lagertha-session',

  policy: (params = {}) => {
    const tokenService = createAccessTokenService();
    const sessionStore = getSessionStore();
    const userStore = getUserStore();

    const sessionHandler = createSessionHandler({ verifyFirebaseIdToken, tokenService, sessionStore, userStore });
    const refreshHandler = createRefreshHandler({ tokenService, sessionStore });
    const logoutHandler = createLogoutHandler({ sessionStore });
    const meHandler = createMeHandler({ userStore, tokenService });

    return function lagerthaSessionPolicy (req, res, next) {
      const action = params && params.action;
      if (action === 'refresh') return refreshHandler(req, res, next);
      if (action === 'logout') return logoutHandler(req, res, next);
      if (action === 'me') return meHandler(req, res, next);
      if (action === 'session') return sessionHandler(req, res, next);

      // Auto-dispatch based on path
      const path = req.originalUrl || req.url || '';
      if (path.includes('/auth/refresh')) {
        return refreshHandler(req, res, next);
      }
      if (path.includes('/auth/logout')) {
        return logoutHandler(req, res, next);
      }
      if (path.includes('/auth/me')) {
        return meHandler(req, res, next);
      }
      return sessionHandler(req, res, next);
    };
  },

  schema: {
    $id: 'http://express-gateway.io/schemas/policies/lagertha-session.json',
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['session', 'refresh', 'logout', 'me'],
        default: 'session'
      }
    }
  }
};

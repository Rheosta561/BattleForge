'use strict';

const ApiResponse = require('../../../lib/Response');
const { AppError } = require('../../../lib/AppError');
const { readBearerToken, readCookieToken } = require('./authenticate');

function reject (res, code, message) {
  return ApiResponse.sendError(res, new AppError({ statusCode: 401, code, message }));
}

function createMeHandler ({ userStore, tokenService } = {}) {
  if (!userStore) {
    const { getUserStore } = require('./user-store');
    userStore = getUserStore();
  }

  return async function authMe (req, res) {
    let identity = (req.egContext && req.egContext.lagertha) || req.lagerthaIdentity || req.user;

    if (!identity || !identity.uid) {
      if (tokenService) {
        const bearer = readBearerToken(req.headers && req.headers.authorization);
        const cookieToken = readCookieToken(req.headers && req.headers.cookie);
        const token = bearer.state === 'ok' ? bearer.token : cookieToken;

        if (!token) {
          return reject(res, 'ACCESS_TOKEN_MISSING', 'A Lagertha access token is required');
        }

        try {
          const claims = tokenService.verify(token);
          identity = { uid: claims.sub, tokenId: claims.jti };
        } catch {
          return reject(res, 'ACCESS_TOKEN_INVALID', 'The Lagertha access token is invalid');
        }
      } else {
        return reject(res, 'ACCESS_TOKEN_MISSING', 'A Lagertha access token is required');
      }
    }

    let userProfile = null;
    if (userStore && typeof userStore.findUser === 'function') {
      try {
        userProfile = await userStore.findUser(identity.uid);
      } catch {
        // Fall back to minimal identity if store query fails
      }
    }

    const data = userProfile && typeof userProfile.toSafeJSON === 'function'
      ? userProfile.toSafeJSON()
      : { uid: identity.uid };

    return ApiResponse.sendSuccess(
      res,
      data,
      { message: 'Authenticated user profile retrieved' }
    );
  };
}

module.exports = { createMeHandler };

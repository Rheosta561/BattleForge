'use strict';

const { createSessionHandler } = require('../../lib/create-session');
const { createAccessTokenService } = require('../../lib/access-token');
const { verifyFirebaseIdToken } = require('../../lib/authenticate');

module.exports = {
  name: 'lagertha-session',

  policy: () => {
    const tokenService = createAccessTokenService();
    const handler = createSessionHandler({ verifyFirebaseIdToken, tokenService });

    return function lagerthaSessionPolicy (req, res, next) {
      return handler(req, res, next);
    };
  },

  schema: {
    $id: 'http://express-gateway.io/schemas/policies/lagertha-session.json',
    type: 'object',
    properties: {}
  }
};

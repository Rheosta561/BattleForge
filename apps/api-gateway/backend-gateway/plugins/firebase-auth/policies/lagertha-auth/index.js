'use strict';

const { authenticateAccessToken } = require('../../lib/access-authenticate');
const { createAccessTokenService } = require('../../lib/access-token');

module.exports = {
  name: 'lagertha-auth',

  policy: (params = {}) => {
    const publicPaths = Array.isArray(params.publicPaths) ? params.publicPaths : [];
    const tokenService = createAccessTokenService();

    return function lagerthaAuthPolicy (req, res, next) {
      return authenticateAccessToken(req, res, next, { publicPaths, tokenService });
    };
  },

  schema: {
    $id: 'http://express-gateway.io/schemas/policies/lagertha-auth.json',
    type: 'object',
    properties: {
      publicPaths: {
        type: 'array',
        items: { type: 'string' },
        default: []
      }
    }
  }
};

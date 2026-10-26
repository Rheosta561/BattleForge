'use strict';

const { authenticate } = require('../../lib/authenticate');

module.exports = {
  name: 'firebase-auth',

  /**
   * `params` are the validated `action` values from gateway.config.yml;
   * express-gateway applies the schema defaults (ajv `useDefaults`) before
   * the factory runs.
   */
  policy: (params = {}, config) => {
    const publicPaths = Array.isArray(params.publicPaths) ? params.publicPaths : [];

    return function firebaseAuthPolicy (req, res, next) {
      authenticate(req, res, next, { publicPaths });
    };
  },

  schema: {
    $id: 'http://express-gateway.io/schemas/policies/firebase-auth.json',
    type: 'object',
    properties: {
      publicPaths: {
        type: 'array',
        items: { type: 'string' },
        default: [],
        description:
          'Routes that skip Firebase authentication: exact paths, or a trailing * ' +
          'prefix match (e.g. "/health*" or "/users/*"). Authentication endpoints ' +
          'and other public routes are declared here.'
      }
    }
  }
};

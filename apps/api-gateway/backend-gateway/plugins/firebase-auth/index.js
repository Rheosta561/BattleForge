'use strict';

// Load Firebase configuration eagerly so a missing/invalid service account
// fails the gateway at boot instead of on the first authenticated request.
// This module owns the single shared Firebase Admin instance (config/firebase.js).
require('../../config/firebase');

const policy = require('./policies/firebase-auth');
const lagerthaAuthPolicy = require('./policies/lagertha-auth');
const lagerthaSessionPolicy = require('./policies/lagertha-session');
const { setLogger } = require('./lib/authenticate');

module.exports = {
  version: '1.0.0',
  schema: {
    $id: 'http://express-gateway.io/schemas/plugins/firebase-auth.json',
    type: 'object',
    properties: {}
  },
  init (pluginContext) {
    setLogger(pluginContext.logger);
    pluginContext.registerPolicy(policy);
    pluginContext.registerPolicy(lagerthaAuthPolicy);
    pluginContext.registerPolicy(lagerthaSessionPolicy);
    pluginContext.logger.debug('firebase-auth: policy registered');
  }
};

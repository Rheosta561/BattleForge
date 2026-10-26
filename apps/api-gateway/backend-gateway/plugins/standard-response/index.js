'use strict';

const registerStandardizedResponses = require('./lib/standardize').registerStandardizedResponses;
const rateLimitPolicy = require('./policies/rate-limit');

module.exports = {
  version: '1.0.0',
  schema: {
    $id: 'http://express-gateway.io/schemas/plugins/standard-response.json',
    type: 'object',
    properties: {
      exposeInternalErrors: {
        type: 'boolean',
        default: false,
        description: 'Expose internal error messages for unexpected (5xx) errors instead of a generic message'
      }
    }
  },
  init (pluginContext) {
    // Standardize throttled (429) responses by overriding the core rate-limit policy.
    pluginContext.registerPolicy(rateLimitPolicy);

    // Normalize gateway-generated error responses and install centralized
    // catch-all 404 and error handlers on the gateway app.
    registerStandardizedResponses(pluginContext);
  }
};

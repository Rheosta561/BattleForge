'use strict';

const coreRateLimit = require('express-gateway/lib/policies/rate-limit');
const ApiResponse = require('../../../../lib/Response');
const { TooManyRequestsError } = require('../../../../lib/AppError');

/**
 * Drop-in override of the core `rate-limit` policy.
 *
 * It reuses the core implementation (same counters, stores, key generation and
 * X-RateLimit-* headers) but replaces the express-rate-limit handler so that
 * throttled requests return the standardized error envelope instead of the
 * library default `{ message }` / plain-text body.
 *
 * Because Express Gateway does not register a core policy when a plugin has
 * already registered a policy with the same name, simply registering this
 * policy as `rate-limit` replaces the core one for every pipeline.
 */
const policy = (params, config) => {
  const handler = (req, res) => {
    if (params.headers) {
      res.setHeader('Retry-After', Math.ceil(params.windowMs / 1000));
    }

    return ApiResponse.sendError(res, new TooManyRequestsError(params.message));
  };

  return coreRateLimit.policy(Object.assign({}, params, { handler }), config);
};

module.exports = {
  name: 'rate-limit',
  policy,
  schema: coreRateLimit.schema
};

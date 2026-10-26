'use strict';

const http = require('http');
const ApiResponse = require('../../../lib/Response');
const { AppError } = require('../../../lib/AppError');
const { notFoundHandler, errorHandler } = require('../../../middleware/errorHandler');

// Apps (http/https servers share the same express app) that already received
// the centralized catch-all handlers.
const registeredApps = new WeakSet();

const isAlreadyEnveloped = payload =>
  payload !== null && typeof payload === 'object' && payload.success === false && payload.error;

/**
 * Convert any error-style payload sent by gateway policies (plain strings from
 * `res.sendStatus`, `{ message }` objects, ...) into an AppError, so every
 * gateway-generated error response shares the same envelope.
 */
function toAppError (payload, statusCode) {
  if (isAlreadyEnveloped(payload)) {
    return null;
  }

  let message;
  let code;
  let details;

  if (typeof payload === 'string') {
    message = payload;
  } else if (Buffer.isBuffer(payload)) {
    message = payload.toString();
  } else if (payload !== null && typeof payload === 'object') {
    if (typeof payload.message === 'string') {
      message = payload.message;
    }
    if (typeof payload.code === 'string') {
      code = payload.code;
    }
    if (payload.details !== undefined) {
      details = payload.details;
    }
  }

  return new AppError({ statusCode, code, message, details });
}

/**
 * Per-request middleware that normalizes gateway-generated error responses
 * (`res.sendStatus(401)`, `res.status(502).send(...)`, `res.json({ message })`,
 * ...) into the standardized error envelope. Responses proxied from upstream
 * services stream through `res.end` and are therefore left untouched.
 */
function standardizeResponses (req, res, next) {
  if (!res.locals) {
    res.locals = {};
  }
  res.locals.standardResponseRequestId = req.egContext && req.egContext.requestID;

  if (res.standardResponsePatched) {
    return next();
  }
  res.standardResponsePatched = true;

  const originalJson = res.json;
  const originalSend = res.send;
  const originalSendStatus = res.sendStatus;

  const shouldNormalize = () => !res.headersSent && res.statusCode >= 400 && res.statusCode < 600;

  res.json = function (payload) {
    if (shouldNormalize()) {
      const error = toAppError(payload, res.statusCode);
      if (error) {
        return ApiResponse.sendError(res, error);
      }
    }
    return originalJson.call(this, payload);
  };

  res.send = function (payload) {
    if (shouldNormalize()) {
      const error = toAppError(payload, res.statusCode);
      if (error) {
        return ApiResponse.sendError(res, error);
      }
    }
    return originalSend.call(this, payload);
  };

  res.sendStatus = function (statusCode) {
    if (statusCode >= 400 && statusCode < 600 && !res.headersSent) {
      const message = http.STATUS_CODES[statusCode] || String(statusCode);
      return ApiResponse.sendError(res, new AppError({ statusCode, message }));
    }
    return originalSendStatus.call(this, statusCode);
  };

  next();
}

/**
 * Wire the standardized responses into the gateway:
 *  - a gateway route middleware normalizes every gateway-generated error
 *    response before it reaches the client;
 *  - once the gateway app is ready (http-ready event), a catch-all 404 handler
 *    (`middleware/errorHandler.notFoundHandler`) and a centralized error
 *    handler (`middleware/errorHandler.errorHandler`) are appended after the
 *    pipelines so that unmatched routes and propagated errors share the same
 *    JSON envelope. Both build their payloads from `lib/AppError` and are sent
 *    through `lib/Response`.
 */
function registerStandardizedResponses (pluginContext) {
  const settings = pluginContext.settings || {};

  pluginContext.registerGatewayRoute(function standardResponseGatewayRoute (app) {
    app.use(standardizeResponses);
  });

  pluginContext.eventBus.on('http-ready', ({ httpServer }) => {
    const app = httpServer && typeof httpServer.listeners === 'function' && httpServer.listeners('request')[0];

    if (!app || typeof app.use !== 'function' || registeredApps.has(app)) {
      if (!app || typeof app.use !== 'function') {
        pluginContext.logger.warn('standard-response: could not access the gateway app; catch-all 404/error handling is disabled');
      }
      return;
    }

    registeredApps.add(app);
    app.use(notFoundHandler);
    app.use(errorHandler({
      exposeInternalErrors: settings.exposeInternalErrors === true,
      logger: pluginContext.logger
    }));
    pluginContext.logger.debug('standard-response: centralized 404/error handlers installed');
  });
}

module.exports = {
  standardizeResponses,
  registerStandardizedResponses
};

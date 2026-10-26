'use strict';

const { AppError, NotFoundError } = require('../lib/AppError');
const ApiResponse = require('../lib/Response');

/**
 Catch-all handler for requests that did not match any pipeline/route.
 Mounted at the very end of the gateway app stack.
 */
const notFoundHandler = (req, res, next) => {
  if (res.headersSent) {
    return next();
  }

  const method = req.method;
  const path = req.originalUrl || req.url;

  return ApiResponse.sendError(res, new NotFoundError(`Cannot ${method} ${path}`, { method, path }));
}

/**
 Centralized error handler for any error propagated through the gateway
 (`next(err)` from authentication, proxy failures, unexpected exceptions...).
 Mounted at the very end of the gateway app stack, after `notFoundHandler`.
 
 options:
 - exposeInternalErrors: {boolean} expose internal 5xx messages (default false)
 - logger:               {object}  express-gateway logger (error/debug/warn)
 */
function errorHandler(options = {}) {
  const exposeInternalErrors = options.exposeInternalErrors === true;
  const logger = options.logger;

  return function gatewayErrorHandler(err, req, res, next) {
    if (res.headersSent) {
      return next(err);
    }

    const appError = AppError.from(err, { exposeInternalErrors });
    const location = `${req.method} ${req.originalUrl || req.url}`;

    if (appError.statusCode >= 500) {
      log('error', `gateway error on ${location}: ${(err && (err.stack || err.message)) || err}`);
    } else {
      log('debug', `gateway client error on ${location}: ${appError.statusCode} ${appError.message}`);
    }

    return ApiResponse.sendError(res, appError);
  };

  function log(level, message) {
    if (logger && typeof logger[level] === 'function') {
      logger[level](message);
    }
  }
}

module.exports = {
  notFoundHandler,
  errorHandler
};

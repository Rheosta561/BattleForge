'use strict';

const http = require('http');

// Default, client-safe messages for well-known HTTP status codes.
const DEFAULT_MESSAGES = {
  400: 'The request could not be understood or is invalid',
  401: 'Authentication is required to access this resource',
  403: 'You do not have permission to access this resource',
  404: 'The requested resource was not found',
  405: 'The method is not allowed for this resource',
  409: 'The request conflicts with the current state of the resource',
  422: 'The request payload failed validation',
  429: 'Too many requests, please try again later',
  500: 'An unexpected error occurred',
  502: 'An invalid response was received from the upstream service',
  503: 'The service is temporarily unavailable',
  504: 'The upstream service did not respond in time'
};

// Machine-readable error codes for well-known HTTP status codes.
const DEFAULT_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT'
};

/**
 * Standardized application/gateway error.
 *
 * An AppError always carries:
 *  - statusCode: the HTTP status code the gateway should respond with
 *  - code:       a stable, machine-readable error code
 *  - message:    a human-readable error message
 *  - details:    (optional) additional structured error details
 *
 * Usage:
 *   throw new AppError({ statusCode: 404, message: 'User not found' });
 *   throw new AppError.NotFoundError('User not found');
 *   return ApiResponse.sendError(res, err);
 */
class AppError extends Error {
  constructor({
    message,
    statusCode = 500,
    code,
    details = null
  } = {}) {
    super(
      message ||
        DEFAULT_MESSAGES[statusCode] ||
        http.STATUS_CODES[statusCode] ||
        'An unexpected error occurred'
    );

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code || DEFAULT_CODES[statusCode] || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
    this.details = details == null ? null : details;
    this.isOperational = true;

    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== null ? { details: this.details } : {})
      }
    };
  }

  /**
   * Normalize any thrown value into an AppError.
   * - AppError instances pass through untouched.
   * - Errors exposing a valid 4xx/5xx status (statusCode, status or
   *   boom-style output.statusCode) keep that status.
   * - Anything else becomes a 500 Internal Server Error, whose message is only
   *   exposed when `exposeInternalErrors` is enabled.
   */
  static from(err, options = {}) {
    if (err instanceof AppError) {
      return err;
    }

    const statusCode = resolveStatusCode(err);

    if (statusCode >= 400 && statusCode < 500) {
      const code =
        err && typeof err.code === 'string' && /^[A-Z0-9_]+$/.test(err.code) ? err.code : undefined;
      const details = err && err.details !== undefined ? err.details : null;
      return new AppError({ statusCode, code, message: err && err.message, details });
    }

    const exposeInternalErrors = options.exposeInternalErrors === true;
    const message = exposeInternalErrors && err && err.message ? err.message : DEFAULT_MESSAGES[500];
    return new AppError({ statusCode: 500, message });
  }
}

function resolveStatusCode(err) {
  if (!err || typeof err !== 'object') {
    return 500;
  }

  const candidates = [err.statusCode, err.status, err.output && err.output.statusCode];
  for (const candidate of candidates) {
    if (Number.isInteger(candidate) && candidate >= 400 && candidate <= 599) {
      return candidate;
    }
  }

  return 500;
}

class BadRequestError extends AppError {
  constructor(message, details) {
    super({ statusCode: 400, message, details });
    this.name = 'BadRequestError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message, details) {
    super({ statusCode: 401, message, details });
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message, details) {
    super({ statusCode: 403, message, details });
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends AppError {
  constructor(message, details) {
    super({ statusCode: 404, message, details });
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message, details) {
    super({ statusCode: 409, message, details });
    this.name = 'ConflictError';
  }
}

class UnprocessableEntityError extends AppError {
  constructor(message, details) {
    super({ statusCode: 422, message, details });
    this.name = 'UnprocessableEntityError';
  }
}

class TooManyRequestsError extends AppError {
  constructor(message, details) {
    super({ statusCode: 429, message, details });
    this.name = 'TooManyRequestsError';
  }
}

class BadGatewayError extends AppError {
  constructor(message, details) {
    super({ statusCode: 502, message, details });
    this.name = 'BadGatewayError';
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message, details) {
    super({ statusCode: 503, message, details });
    this.name = 'ServiceUnavailableError';
  }
}

class InternalServerError extends AppError {
  constructor(message, details) {
    super({ statusCode: 500, message, details });
    this.name = 'InternalServerError';
  }
}

// Default export stays the class itself (`require('./lib/AppError')`),
// named exports are attached for destructuring:
// `const { NotFoundError, TooManyRequestsError } = require('./lib/AppError');`
module.exports = AppError;
module.exports.AppError = AppError;
module.exports.DEFAULT_MESSAGES = DEFAULT_MESSAGES;
module.exports.DEFAULT_CODES = DEFAULT_CODES;
module.exports.BadRequestError = BadRequestError;
module.exports.UnauthorizedError = UnauthorizedError;
module.exports.ForbiddenError = ForbiddenError;
module.exports.NotFoundError = NotFoundError;
module.exports.ConflictError = ConflictError;
module.exports.UnprocessableEntityError = UnprocessableEntityError;
module.exports.TooManyRequestsError = TooManyRequestsError;
module.exports.BadGatewayError = BadGatewayError;
module.exports.ServiceUnavailableError = ServiceUnavailableError;
module.exports.InternalServerError = InternalServerError;

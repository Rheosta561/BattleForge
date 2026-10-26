'use strict';

const AppError = require('./AppError');


class ApiResponse {
  constructor({
    success = true,
    message = 'Request Successful',
    data = null,
    meta = null,
    statusCode = 200,
    headers = null
  } = {}) {
    this.success = success;
    this.message = message;
    this.data = data;
    if (meta !== null) {
      this.meta = meta;
    }
    this.statusCode = statusCode;
    this.headers = headers || {};
  }

// successfull response envelope
  static success(data = null, message = 'Request Successful', meta = null) {
    return new ApiResponse({ success: true, message, data, meta });
  }


  static noContent(options = {}) {
    return new ApiResponse({ statusCode: options.statusCode || 204, headers: options.headers });
  }

  toJSON() {
    const response = {
      success: this.success,
      message: this.message,
      data: this.data
    };
    if (this.meta !== undefined) {
      response.meta = this.meta;
    }
    return response;
  }

  /** Send this response on the given Express response object. */
  send(res) {
    if (res.headersSent) {
      return res;
    }

    applyHeaders(this.headers, res);

    if (this.statusCode === 204) {
      return res.status(204).end();
    }

    const body = this.toJSON();
    attachRequestId(body, res);

    return res.status(this.statusCode).json(body);
  }

  /**
   * Send a successful response envelope.
   * options: { message, meta, statusCode, headers }
   */
  static sendSuccess(res, data, options = {}) {
    return new ApiResponse({
      success: true,
      message: options.message,
      data,
      meta: options.meta === undefined ? null : options.meta,
      statusCode: options.statusCode || 200,
      headers: options.headers
    }).send(res);
  }

  /**
   * Send an error response envelope for an AppError (or any thrown value,
   * normalized through `AppError.from`).
   * options: { meta, headers, exposeInternalErrors }
   */
  static sendError(res, error, options = {}) {
    if (res.headersSent) {
      return res;
    }

    const appError = AppError.from(error, options);
    const body = appError.toJSON();

    if (options.meta) {
      body.meta = options.meta;
    }

    attachRequestId(body, res);
    applyHeaders(options.headers, res);

    return res.status(appError.statusCode).json(body);
  }
}

/**
 * Inject the gateway request ID into `meta` when it is available.
 * `res.locals.standardResponseRequestId` is captured by the standardize
 * middleware; fall back to the request itself, because express-gateway only
 * creates `req.egContext` (which owns the request id) once the pipeline starts
 * running — after that middleware has already executed.
 */
function attachRequestId(body, res) {
  if (!body || body.meta) {
    return;
  }

  const requestId =
    (res.locals && res.locals.standardResponseRequestId) ||
    (res.req && res.req.egContext && res.req.egContext.requestID);

  if (requestId) {
    body.meta = { requestId };
  }
}

function applyHeaders(headers, res) {
  Object.keys(headers || {}).forEach(name => res.setHeader(name, headers[name]));
}

module.exports = ApiResponse;

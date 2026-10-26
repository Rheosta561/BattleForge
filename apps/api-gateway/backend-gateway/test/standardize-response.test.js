'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { standardizeResponses } = require('../plugins/standard-response/lib/standardize');
const ApiResponse = require('../lib/Response');
const { AppError, UnauthorizedError } = require('../lib/AppError');

/**
 * A minimal express-like response that reproduces the real behavior: express'
 * `res.json` serializes the payload and then delegates to `this.send(string)`
 * — i.e. it calls back into the (patched) `res.send`.
 */
function makeExpressLikeRes () {
  return {
    statusCode: 200,
    headersSent: false,
    locals: {},
    body: undefined,
    sentWith: null,
    setHeader () {},
    status (code) {
      this.statusCode = code;
      return this;
    },
    json (payload) {
      const serialized = JSON.stringify(payload);
      return this.send(serialized);
    },
    send (payload) {
      this.headersSent = true;
      this.body = payload;
      this.sentWith = 'send';
      return this;
    },
    sendStatus (code) {
      this.statusCode = code;
      this.headersSent = true;
      this.body = http.STATUS_CODES[code];
      this.sentWith = 'sendStatus';
      return this;
    },
    end () {
      this.headersSent = true;
      this.sentWith = 'end';
      return this;
    }
  };
}

function makePatchedReqRes () {
  // Mirrors express-gateway: the standardize middleware runs when the request
  // enters the app, BEFORE the pipeline creates `req.egContext` — so the
  // request id can only be read from `res.req.egContext` at send time.
  const req = { method: 'GET', originalUrl: '/users' };
  const res = makeExpressLikeRes();
  res.req = req;
  let nextCalls = 0;
  standardizeResponses(req, res, () => {
    nextCalls++;
  });
  assert.equal(nextCalls, 1);
  req.egContext = { requestID: 'req-401' }; // created by the pipeline afterwards
  return { req, res };
}

function parseBody (res) {
  assert.equal(typeof res.body, 'string', 'express serializes responses to a string');
  return JSON.parse(res.body);
}

test('sending an AppError through the patch does not recurse and emits the envelope', () => {
  const { res } = makePatchedReqRes();

  // Before the `standardResponseSerializing` guard this recursed
  // (json -> send -> sendError -> json ...) until the process crashed.
  ApiResponse.sendError(res, new UnauthorizedError('A Firebase ID token is required'));

  assert.equal(res.statusCode, 401);
  assert.deepEqual(parseBody(res), {
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'A Firebase ID token is required'
    },
    meta: { requestId: 'req-401' }
  });
});

test('401 AUTH_TOKEN_* envelopes from the auth policy pass through untouched', () => {
  const { res } = makePatchedReqRes();

  ApiResponse.sendError(res, new AppError({ statusCode: 401, code: 'AUTH_TOKEN_EXPIRED', message: 'The authentication token has expired' }));

  const body = parseBody(res);
  assert.equal(res.statusCode, 401);
  assert.equal(body.error.code, 'AUTH_TOKEN_EXPIRED');
  assert.equal(body.error.message, 'The authentication token has expired');
});

test('res.sendStatus(401) is normalized to the standard envelope', () => {
  const { res } = makePatchedReqRes();

  res.sendStatus(401);

  const body = parseBody(res);
  assert.equal(res.statusCode, 401);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'UNAUTHORIZED');
  assert.equal(body.error.message, 'Unauthorized');
});

test('res.status(404).send("plain text") is normalized to the standard envelope', () => {
  const { res } = makePatchedReqRes();

  res.status(404).send('Not Found');

  const body = parseBody(res);
  assert.equal(res.statusCode, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(body.error.message, 'Not Found');
});

test('already-enveloped payloads are not wrapped twice', () => {
  const { res } = makePatchedReqRes();
  const envelope = { success: false, error: { code: 'CUSTOM_POLICY_CODE', message: 'nope' } };

  res.status(400).json(envelope);

  assert.deepEqual(parseBody(res), envelope);
});

test('successful responses pass through unchanged', () => {
  const { res } = makePatchedReqRes();
  res.statusCode = 200;

  res.json({ anything: true });

  assert.deepEqual(parseBody(res), { anything: true });
  assert.equal(res.headersSent, true);
});

test('res.locals.standardResponseRequestId is captured from the request', () => {
  const req = { egContext: { requestID: 'abc-123' } };
  const res = makeExpressLikeRes();

  standardizeResponses(req, res, () => {});

  assert.equal(res.locals.standardResponseRequestId, 'abc-123');
});

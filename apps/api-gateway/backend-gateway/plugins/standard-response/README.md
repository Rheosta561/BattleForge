# standard-response

Local Express Gateway plugin that standardizes every gateway response and
error into a single JSON envelope.

## Response format

Success:

```json
{
  "success": true,
  "message": "Request Successful",
  "data": { "...": "..." },
  "meta": { "requestId": "..." }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "TOO_MANY_REQUESTS",
    "message": "Too many requests, please try again later.",
    "details": { "...": "..." }
  },
  "meta": { "requestId": "..." }
}
```

`meta` is only present when a request ID is available. `details` is optional.

## What it covers

- **Rate limiting (429)** – overrides the core `rate-limit` policy (reusing its
  implementation, counters and `X-RateLimit-*`/`Retry-After` headers) so
  throttled responses use the standard envelope.
- **Authentication failures (401/403)** – gateway policies that answer with
  `res.sendStatus(401)` / `res.sendStatus(403)` are normalized.
- **Upstream/proxy failures (502)** – `Bad gateway.` responses are normalized.
  Responses streamed from upstream services (including their 4xx/5xx bodies)
  are passed through untouched.
- **Unmatched routes (404)** – a catch-all handler mounted after the pipelines
  returns the standard envelope.
- **Propagated errors** – a centralized error handler catches anything
  reaching `next(err)` and formats it with the appropriate status code.

## Building blocks

The envelope itself lives in the shared `lib/` folder at the gateway root, and
is used by this plugin every time it answers a request:

- `lib/Response.js` – `ApiResponse` class (`ApiResponse.success`,
  `ApiResponse.noContent`, `send`, `ApiResponse.sendSuccess`,
  `ApiResponse.sendError`). `sendError` turns any thrown value into the
  `{ success: false, error: { code, message, details? } }` envelope and injects
  `meta.requestId` when available.
- `lib/AppError.js` – `AppError` class plus `BadRequestError`,
  `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`,
  `UnprocessableEntityError`, `TooManyRequestsError`, `BadGatewayError`,
  `ServiceUnavailableError` and `InternalServerError`.
  `AppError.from(err)` normalizes arbitrary errors; unknown 5xx messages are
  hidden unless `exposeInternalErrors` is enabled.
- `middleware/errorHandler.js` – `notFoundHandler` and `errorHandler({ exposeInternalErrors, logger })`,
  the centralized catch-all handlers installed after the pipelines. Both build
  their payloads with `AppError` and send them through `ApiResponse`.

## Settings (`system.config.yml`)

```yaml
plugins:
  standard-response:
    package: ./plugins/standard-response
    exposeInternalErrors: false   # hide internal 5xx messages from clients
```

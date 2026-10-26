# firebase-auth

Local Express Gateway plugin that verifies Firebase ID tokens when establishing
a Lagertha application session and validates Lagertha access tokens before
traffic reaches protected upstream services.

## Lagertha application access tokens

`POST /auth/session` accepts a Firebase ID token in
`Authorization: Bearer <firebase-id-token>` (no request body is required). The
gateway verifies it with the existing Firebase Admin instance, then returns:

```json
{
  "success": true,
  "message": "Application session established",
  "data": {
    "accessToken": "<lagertha-access-jwt>",
    "tokenType": "Bearer",
    "expiresIn": 900
  }
}
```

Protected API calls use `Authorization: Bearer <lagertha-access-jwt>` or the
`access-token` cookie. The JWT is signed with HS256, expires after 15 minutes,
and contains `iss`, `aud`, `sub`, `iat`, `exp`, `jti`, and `token_use` claims.
If both credentials are supplied and differ, the gateway rejects the request.
Firebase ID tokens and Lagertha access tokens are verified by separate code
paths and are not interchangeable. `/health` remains public; `/users` requires
a Lagertha token.

Configure these variables in the existing
`apps/api-gateway/backend-gateway/.env` or in the gateway process environment:

- `LAGERTHA_ACCESS_TOKEN_SECRET`: dedicated random secret, at least 32 bytes.
  It must not be the Firebase service-account private key.
- `LAGERTHA_ACCESS_TOKEN_ISSUER`: expected application-token issuer.
- `LAGERTHA_ACCESS_TOKEN_AUDIENCE`: expected API audience.

Use an approved secret manager or local secure secret-generation workflow.
Do not commit the secret, put it in source control, or expose it to clients.
The gateway fails pipeline startup if any required variable is missing or
invalid. Do not reuse the Firebase service-account key.

The access token is intended for short-lived in-memory use by web clients and
Expo SecureStore for Expo clients. Web refresh tokens use HttpOnly, Secure cookies;
Expo refresh tokens use SecureStore. Raw refresh tokens are never stored in Firestore.

## Authentication Endpoints

1. `POST /auth/session`
   - Accepts a Firebase ID token via `Authorization: Bearer <firebase-id-token>` or `access-token` cookie.
   - Verifies identity via Firebase Admin SDK.
   - Persists a session document to Firestore (`sessions/{sessionId}`) with an opaque session ID, token family ID, and SHA-256 hashed refresh token.
   - Upserts verified user identity into Firestore `users/{uid}`.
   - Issues a Lagertha access JWT (15-minute TTL) and a 7-day refresh token (`<sessionId>.<secret>`).
   - For web clients, sets HttpOnly, Secure `refresh-token` and `access-token` cookies.

2. `POST /auth/refresh`
   - Accepts a refresh token via request body (`{ refreshToken }`), `refresh-token` cookie, or `x-refresh-token` header.
   - Performs atomic token rotation in a Firestore transaction.
   - Compares SHA-256 hash using constant-time comparison (`crypto.timingSafeEqual`).
   - If a rotated or invalid token is presented (reuse detected), immediately revokes the session and returns `401 AUTH_TOKEN_REVOKED`.
   - On success, rotates the refresh token secret, increments `refreshTokenVersion`, and issues a new Lagertha access JWT.

3. `POST /auth/logout`
   - Accepts a refresh token or session ID via request body, cookie, or header.
   - Marks the session revoked (`revokedAt`, `revocationReason: LOGOUT`) in Firestore.
   - Clears `access-token` and `refresh-token` cookies with expired `Max-Age=0`.

4. `GET /auth/me`
   - Protected by `lagertha-auth` policy; requires a valid Lagertha access JWT.
   - Retrieves the user profile from `users/{uid}` and returns safe fields (`uid`, `displayName`, `photoURL`, `email`, `phoneNumber`, `preferences`, `profileStatus`).
   - Never exposes tokens, secrets, or internal Firestore metadata.


## Authentication flow

1. `Authorization: Bearer <token>` and/or an `access-token` cookie are read.
   - Both supplied and different -> `401 AUTH_TOKEN_CONFLICT`.
   - A malformed `Authorization` header -> `401 AUTH_TOKEN_MALFORMED`.
   - No token at all -> `401 AUTH_TOKEN_MISSING`.
2. The token is verified with `verifyIdToken()` from the single Firebase Admin
   instance in `config/firebase.js`.
   - expired -> `401 AUTH_TOKEN_EXPIRED`
   - anything else (invalid signature, malformed JWT, revoked, ...) ->
     `401 AUTH_TOKEN_INVALID`
3. On success the verified claims are attached to the request:
   - `req.egContext.firebase` — express-gateway's extension mechanism, usable
     from policies, expressions and templates (`${firebase.uid}`)
   - `req.user` — generic express identity (`egContext.consumer` resolves to it)

The identity is a frozen object: `{ uid, email, emailVerified, name, picture,
phoneNumber, signInProvider, authTime }`. Only Firebase's verified claims are
used — UIDs supplied in the body, query string or headers are never trusted.

Failures return the standard gateway envelope with safe messages; Firebase
internals, stack traces and token values are never sent to clients or logged.

## Configuration

`config/system.config.yml`:

```yaml
plugins:
  firebase-auth:
    package: ./plugins/firebase-auth
```

`config/gateway.config.yml`:

```yaml
policies:
  - firebase-auth        # declared policies must be listed here

pipelines:
  user-pipeline:
    policies:
      - firebase-auth:
          - action:
              publicPaths: []   # routes that skip authentication
```

`publicPaths` supports exact paths (`/health`) and trailing-`*` prefix matches
(`/users/*`). Declare authentication endpoints and other public routes there.

## Tests

```bash
npm test
```

Unit tests stub Firebase verification through the require cache
(`test/helpers/firebase-stub.js`) — no real credentials or Firebase account
are needed.

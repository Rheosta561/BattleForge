# firebase-auth

Local Express Gateway plugin that verifies Firebase ID tokens before traffic
reaches upstream services.

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

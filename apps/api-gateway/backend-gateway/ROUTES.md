# Lagertha API Gateway — Route & Endpoint Reference

The Lagertha API Gateway (`apps/api-gateway/backend-gateway`) is built on Express Gateway with custom security and authentication policies. It acts as the edge entry point for all client traffic (React Web, React Native / Expo), enforces rate limiting, handles session lifecycles, validates access tokens, and securely proxies authorized requests to downstream microservices.

---

## 1. Gateway Overview & Base URL

- **Host**: `http://localhost:8080` (or configured gateway host/port)
- **Downstream Services**:
  - `user-service`: `http://localhost:3000` (handles user profile logic and `/users` routes)
  - Other microservices (`workout-service`, `nutrition-service`, etc.) are mounted behind respective pipelines.

---

## 2. Response & Error Envelopes

Every response emitted by the gateway follows a standardized JSON envelope structure.

### 2.1 Success Response (`200 OK`, `201 Created`)
```json
{
  "success": true,
  "message": "Application session established",
  "data": { ... },
  "meta": {
    "requestId": "4c9e887e-9764-4e20-9445-d85c189b80b7"
  }
}
```

### 2.2 Error Response (`400`, `401`, `403`, `404`, `429`, `500`)
```json
{
  "success": false,
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "The authentication token has expired"
  },
  "meta": {
    "requestId": "4c9e887e-9764-4e20-9445-d85c189b80b7"
  }
}
```
*Note: Gateway errors never leak stack traces, Firebase internal errors, or raw token values to clients.*

---

## 3. Token Strategy & Security Boundaries

Lagertha enforces a strict separation between **identity verification** and **API authorization**:

| Token Type | Issuer / Authority | Lifetime | Transmission | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Firebase ID Token** | Firebase Authentication (Google, Phone) | ~1 hour | `Authorization: Bearer <token>` or `access-token` cookie | Exclusively used with `POST /auth/session` to establish an application session. |
| **Lagertha Access JWT** | Lagertha API Gateway (`HS256`) | 15 minutes (`900s`) | `Authorization: Bearer <jwt>` or `access-token` cookie | Authorizes calls to protected API routes (`/users`, `/auth/me`). Contains `token_use: "lagertha_access"`, `sub: <uid>`, `jti`. |
| **Lagertha Refresh Token** | Lagertha API Gateway (`<sessionId>.<secret>`) | 7 days | Request body (`refreshToken`), `refresh-token` cookie, or `x-refresh-token` header | Used with `POST /auth/refresh` to atomically rotate refresh tokens and obtain new access JWTs. |

> [!IMPORTANT]
> - Firebase ID tokens and Lagertha Access JWTs are **not interchangeable**. Protected business routes will reject Firebase ID tokens.
> - Raw refresh token secrets are **never stored in Firestore**; only a one-way `SHA-256` hash is stored.
> - Web clients use `HttpOnly; Secure; SameSite=Lax` cookies; Expo mobile clients store refresh tokens in `Expo SecureStore` and keep access tokens in memory.

---

## 4. Endpoints Reference

### 4.1 `GET /health`
Public gateway health check.

- **Access**: Public (No authentication required)
- **Method**: `GET`
- **Rate Limit**: 10 requests / minute
- **Response** (`200 OK`):
```json
{
  "success": true,
  "service": "user-service",
  "status": "healthy"
}
```

---

### 4.2 `POST /auth/session`
Verifies a Firebase ID token, creates a persistent session in Firestore, upserts the user profile in Firestore `users/{uid}`, and issues a Lagertha Access JWT and refresh token.

- **Access**: Public / Initial Auth (Requires valid Firebase ID token)
- **Method**: `POST`
- **Headers**:
  - `Authorization: Bearer <firebase-id-token>` (or `access-token` cookie)
  - `Content-Type: application/json`
- **Request Body** *(Optional metadata)*:
```json
{
  "clientType": "web",        // "web" | "expo"
  "deviceLabel": "iPhone 15"  // Optional non-sensitive label
}
```
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Application session established",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "6a9f4c32-4e92-498b-9d48-356a1b2c3d4e.a8f94e2b0c3d4e5f...",
    "sessionId": "6a9f4c32-4e92-498b-9d48-356a1b2c3d4e",
    "tokenType": "Bearer",
    "expiresIn": 900
  },
  "meta": { "requestId": "..." }
}
```
- **Cookies Set** *(for web clients / cookie requests)*:
  - `access-token`: `HttpOnly; Path=/; SameSite=Lax; Max-Age=900`
  - `refresh-token`: `HttpOnly; Path=/auth; SameSite=Lax; Max-Age=604800`

---

### 4.3 `POST /auth/refresh`
Exchanges an existing refresh token for a new Lagertha Access JWT and rotates the refresh token.

- **Access**: Requires Refresh Token
- **Method**: `POST`
- **Headers / Cookies / Body** *(Any of the following)*:
  - Request body: `{ "refreshToken": "<sessionId>.<secret>" }`
  - Cookie: `refresh-token=<sessionId>.<secret>`
  - Header: `x-refresh-token: <sessionId>.<secret>`
- **Rotation & Reuse Detection**:
  - Runs in an atomic Firestore transaction.
  - Generates a new secret, updates the stored `refreshTokenHash`, and increments `refreshTokenVersion`.
  - **Replay / Reuse Protection**: If a previously used/invalid token is submitted, the gateway detects the mismatch, **immediately revokes the session**, and returns `401 AUTH_TOKEN_REVOKED`.
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Session refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "6a9f4c32-4e92-498b-9d48-356a1b2c3d4e.f7e8d9c0b1a2...",
    "tokenType": "Bearer",
    "expiresIn": 900
  },
  "meta": { "requestId": "..." }
}
```

---

### 4.4 `POST /auth/logout`
Revokes the current session in Firestore and clears authentication cookies.

- **Access**: Authenticated or with active session
- **Method**: `POST`
- **Request Parameters** *(Optional)*:
  - Body: `{ "refreshToken": "..." }` or `{ "sessionId": "..." }`
  - Or `refresh-token` cookie
- **Actions Taken**:
  - Sets `revokedAt = now` and `revocationReason = "LOGOUT"` in Firestore `sessions/{sessionId}`.
  - Clears `access-token` and `refresh-token` cookies with `Max-Age=0`.
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Logged out successfully",
  "data": null,
  "meta": { "requestId": "..." }
}
```

---

### 4.5 `GET /auth/me`
Retrieves safe user profile and session identity for the currently authenticated user.

- **Access**: Protected (Requires valid Lagertha Access JWT)
- **Method**: `GET`
- **Headers**:
  - `Authorization: Bearer <lagertha-access-jwt>` (or `access-token` cookie)
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Authenticated user profile retrieved",
  "data": {
    "uid": "firebase-uid-12345",
    "displayName": "Lagertha Lothbrok",
    "photoURL": "https://cdn.lagertha.dev/avatars/lagertha.jpg",
    "email": "lagertha@kattegat.dev",
    "phoneNumber": "+1234567890",
    "emailVerified": true,
    "preferences": {
      "units": "metric",
      "timezone": "UTC"
    },
    "profileStatus": "active",
    "createdAt": "2026-10-26T18:00:00.000Z",
    "updatedAt": "2026-10-26T18:30:00.000Z"
  },
  "meta": { "requestId": "..." }
}
```

---

### 4.6 Downstream User Routes (`/users`, `/users/*`)
Proxied directly to `user-service` at `http://localhost:3000`.

- **Access**: Protected (Requires valid Lagertha Access JWT)
- **Method**: `GET`, `POST`, `PUT`, `DELETE`, etc.
- **Headers**:
  - `Authorization: Bearer <lagertha-access-jwt>`
- **Behavior**:
  - Gateway verifies the Lagertha JWT.
  - Gateway attaches verified identity to `req.egContext.lagertha`, `req.lagerthaIdentity`, and `req.user`.
  - Proxies request to `user-service`.

---

## 5. Error Code Reference

| Status | Error Code | Description / Reason |
| :---: | :--- | :--- |
| **401** | `AUTH_TOKEN_MISSING` | Missing Firebase ID token on `/auth/session` or missing refresh token on `/auth/refresh`. |
| **401** | `AUTH_TOKEN_MALFORMED` | Malformed Bearer header or malformed refresh token string. |
| **401** | `AUTH_TOKEN_CONFLICT` | Authorization header and cookie supplied contradictory tokens. |
| **401** | `AUTH_TOKEN_EXPIRED` | Firebase ID token or refresh token has expired. |
| **401** | `AUTH_TOKEN_INVALID` | Invalid token signature, corrupted claims, or session not found. |
| **401** | `AUTH_TOKEN_REVOKED` | Session was revoked (logout or token reuse detected). |
| **401** | `ACCESS_TOKEN_MISSING` | Missing Lagertha access JWT on protected route. |
| **401** | `ACCESS_TOKEN_MALFORMED`| Malformed Authorization Bearer header for access token. |
| **401** | `ACCESS_TOKEN_CONFLICT` | Conflicting header and cookie access tokens. |
| **401** | `ACCESS_TOKEN_EXPIRED` | Lagertha access JWT has passed its 15-minute validity window. |
| **401** | `ACCESS_TOKEN_INVALID` | Invalid signature, algorithm, issuer, audience, or token type. |
| **429** | `TOO_MANY_REQUESTS` | Rate limit exceeded (default 10 requests / minute / window). |
| **500** | `INTERNAL_SERVER_ERROR`| Unexpected internal gateway error; details suppressed for security. |

---

## 6. Client Implementation Example

### React Web (`fetch` with credentials):
```javascript
// 1. Establish session after Firebase sign-in:
const sessionRes = await fetch('http://localhost:8080/auth/session', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${firebaseIdToken}`,
    'Content-Type': 'application/json'
  },
  credentials: 'include', // receives HttpOnly cookies
  body: JSON.stringify({ clientType: 'web' })
});
const { data } = await sessionRes.json();
const accessToken = data.accessToken;

// 2. Access protected endpoint:
const meRes = await fetch('http://localhost:8080/auth/me', {
  headers: { 'Authorization': `Bearer ${accessToken}` },
  credentials: 'include'
});

// 3. Refresh when token expires:
const refreshRes = await fetch('http://localhost:8080/auth/refresh', {
  method: 'POST',
  credentials: 'include' // passes refresh-token cookie automatically
});
const newTokens = await refreshRes.json();
```

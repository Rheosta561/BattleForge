# Lagertha API Gateway (`backend-gateway`)

The perimeter security gateway and authentication service for the Lagertha fitness platform, built on Express Gateway.

## Quick Links
- **[Complete Routes & Endpoint Reference](file:///Users/anubhavmishra/Documents/August%20Dev%20/lagertha-backend/apps/api-gateway/backend-gateway/ROUTES.md)**: Full API contracts for `/health`, `/auth/session`, `/auth/refresh`, `/auth/logout`, `/auth/me`, and `/users`.
- **[Firebase & JWT Auth Plugin Docs](file:///Users/anubhavmishra/Documents/August%20Dev%20/lagertha-backend/apps/api-gateway/backend-gateway/plugins/firebase-auth/README.md)**: Detailed specification for the internal gateway authentication plugin.

## Core Responsibilities
1. **Perimeter Authentication**:
   - Exchanges Firebase ID tokens for Lagertha access JWTs via `POST /auth/session`.
   - Protects downstream APIs (`/users`, etc.) by enforcing valid Lagertha Access JWTs.
2. **Session Persistence & Refresh Token Lifecycle**:
   - Manages the `sessions` collection in Cloud Firestore.
   - Generates 7-day cryptographically secure refresh tokens with SHA-256 hashed storage.
   - Implements atomic refresh token rotation and automatic reuse/replay attack detection on `POST /auth/refresh`.
   - Handles server-side session revocation on `POST /auth/logout`.
3. **Traffic Management**:
   - Rate limiting, path logging, and reverse proxy routing to downstream microservices.

## Running Tests
Run the test suite directly with Node's native test runner:
```bash
npm test
```
All Firebase and Firestore interactions in the test suite are stubbed/mocked; no live credentials or external network access are required for testing.

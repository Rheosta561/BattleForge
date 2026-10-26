'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const ACCESS_TOKEN_ALGORITHM = 'HS256';
const ACCESS_TOKEN_USE = 'lagertha_access';

class AccessTokenConfigurationError extends Error {
  constructor (message) {
    super(message);
    this.name = 'AccessTokenConfigurationError';
  }
}

function readConfiguration (env = process.env) {
  const secret = env.LAGERTHA_ACCESS_TOKEN_SECRET;
  const issuer = env.LAGERTHA_ACCESS_TOKEN_ISSUER;
  const audience = env.LAGERTHA_ACCESS_TOKEN_AUDIENCE;

  if (!secret) {
    throw new AccessTokenConfigurationError(
      'LAGERTHA_ACCESS_TOKEN_SECRET must be configured for application access tokens'
    );
  }
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new AccessTokenConfigurationError(
      'LAGERTHA_ACCESS_TOKEN_SECRET must contain at least 32 bytes'
    );
  }
  if (!issuer || !issuer.trim()) {
    throw new AccessTokenConfigurationError(
      'LAGERTHA_ACCESS_TOKEN_ISSUER must be configured for application access tokens'
    );
  }
  if (!audience || !audience.trim()) {
    throw new AccessTokenConfigurationError(
      'LAGERTHA_ACCESS_TOKEN_AUDIENCE must be configured for application access tokens'
    );
  }

  if (env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
      if (secret === serviceAccount.private_key) {
        throw new AccessTokenConfigurationError(
          'LAGERTHA_ACCESS_TOKEN_SECRET must be dedicated and cannot reuse the Firebase service-account private key'
        );
      }
    } catch (err) {
      if (err instanceof AccessTokenConfigurationError) {
        throw err;
      }
    }
  }

  return { secret, issuer: issuer.trim(), audience: audience.trim() };
}

function createAccessTokenService (env = process.env) {
  const configuration = readConfiguration(env);

  function issue (uid) {
    if (typeof uid !== 'string' || !uid) {
      throw new TypeError('A verified Firebase UID is required to issue an access token');
    }

    return jwt.sign(
      { token_use: ACCESS_TOKEN_USE },
      configuration.secret,
      {
        algorithm: ACCESS_TOKEN_ALGORITHM,
        audience: configuration.audience,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        issuer: configuration.issuer,
        jwtid: crypto.randomUUID(),
        subject: uid
      }
    );
  }

  function verify (token) {
    if (typeof token !== 'string' || !token) {
      throw new jwt.JsonWebTokenError('Invalid access token');
    }

    const claims = jwt.verify(token, configuration.secret, {
      algorithms: [ACCESS_TOKEN_ALGORITHM],
      audience: configuration.audience,
      issuer: configuration.issuer
    });

    if (
      !claims ||
      typeof claims !== 'object' ||
      claims.token_use !== ACCESS_TOKEN_USE ||
      typeof claims.sub !== 'string' ||
      !claims.sub ||
      typeof claims.jti !== 'string' ||
      !claims.jti ||
      !Number.isInteger(claims.iat) ||
      !Number.isInteger(claims.exp)
    ) {
      throw new jwt.JsonWebTokenError('Invalid access token claims');
    }

    return claims;
  }

  return Object.freeze({
    issue,
    verify,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  });
}

module.exports = {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_TTL_SECONDS,
  ACCESS_TOKEN_USE,
  AccessTokenConfigurationError,
  createAccessTokenService
};

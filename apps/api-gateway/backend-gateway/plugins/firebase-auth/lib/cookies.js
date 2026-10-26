'use strict';

const ACCESS_COOKIE_NAME = 'access-token';
const REFRESH_COOKIE_NAME = 'refresh-token';

function readCookie (cookieHeader, name) {
  if (!cookieHeader || !name) {
    return null;
  }

  for (const part of String(cookieHeader).split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() !== name) {
      continue;
    }

    let value = part.slice(separator + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

function setAuthCookies (res, { accessToken, refreshToken, isSecure = false }) {
  const cookies = [];

  if (accessToken) {
    let cookie = `${ACCESS_COOKIE_NAME}=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`;
    if (isSecure) cookie += '; Secure';
    cookies.push(cookie);
  }

  if (refreshToken) {
    let cookie = `${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=604800`;
    if (isSecure) cookie += '; Secure';
    cookies.push(cookie);
  }

  if (cookies.length && typeof res.setHeader === 'function') {
    const existing = res.getHeader ? res.getHeader('Set-Cookie') : undefined;
    const combined = existing ? (Array.isArray(existing) ? existing.concat(cookies) : [existing].concat(cookies)) : cookies;
    res.setHeader('Set-Cookie', combined);
  }
}

function clearAuthCookies (res) {
  const cookies = [
    `${ACCESS_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `${REFRESH_COOKIE_NAME}=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  ];

  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', cookies);
  }
}

module.exports = {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  readCookie,
  setAuthCookies,
  clearAuthCookies
};

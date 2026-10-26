'use strict';

/**
 * CLI helper to generate a valid Firebase ID token for testing in Postman.
 *
 * Usage:
 *   node scripts/get-firebase-token.js [optional_uid]
 *
 * Requires FIREBASE_WEB_API_KEY in .env to exchange a custom token for an ID token.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { firebaseAuth } = require('../config/firebase');

async function main () {
  const uid = process.argv[2] || 'postman-test-warrior';
  const apiKey = process.env.FIREBASE_WEB_API_KEY;

  console.log(`Generating test credentials for UID: "${uid}"...`);

  const customToken = await firebaseAuth.createCustomToken(uid, {
    email: `${uid}@lagertha.test`,
    name: 'Lagertha Postman Tester'
  });

  if (!apiKey) {
    console.log('\n--- Custom Token Generated ---');
    console.log(customToken);
    console.log('\nNote: To exchange this for an ID token automatically, add FIREBASE_WEB_API_KEY to your .env');
    console.log('Or use Firebase REST API in Postman:');
    console.log('POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=[YOUR_API_KEY]');
    console.log(`Body: { "token": "${customToken}", "returnSecureToken": true }`);
    return;
  }

  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });

  const data = await res.json();
  if (data.idToken) {
    console.log('\n================ FIREBASE ID TOKEN ================');
    console.log(data.idToken);
    console.log('====================================================\n');
    console.log('Paste this token into Postman Authorization: Bearer <token>');
  } else {
    console.error('Failed to exchange custom token:', data);
  }
}

main().catch(err => {
  console.error('Error generating token:', err.message);
  process.exitCode = 1;
});

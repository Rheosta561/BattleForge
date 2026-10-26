'use strict';

/**
 * Read-only Firestore connectivity probe. Listing root collections verifies
 * the configured Admin credentials and Firestore API without changing data.
 */
async function checkFirestore (firestore) {
  await firestore.listCollections();
}

async function main () {
  const { firebaseApp } = require('../config/firebase');
  const { getFirestore } = require('firebase-admin/firestore');

  await checkFirestore(getFirestore(firebaseApp));
  console.log('Firestore connectivity check succeeded (read-only listCollections).');
}

if (require.main === module) {
  main().catch(err => {
    const code = err && err.code;
    const safeCode = typeof code === 'string' && /^[a-z0-9_/-]+$/i.test(code)
      ? code.toUpperCase()
      : Number.isInteger(code) ? String(code) : 'UNKNOWN';
    console.error(`Firestore connectivity check failed (code: ${safeCode}).`);
    process.exitCode = 1;
  });
}

module.exports = checkFirestore;

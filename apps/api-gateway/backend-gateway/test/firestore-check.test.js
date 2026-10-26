'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const checkFirestore = require('../scripts/check-firestore');

test('Firestore connectivity probe performs only a root-collection read', async () => {
  let calls = 0;
  const firestore = {
    async listCollections () {
      calls++;
      return [];
    }
  };

  await checkFirestore(firestore);

  assert.equal(calls, 1);
});

test('Firestore connectivity probe propagates read failures', async () => {
  const failure = new Error('permission denied');

  await assert.rejects(
    checkFirestore({
      async listCollections () {
        throw failure;
      }
    }),
    err => err === failure
  );
});

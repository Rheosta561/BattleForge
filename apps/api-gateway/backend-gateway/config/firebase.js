
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const {
  initializeApp,
  cert,
  getApps,
} = require("firebase-admin/app");

const { getAuth } = require("firebase-admin/auth");

const projectId = process.env.FIREBASE_PROJECT_ID;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!projectId) {
  throw new Error("FIREBASE_PROJECT_ID is missing from .env");
}

if (!serviceAccountJson) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT is missing from .env");
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch {
  throw new Error(
    "FIREBASE_SERVICE_ACCOUNT must contain valid JSON"
  );
}

if (
  serviceAccount.project_id !== projectId ||
  !serviceAccount.client_email ||
  !serviceAccount.private_key
) {
  throw new Error(
    "Firebase service-account credentials are invalid or do not match FIREBASE_PROJECT_ID"
  );
}

const firebaseApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert(serviceAccount),
        projectId,
      });

const firebaseAuth = getAuth(firebaseApp);

module.exports = {
  firebaseApp,
  firebaseAuth,
};

/**
 * Google Sign-In for My Accounts (Drive backup).
 *
 * Only the OAuth *client ID* belongs here. It is not a secret and is visible in the browser.
 * The *client secret* from GCP must NEVER be committed or embedded in front-end JavaScript.
 * Keep the full JSON download as google-oauth-web-client.local.json (gitignored) for your records
 * or for a future server-side integration only.
 *
 * Full GCP JSON: copy to google-oauth-web-client.local.json in this folder (see .gitignore).
 *
 * Also enable the Google Docs API and add OAuth scopes (consent screen + GCP):
 *   https://www.googleapis.com/auth/documents.readonly
 *   https://www.googleapis.com/auth/drive.metadata.readonly
 * The second scope lists files in My Drive root and Shared with me to find account-mapping.doc.
 *
 * Optional: skip Drive search by name and pin the mapping file ID:
 *   window.GOOGLE_ACCOUNT_MAPPING_DOC_ID = 'your-document-id';
 * Example (your account-mapping index doc):
 *   window.GOOGLE_ACCOUNT_MAPPING_DOC_ID = '1TWqDyzBrye-0hHq39DyoGYFxRqBktmwxj1qLglWCe10';
 *
 * my-accounts.html also applies a small inline fallback if this file is missing or cached empty;
 * keep this file in sync when you rotate the OAuth client.
 */
window.GOOGLE_CLIENT_ID = '391245638390-2ll2p95i0a6a1e1qj005rsk9kgbtskfd.apps.googleusercontent.com';

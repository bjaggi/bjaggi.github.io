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
 * Also enable the Google Docs API and add OAuth scope:
 *   https://www.googleapis.com/auth/documents.readonly
 * so “Import from Doc” can read account profiles written in Google Docs.
 */
window.GOOGLE_CLIENT_ID = '391245638390-2ll2p95i0a6a1e1qj005rsk9kgbtskfd.apps.googleusercontent.com';

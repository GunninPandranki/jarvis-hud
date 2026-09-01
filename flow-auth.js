// flow-auth.js
// Google OAuth 2.0 flow helpers for Jarvis HUD.
//
// Environment variables (add to .env):
//   GOOGLE_CLIENT_ID      – OAuth 2.0 client ID from Google Cloud Console
//   GOOGLE_CLIENT_SECRET  – OAuth 2.0 client secret
//   GOOGLE_REDIRECT_URI   – Must match one registered in the Cloud Console
//                           Default: http://localhost:8787/api/flow/auth/callback

'use strict';

const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cloudplatformprojects.readonly',
];

// In-memory token store (single-user dev tool; use a DB for multi-user).
let _tokens = null;

function buildOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ||
    'http://localhost:8787/api/flow/auth/callback';

  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env'
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// ── Auth status ──────────────────────────────────────────────────────────────

async function authStatus() {
  if (!_tokens) {
    return { loggedIn: false, reason: 'no_tokens' };
  }

  try {
    const oauth2 = buildOAuth2Client();
    oauth2.setCredentials(_tokens);

    // Refresh if expired
    if (_tokens.expiry_date && _tokens.expiry_date < Date.now()) {
      const { credentials } = await oauth2.refreshAccessToken();
      _tokens = credentials;
    }

    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
    const { data } = await oauth2Api.userinfo.get();
    return { loggedIn: true, user: { email: data.email, name: data.name, picture: data.picture } };
  } catch (err) {
    _tokens = null;
    return { loggedIn: false, reason: err.message };
  }
}

// ── Start login ──────────────────────────────────────────────────────────────

function startLogin() {
  const oauth2 = buildOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
  return { url };
}

// ── Handle OAuth callback ────────────────────────────────────────────────────

async function handleCallback(code) {
  const oauth2 = buildOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  _tokens = tokens;
  return tokens;
}

// ── Confirm login ────────────────────────────────────────────────────────────

async function confirmLogin() {
  return authStatus();
}

// ── List Google Cloud projects ───────────────────────────────────────────────

async function listProjects() {
  if (!_tokens) {
    throw new Error('Not logged in');
  }

  const oauth2 = buildOAuth2Client();
  oauth2.setCredentials(_tokens);

  const crm = google.cloudresourcemanager({ version: 'v1', auth: oauth2 });
  const { data } = await crm.projects.list({ pageSize: 50 });
  return (data.projects || []).map(p => ({
    projectId: p.projectId,
    name: p.name,
    projectNumber: p.projectNumber,
    lifecycleState: p.lifecycleState,
    createTime: p.createTime,
  }));
}

module.exports = { authStatus, startLogin, handleCallback, confirmLogin, listProjects };

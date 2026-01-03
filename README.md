# 📊 Google Sheets Sync - Generic Backend Proxy

> A domain-agnostic, serverless solution for syncing any app data to Google Sheets using OAuth 2.0 and backend proxy architecture.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)](https://vercel.com)
[![Platform Agnostic](https://img.shields.io/badge/platform-agnostic-blue)](README.md)

---

## 🎯 Overview

**Google Sheets Sync** is a **domain-agnostic** synchronization system that enables any application to sync data to Google Sheets without exposing OAuth secrets in client code. Works with nutrition trackers, expense managers, fitness apps, activity logs, or any data logging application.

### Key Features

✅ **Domain Agnostic** - Works with any data structure  
✅ **Zero Secrets in Client Code** - OAuth credentials server-side only  
✅ **Privacy-First** - Pass-through architecture, no data retention  
✅ **OAuth 2.0 Compliant** - Industry-standard authentication  
✅ **Rate Limited** - Prevents abuse (100 req/hour/user)  
✅ **Serverless** - Auto-scaling, pay-per-request  
✅ **Unlimited Columns** - Supports A-Z, AA-ZZ, AAA-ZZZ, etc.  

---

## Why this exists

Many small teams and individual builders want the simplicity of Google Sheets without leaking credentials, storing personal data, or standing up a full backend.
This project documents a clean, reusable pattern for doing exactly that.

---

## 🏗️ Architecture

```
┌─────────────────┐
│   Any App       │
│ (Web/Mobile/PWA)│
└────────┬────────┘
         │ 1. User signs in with Google
         │ 2. Gets OAuth access token
         ▼
┌─────────────────┐
│  Your Client    │ (Platform-specific OAuth)
│  Code           │
└────────┬────────┘
         │ 3. POST { accessToken, sheetConfig, rowData }
         │    via HTTPS
         ▼
┌─────────────────┐
│ Vercel Function │ (Generic Backend Proxy)
│   sync.js       │
└────────┬────────┘
         │ 4. Validates token with Google
         │ 5. Uses Google Sheets API
         ▼
┌─────────────────┐
│ Google Sheets   │
│ (User's Drive)  │
└─────────────────┘
```
**Note:** OAuth authentication is handled entirely on the client using platform-appropriate Google Identity SDKs. The backend never initiates OAuth flows.
---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Vercel account (free tier)
- Google Cloud project with Sheets API enabled
- OAuth 2.0 credentials (Web Client ID + Secret)

**Note:** Client OAuth implementation varies by platform (see [Client Integration](#-client-integration)).

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/google-sheets-sync.git
cd google-sheets-sync
npm install
```

### 2. Configure Environment

Create `.env`:

```env
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-web-client-secret
ALLOWED_ORIGIN=*
```

> ⚠️ **Security Note:**  
> - `GOOGLE_CLIENT_ID` is **public** (safe to expose in client code)  
> - `GOOGLE_CLIENT_SECRET` is **private** (NEVER expose to client)

### 3. Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

### 4. Set Secrets

```bash
vercel secrets add google-client-id "your-client-id"
vercel secrets add google-client-secret "your-client-secret"
vercel secrets add allowed-origin "*"
```

### 5. Get Your Endpoint

After deployment:
```
https://your-app.vercel.app/api/sync
```

---

## 📊 Generic Data Schema

### Request Format (Domain Agnostic)

```json
{
  "accessToken": "ya29.a0AfH6...",
  "sheetConfig": {
    "sheetName": "App Logs",
    "headers": ["Date", "User", "Action", "Status"]
  },
  "rowData": [
    ["2026-01-03", "User123", "Login", "Success"],
    ["2026-01-03", "User123", "Upload", "Failed"]
  ]
}
```

**Fields:**
- `accessToken` (string, required) - OAuth access token
- `sheetConfig` (object, required)
  - `sheetName` (string) - Name of spreadsheet to create/update
  - `headers` (array) - Column headers (created if sheet doesn't exist)
- `rowData` (array of arrays, required) - Rows to append
  - Each row must have same length as `headers`

---

## 🎯 Domain-Specific Examples

### Nutrition Tracker

```json
{
  "accessToken": "ya29...",
  "sheetConfig": {
    "sheetName": "Nutrition Log",
    "headers": ["Date", "Time", "Food", "Calories", "Protein", "Carbs", "Fat"]
  },
  "rowData": [
    ["2026-01-03", "8:00 AM", "Oatmeal", 150, 5, 27, 3],
    ["2026-01-03", "12:30 PM", "Chicken Salad", 350, 35, 10, 15]
  ]
}
```

### Expense Tracker

```json
{
  "accessToken": "ya29...",
  "sheetConfig": {
    "sheetName": "Expenses 2026",
    "headers": ["Date", "Category", "Amount", "Vendor", "Payment Method"]
  },
  "rowData": [
    ["2026-01-03", "Food", 45.67, "Whole Foods", "Credit Card"],
    ["2026-01-03", "Transport", 12.50, "Uber", "Debit Card"]
  ]
}
```

### Fitness Tracker

```json
{
  "accessToken": "ya29...",
  "sheetConfig": {
    "sheetName": "Workouts",
    "headers": ["Date", "Exercise", "Duration (min)", "Calories Burned", "Heart Rate"]
  },
  "rowData": [
    ["2026-01-03", "Running", 30, 300, 145],
    ["2026-01-03", "Cycling", 45, 400, 135]
  ]
}
```

### Activity Logger

```json
{
  "accessToken": "ya29...",
  "sheetConfig": {
    "sheetName": "User Activity",
    "headers": ["Timestamp", "User ID", "Action", "IP Address", "Status"]
  },
  "rowData": [
    ["2026-01-03 14:30:00", "user_123", "Login", "192.168.1.1", "Success"],
    ["2026-01-03 14:31:15", "user_123", "View Dashboard", "192.168.1.1", "Success"]
  ]
}
```

---

## 🛠️ API Reference

### POST `/api/sync`

Syncs data to user's Google Sheet.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "accessToken": "string (required)",
  "sheetConfig": {
    "sheetName": "string (required)",
    "headers": ["string", "..."] (required)
  },
  "rowData": [
    ["value1", "value2", "..."],
    ["value1", "value2", "..."]
  ] (required)
}
```

**Validation Rules:**
- All rows in `rowData` must have same length as `headers`
- `sheetName` must be a valid spreadsheet name
- `headers` must be a non-empty array

**Success Response (200):**
```json
{
  "success": true,
  "message": "Data synced successfully",
  "rowsAdded": 2,
  "spreadsheetId": "abc123..."
}
```

**Error Responses:**

| Code | Error | Description |
|------|-------|-------------|
| 400 | `missing_fields` | Required fields missing |
| 400 | `invalid_schema` | Headers/rowData mismatch or invalid structure |
| 401 | `invalid_token` | Token invalid or expired |
| 429 | `rate_limit_exceeded` | Too many requests (100/hour) |
| 500 | `server_error` | Internal server error |

---

## 📱 Client Integration

### Platform-Specific OAuth Implementations

#### Option 1: Capacitor/Ionic (Mobile Apps)

```bash
npm install @codetrix-studio/capacitor-google-auth
```

```javascript
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

// Get access token
const result = await GoogleAuth.signIn();
const accessToken = result.authentication.accessToken;

// Sync data
await syncToSheets(accessToken, sheetConfig, rowData);
```

#### Option 2: Web (React/Vue/Angular)

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

```javascript
// Initialize Google Sign-In
google.accounts.id.initialize({
  client_id: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
  callback: handleCredentialResponse
});

function handleCredentialResponse(response) {
  const accessToken = response.credential;
  syncToSheets(accessToken, sheetConfig, rowData);
}
```
**Note:** Google One Tap returns an ID token, not an OAuth access token. To access the Sheets API, use Google Identity Services OAuth token flow (initTokenClient) instead.

#### Option 3: PWA (Progressive Web App)

```javascript
// Use Google Identity Services
const client = google.accounts.oauth2.initTokenClient({
  client_id: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
  scope: 'https://www.googleapis.com/auth/spreadsheets',
  callback: (tokenResponse) => {
    syncToSheets(tokenResponse.access_token, sheetConfig, rowData);
  }
});

client.requestAccessToken();
```

### Generic Sync Function

```javascript
async function syncToSheets(accessToken, sheetConfig, rowData) {
  const response = await fetch('https://your-app.vercel.app/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accessToken,
      sheetConfig,
      rowData
    })
  });
  
  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.message);
  }
  
  return result;
}
```

---

## 🧪 Testing

### Local Testing

```bash
npm run dev
```

Test endpoint: `http://localhost:3000/api/sync`

### Get a Test Access Token

**Option 1: OAuth 2.0 Playground** (Recommended)

1. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click ⚙️ (settings) → Check "Use your own OAuth credentials"
3. Enter your Client ID and Client Secret
4. Select scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`
5. Click "Authorize APIs"
6. Click "Exchange authorization code for tokens"
7. Copy the **Access token**

**Option 2: Mock Mode** (Development Only)

Set `MOCK_MODE=true` in `.env` to bypass token validation:

```bash
MOCK_MODE=true
```

> ⚠️ **Never use mock mode in production!**
**Note:** Mock mode is disabled by default and should only be enabled in local development environments.

### Test with cURL

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "YOUR_ACCESS_TOKEN_FROM_PLAYGROUND",
    "sheetConfig": {
      "sheetName": "Test Log",
      "headers": ["Date", "Category", "Value"]
    },
    "rowData": [
      ["2026-01-03", "Test", "123"]
    ]
  }'
```

---

## 🔒 Security Model

### OAuth Credentials Explained

| Credential | Public/Private | Where It Lives | Purpose | Risk if Exposed |
|------------|----------------|----------------|---------|-----------------|
| **Client ID** | ✅ Public | Client code, network requests, HTML | Identifies your app to Google | **Low** - Just identifies your app |
| **Client Secret** | 🔒 Private | Server environment variables ONLY | Proves your server is authorized | **CRITICAL** - Full account access |

### Why This Architecture is Secure

1. **Client Secret Never Leaves Server**
   - Stored in Vercel environment variables
   - Never sent to client
   - Never logged

2. **Token Validation**
   - Every request validates token with Google
   - Expired tokens rejected
   - Invalid tokens rejected

3. **No Data Retention**
   - Backend is a pass-through proxy
   - No database
   - No logging of user data

4. **Rate Limiting**
   - 100 requests/hour per user
   - Prevents abuse
   - Configurable via `RATE_LIMIT_PER_HOUR`

---

## ⚠️ Known Limitations

### Rate Limiting (Serverless)

The in-memory rate limiter is **"best effort"** in serverless environments. Vercel functions are stateless and may spin up multiple instances, so the rate limit is not strictly enforced.

**For strict enforcement:** Use Vercel KV or Redis.

```javascript
// Current implementation (best effort)
const rateLimitStore = new Map(); // In-memory, per-instance

// Production recommendation
import { kv } from '@vercel/kv';
const count = await kv.incr(`rate:${userId}`);
```

### Column Reordering

⚠️ **Do not manually reorder columns in Google Sheets.** The backend will detect a mismatch and overwrite headers back to the original order defined in `sheetConfig.headers`.

**If you need to change column order:** Update the `sheetConfig.headers` in your client code instead.

### Maximum Columns

Supports unlimited columns (A-Z, AA-ZZ, AAA-ZZZ, etc.) thanks to the [getColumnLetter()] helper function in the backend code.

---

## 📈 Performance

### Benchmarks

- **Cold start:** ~500ms (Vercel serverless)
- **Warm request:** ~200ms
- **Token validation:** ~100ms
- **Sheets API write:** ~300ms

**Note:** Benchmarks are indicative and may vary based on region, Google API latency, and cold starts.

### Scalability

- **Auto-scaling:** Handles traffic spikes
- **Rate limiting:** 100 req/hour/user (configurable)
- **Serverless:** No server management
- **Cost:** Free tier covers most use cases

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

### Adding Domain Adapters

Create adapters for common use cases:

```
adapters/
├── nutrition-adapter.js
├── expense-adapter.js
├── fitness-adapter.js
└── activity-logger-adapter.js
```

---

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with [Vercel](https://vercel.com) serverless functions
- Uses [Google Sheets API](https://developers.google.com/sheets/api)
- OAuth 2.0 via [Google OAuth](https://developers.google.com/identity/protocols/oauth2)

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/google-sheets-sync/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/google-sheets-sync/discussions)

---

## 🗺️ Roadmap

- [x] Generic data schema
- [x] Domain-agnostic API
- [x] Unlimited column support (A-ZZZ)
- [x] Mock mode for testing
- [ ] TypeScript support
- [ ] Redis/Vercel KV rate limiting
- [ ] Batch sync API
- [ ] Webhook notifications
- [ ] Multiple spreadsheet support
- [ ] Domain adapter library

---

## 📚 Additional Resources

- [OAuth Setup Guide](docs/oauth-setup.md)
- [Client Integration Examples](docs/client-integration.md)
- [Domain Adapters](docs/adapters.md)
- [Security Best Practices](docs/security.md)
- [Troubleshooting Guide](docs/troubleshooting.md)
- [Bug Fixes Report](docs/bug-fixes.md)

---

**⭐ If you find this useful, please star the repository!**

---

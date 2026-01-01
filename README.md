# 📊 Google Sheets Sync - Secure Backend Proxy Pattern

> A privacy-first, reusable backend proxy pattern for syncing application data to Google Sheets using OAuth 2.0.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)](https://vercel.com)

---

## 🎯 Overview

**Google Sheets Sync** is a secure, privacy-preserving synchronization system that enables mobile and web applications to sync user data to Google Sheets without exposing OAuth secrets in client code. Built on the **Backend Proxy Pattern**, it ensures enterprise-grade security while maintaining a seamless user experience.

### Key Features

✅ **Zero Secrets in Client Code** - OAuth credentials stored server-side only  
✅ **Privacy-First** - Pass-through architecture, no data retention  
✅ **OAuth 2.0 Compliant** - Industry-standard authentication  
✅ **Rate Limited** - Prevents abuse (100 req/hour/user)  
✅ **Serverless** - Auto-scaling, pay-per-request  
✅ **User Ownership** - Data lives in user's Google Drive  
✅ **One-Tap Setup** - No manual configuration for end users  

---
## Why this exists

Many small teams and individual builders want the simplicity of Google Sheets without leaking credentials, storing personal data, or standing up a full backend.
This project documents a clean, reusable pattern for doing exactly that.
---

## 🏗️ Architecture

```
┌─────────────────┐
│   Mobile App    │
│   (Android/iOS) │
└────────┬────────┘
         │ 1. User signs in with Google
         │ 2. Gets OAuth access token
         ▼
┌─────────────────┐
│  SyncService.js │ (Client-side)
└────────┬────────┘
         │ 3. POST { accessToken, data }
         │    via HTTPS
         ▼
┌─────────────────┐
│ Vercel Function │ (Backend Proxy)
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

### Security Flow

1. **Client** obtains OAuth token via Google Sign-In
2. **Client** sends token + data to backend (HTTPS)
3. **Backend** validates token with Google's `tokeninfo` endpoint
4. **Backend** uses validated token to write to user's Sheet
5. **Backend** returns success/failure (no data stored)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Vercel account (free tier)
- Google Cloud project with Sheets API enabled
- OAuth 2.0 credentials (Web + Android/iOS)

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

After deployment, you'll receive a URL like:
```
https://your-app.vercel.app/api/sync
```

---

## 📱 Client Integration

### Install Dependencies

```bash
npm install @codetrix-studio/capacitor-google-auth
```

### Client-Side Code

```javascript
import SyncService from './SyncService.js';

// Enable sync
SyncService.setSyncEnabled(true);

// Sync a meal/data event
const result = await SyncService.syncMeal({
  timestamp: new Date().toISOString(),
  parsedData: {
    items: [
      {
        name: "Apple",
        quantity: "1 medium",
        nutrients: {
          calories: 52,
          protein: 0.3,
          carbs: 14,
          fat: 0.2
        }
      }
    ]
  }
});

if (result.success) {
  console.log('Synced to Google Sheets!');
}
```

### Android Configuration

In [android/app/src/main/res/values/strings.xml](file:///C:/Users/balaj/Desktop/Personal/Ideas/Nutrition%20App/Antigravity/android/app/src/main/res/values/strings.xml):

```xml
<string name="server_client_id">YOUR_WEB_CLIENT_ID.apps.googleusercontent.com</string>
```

---

## 🔒 Security Features

### Token Validation

Every request validates the OAuth token with Google:

```javascript
const tokenInfo = await fetch(
  `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`
);
```

### Rate Limiting

Built-in rate limiting prevents abuse:

- **100 requests/hour** per user
- Configurable via environment variables
- In-memory store (upgradeable to Redis)

### CORS Protection

Configurable allowed origins:

```javascript
res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN);
```

### No Data Retention

The backend is a **pass-through proxy**:
- ❌ No database
- ❌ No logging of user data
- ❌ No analytics tracking
- ✅ Immediate write to user's Sheet

---

## 📊 Data Schema

### Request Format

```json
{
  "accessToken": "ya29.a0AfH6...",
  "nutritionData": {
    "date": "01/01/2026",
    "time": "1:11 PM",
    "items": [
      {
        "name": "Chicken Breast",
        "quantity": "150g",
        "calories": 165,
        "protein": 31,
        "carbs": 0,
        "fat": 3.6,
        "notes": "Grilled"
      }
    ],
    "userId": "user_abc123xyz"
  }
}
```

### Google Sheet Structure

| Date | Time | Food | Quantity | Calories | Protein (g) | Carbs (g) | Fat (g) | Notes | User ID |
|------|------|------|----------|----------|-------------|-----------|---------|-------|---------|
| 01/01/2026 | 1:11 PM | Chicken Breast | 150g | 165 | 31 | 0 | 3.6 | Grilled | user_abc123 |

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
  "nutritionData": {
    "date": "string (required)",
    "time": "string (optional)",
    "items": [
      {
        "name": "string (required)",
        "quantity": "string (optional)",
        "calories": "number (required)",
        "protein": "number (optional)",
        "carbs": "number (optional)",
        "fat": "number (optional)",
        "notes": "string (optional)"
      }
    ],
    "userId": "string (optional)"
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Data synced successfully",
  "rowsAdded": 1
}
```

**Error Responses:**

| Code | Error | Description |
|------|-------|-------------|
| 400 | `missing_fields` | Required fields missing |
| 401 | `invalid_token` | Token invalid or expired |
| 429 | `rate_limit_exceeded` | Too many requests |
| 500 | `server_error` | Internal server error |

---

## 🧪 Testing

### Local Testing

```bash
npm run dev
```

Test endpoint: `http://localhost:3000/api/sync`

### Test with cURL

```bash
curl -X POST http://localhost:3000/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "YOUR_TEST_TOKEN",
    "nutritionData": {
      "date": "01/01/2026",
      "time": "1:11 PM",
      "items": [{
        "name": "Test Food",
        "quantity": "100g",
        "calories": 100,
        "protein": 10,
        "carbs": 10,
        "fat": 5
      }],
      "userId": "test_user"
    }
  }'
```

---

## 📈 Performance

### Benchmarks

- **Cold start:** ~500ms (Vercel serverless)
- **Warm request:** ~200ms
- **Token validation:** ~100ms
- **Sheets API write:** ~300ms

### Scalability

- **Auto-scaling:** Handles traffic spikes automatically
- **Rate limiting:** Prevents abuse
- **Serverless:** No server management
- **Cost:** Free tier covers most use cases

---

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GOOGLE_CLIENT_ID` | OAuth Web Client ID | Yes | - |
| `GOOGLE_CLIENT_SECRET` | OAuth Client Secret | Yes | - |
| `ALLOWED_ORIGIN` | CORS allowed origin | No | `*` |
| `RATE_LIMIT_PER_HOUR` | Requests per hour | No | `100` |

### Customization

**Change rate limit:**
```javascript
const RATE_LIMIT = process.env.RATE_LIMIT_PER_HOUR || 100;
```

**Change sheet name:**
```javascript
const SHEET_NAME = process.env.SHEET_NAME || 'Antigravity Nutrition Log';
```

**Add custom columns:**
```javascript
// In findOrCreateSpreadsheet()
values: [
  { userEnteredValue: { stringValue: 'Date' } },
  { userEnteredValue: { stringValue: 'Custom Field' } },
  // ...
]
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
git clone https://github.com/yourusername/google-sheets-sync.git
cd google-sheets-sync
npm install
npm run dev
```

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with [Vercel](https://vercel.com) serverless functions
- Uses [Google Sheets API](https://developers.google.com/sheets/api)
- OAuth 2.0 implementation via [Google OAuth](https://developers.google.com/identity/protocols/oauth2)
- Inspired by privacy-first design principles

---

## 📞 Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/google-sheets-sync/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/google-sheets-sync/discussions)

---

## 🗺️ Roadmap

- [ ] Add Redis support for rate limiting
- [ ] Support for multiple spreadsheets
- [ ] Batch sync API
- [ ] Webhook notifications
- [ ] TypeScript support
- [ ] Docker deployment option
- [ ] Offline queue with retry logic

---

## 📊 Stats

![GitHub stars](https://img.shields.io/github/stars/yourusername/google-sheets-sync?style=social)
![GitHub forks](https://img.shields.io/github/forks/yourusername/google-sheets-sync?style=social)
![GitHub issues](https://img.shields.io/github/issues/yourusername/google-sheets-sync)
![GitHub pull requests](https://img.shields.io/github/issues-pr/yourusername/google-sheets-sync)

---

**Built to encourage simple, privacy-conscious data integrations.**

---

## 📚 Additional Resources

- [OAuth Setup Guide](docs/oauth-setup.md)
- [Deployment Checklist](docs/deployment.md)
- [Troubleshooting Guide](docs/troubleshooting.md)
- [API Documentation](docs/api.md)
- [Security Best Practices](docs/security.md)

---

**⭐ If you find this useful, please star the repository!**

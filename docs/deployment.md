# 🚀 Deployment Guide - Google Sheets Sync

**Quick Start:** Get your backend proxy running in 15 minutes.

---

## Prerequisites

- [x] Node.js 18+ installed
- [x] Google account
- [x] Vercel account (free tier)
- [x] Git installed

---

## Step 1: Clone & Install (2 minutes)

```bash
git clone https://github.com/balajiasapu/google_sheets_sync.git
cd google_sheets_sync
npm install
```

---

## Step 2: Google Cloud Setup (5 minutes)

### 2.1 Create Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Name: `Google Sheets Sync`
4. Click **Create**

### 2.2 Enable APIs

1. Go to **APIs & Services** → **Library**
2. Search and enable:
   - ✅ **Google Sheets API**
   - ✅ **Google Drive API**

### 2.3 Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Configure consent screen (first time):
   - User Type: **External**
   - App name: `Google Sheets Sync`
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `spreadsheets` and `drive.file`
   - Save and continue

4. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: `Sheets Sync Backend`
   - Authorized redirect URIs: (leave empty for playground testing)
   - Click **Create**
**Note:** production apps must define redirect URIs

5. **Copy and save:**
   - ✅ Client ID (looks like: `123456.apps.googleusercontent.com`)
   - ✅ Client Secret (looks like: `GOCSPX-abc123...`)

---

## Step 3: Deploy to Vercel (3 minutes)

### 3.1 Install Vercel CLI

```bash
npm install -g vercel
```

### 3.2 Login

```bash
vercel login
```

### 3.3 Deploy

```bash
vercel --prod
```

**Copy your deployment URL:** `https://your-app.vercel.app`

---

## Step 4: Configure Secrets (2 minutes)

Set environment variables in Vercel:

```bash
vercel secrets add GOOGLE_CLIENT_ID "YOUR_CLIENT_ID.apps.googleusercontent.com"
vercel secrets add GOOGLE_CLIENT_SECRET "YOUR_CLIENT_SECRET"
vercel secrets add ALLOWED_ORIGIN "*"
```

**Or via Vercel Dashboard:**
1. Go to your project → **Settings** → **Environment Variables**
2. Add:
   - `GOOGLE_CLIENT_ID` = Your Client ID
   - `GOOGLE_CLIENT_SECRET` = Your Client Secret
   - `ALLOWED_ORIGIN` = `*` (or your domain)

**Note:** Vercel secrets are injected as environment variables at runtime.
---

## Step 5: Test (3 minutes)

### 5.1 Get Test Token

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click ⚙️ → Check "Use your own OAuth credentials"
3. Enter your Client ID and Client Secret
4. Select scopes:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive.file`
5. Click **Authorize APIs** → **Exchange authorization code for tokens**
6. Copy the **Access token**

### 5.2 Test Request

```bash
curl -X POST https://your-app.vercel.app/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "YOUR_ACCESS_TOKEN",
    "sheetConfig": {
      "sheetName": "Test Log",
      "headers": ["Date", "Action", "Status"]
    },
    "rowData": [
      ["2026-01-03", "Test Deployment", "Success"]
    ]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Data synced successfully",
  "rowsAdded": 1,
  "spreadsheetId": "abc123..."
}
```

### 5.3 Verify in Google Drive

1. Go to [Google Drive](https://drive.google.com/)
2. Look for **"Test Log"** spreadsheet
3. Verify data appears correctly

---

## ✅ Deployment Complete!

Your backend is now live at: `https://your-app.vercel.app/api/sync`

---

## Next Steps

### For Mobile Apps (Capacitor/Ionic)

```bash
npm install @codetrix-studio/capacitor-google-auth
```

Add to [android/app/src/main/res/values/strings.xml]:
```xml
<string name="server_client_id">YOUR_WEB_CLIENT_ID.apps.googleusercontent.com</string>
```

### For Web Apps

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

---

## 🔧 Configuration Options

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | - | OAuth Web Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | - | OAuth Client Secret |
| `ALLOWED_ORIGIN` | No | `*` | CORS allowed origin |
| `RATE_LIMIT_PER_HOUR` | No | `100` | Requests per hour per user |
| `MOCK_MODE` | No | `false` | Skip token validation (dev only) |

**Note:**  RATE_LIMIT_PER_HOUR and MOCK_MODE enforced in the backend logic (api/sync.js). If you remove or modify this logic, update these settings accordingly.

### Update Environment Variables

```bash
vercel env add RATE_LIMIT_PER_HOUR
# Enter value: 200
```

Or via dashboard: **Settings** → **Environment Variables** → **Add**

---

## 🐛 Troubleshooting

### "Invalid token" error

**Cause:** Token expired or invalid Client ID  
**Fix:** Generate new token from OAuth Playground

### "Rate limit exceeded"

**Cause:** User exceeded 100 requests/hour  
**Fix:** Wait or increase `RATE_LIMIT_PER_HOUR`

### "Missing fields" error

**Cause:** Invalid request body  
**Fix:** Ensure `accessToken`, `sheetConfig`, and `rowData` are all present

### CORS error

**Cause:** Request from unauthorized origin  
**Fix:** Update `ALLOWED_ORIGIN` to your domain

---

## 📊 Monitoring

### View Logs

```bash
vercel logs
```

Or via dashboard: **Deployments** → Select deployment → **Logs**

### Check Function Performance

Dashboard → **Analytics** → **Functions**

---

## 🔄 Updates

### Deploy New Version

```bash
git pull
vercel --prod
```

### Rollback

Dashboard → **Deployments** → Select previous version → **Promote to Production**

---

## 🔒 Security Checklist

- [x] Client Secret stored in Vercel environment (NOT in code)
- [x] HTTPS enforced (automatic with Vercel)
- [x] Token validation enabled (`MOCK_MODE=false`)
- [x] Rate limiting active
- [x] CORS configured appropriately

---

## 💰 Cost

**Vercel Free Tier:**
- ✅ 100GB bandwidth/month
- ✅ 100 serverless function invocations/day --Vercel Free Tier is sufficient for low-volume personal projects, prototypes, and small apps. Refer to Vercel pricing for current limits.
- ✅ Unlimited deployments

**Google Cloud:**
- ✅ Sheets API: Free (60 requests/minute)
- ✅ Drive API: Free (1000 requests/100 seconds)

**Total Cost:** $0 for most use cases 🎉

---

## 📚 Additional Resources

- [Main README](README.md)
- [Security Guide](security.md)
- [OAuth Setup Guide](oauth-setup.md)
- [API Reference](README.md#api-reference)

---

**🎉 Congratulations! Your backend is production-ready.**

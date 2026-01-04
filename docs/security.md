# 🔒 Security Guide - Google Sheets Sync

**Security-first architecture for protecting user data and credentials.**

---

## 🎯 Security Model Overview

Google Sheets Sync uses the **Backend Proxy Pattern** to ensure OAuth secrets never touch client code.

```
┌──────────────┐
│ Client Code  │ ← Client ID (PUBLIC) ✅
│ (Browser/App)│ ← Access Token (temporary, user-specific)
└──────┬───────┘
       │ HTTPS only
       ▼
┌──────────────┐
│   Backend    │ ← Client Secret (PRIVATE) 🔒
│  (Vercel)    │ ← Validates every token
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Google APIs  │
└──────────────┘
```

---

## 🔑 OAuth 2.0 Credentials

### Client ID vs Client Secret

| Credential | Visibility | Storage | Purpose | Risk Level |
|------------|-----------|---------|---------|------------|
| **Client ID** | ✅ Public | Client code, HTML, network requests | Identifies your app to Google | **Low** - Just an identifier |
| **Client Secret** | 🔒 Private | Server environment variables ONLY | Proves server is authorized | **CRITICAL** - Full account access |

### ⚠️ Critical Rules

1. **NEVER** commit Client Secret to Git
2. **NEVER** send Client Secret to client
3. **NEVER** log Client Secret
4. **ALWAYS** use environment variables

---

## 🛡️ Threat Model & Mitigations

### Threat 1: Client Secret Exposure

**Risk:** Attacker gains full access to Google APIs on behalf of your app.

**Mitigations:**
- ✅ Store in Vercel environment variables
- ✅ Never in code, config files, or Git
- ✅ Rotate immediately if exposed
- ✅ Use `.env` files locally (add to [.gitignore](file:///C:/Users/balaj/Desktop/Personal/Ideas/Nutrition%20App/Antigravity/.gitignore))

### Threat 2: Access Token Theft

**Risk:** Attacker uses stolen token to access user's Google Sheets.

**Mitigations:**
- ✅ Tokens validated on every request
- ✅ Tokens expire after 1 hour
- ✅ HTTPS enforced (Vercel automatic)
- ✅ No token storage on backend

### Threat 3: Unauthorized Data Access

**Risk:** Attacker syncs malicious data to user's sheets.

**Mitigations:**
- ✅ Token validation ensures only authenticated users
- ✅ Rate limiting (100 req/hour/user)
- ✅ User controls their own Google Sheet
- ✅ No cross-user data access

### Threat 4: Man-in-the-Middle (MITM)

**Risk:** Attacker intercepts OAuth tokens in transit.

**Mitigations:**
- ✅ HTTPS enforced everywhere
- ✅ Vercel provides automatic TLS certificates
- ✅ No HTTP fallback

### Threat 5: Rate Limit Bypass

**Risk:** Attacker floods backend with requests.

**Mitigations:**
- ✅ Stateful rate limiting per user (100/hour)
- ✅ Vercel KV (Redis) store for cross-instance enforcement
- ✅ Vercel DDoS protection
- ✅ Configurable limits via `RATE_LIMIT_PER_HOUR`
- **Detailed Rate Limiting:**
    - 100 requests/hour per user (by Google user ID)
    - **Stateful enforcement** via Vercel KV (Redis) for cross-instance consistency
    - Prevents abuse across serverless instances

---

## 🔐 Token Validation Flow (RFC 9700 Compliant)

Every request follows this **enhanced** validation:

```javascript
// 1. Extract token from request
const { accessToken } = req.body;

// 2. Validate with Google (POST method, not URL param)
const tokenResponse = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `access_token=${encodeURIComponent(accessToken)}`
});

const tokenInfo = await tokenResponse.json();

// 3. Verify token is for our app (audience)
if (tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
  return 401; // Unauthorized
}

// 4. Check expiration
const now = Math.floor(Date.now() / 1000);
if (tokenInfo.exp < now) {
  return 401; // Expired
}

// 5. ✅ NEW: Strict scope validation
const validScopes = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
];
const hasValidScope = tokenInfo.scope?.split(' ').some(scope => 
  validScopes.includes(scope)
);
if (!hasValidScope) {
  return 403; // Forbidden - missing required scope
}

// 6. ✅ NEW: Sender constraint (RFC 9700)
if (tokenInfo.azp !== process.env.GOOGLE_CLIENT_ID) {
  return 401; // Authorized party mismatch
}

// 7. ✅ NEW: PKCE validation (warn if missing)
if (!tokenInfo.code_challenge) {
  console.warn('⚠️ Token issued without PKCE');
}

// 8. Proceed with request
```

**Why this matters:**
- **POST method** prevents token leakage in server logs
- **Scope validation** ensures token only has Sheets access (not Gmail, Calendar, etc.)
- **Sender constraint** prevents token reuse across different apps
- **PKCE check** warns about missing authorization code protection

---

## 🔑 PKCE Implementation (RFC 9700 Requirement)

### What is PKCE?

**Proof Key for Code Exchange** protects against authorization code interception attacks.

### How It Works

```
1. Client generates code_verifier (43-128 char random string)
   Example: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"

2. Client creates code_challenge (SHA-256 hash)
   code_challenge = BASE64URL(SHA256(code_verifier))

3. Authorization request includes code_challenge
   https://accounts.google.com/o/oauth2/v2/auth?
     client_id=...&
     code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
     code_challenge_method=S256

4. Token exchange includes code_verifier
   Server validates: SHA256(code_verifier) == code_challenge
```

### Client Implementation

```javascript
// Generate PKCE parameters
function generatePKCE() {
  const verifier = generateRandomString(128);
  const challenge = base64URLEncode(sha256(verifier));
  return { verifier, challenge };
}

// Use in OAuth flow
const { verifier, challenge } = generatePKCE();

// Store verifier for later
localStorage.setItem('pkce_verifier', verifier);

// Include challenge in auth request
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=${REDIRECT_URI}&` +
  `response_type=code&` +
  `scope=https://www.googleapis.com/auth/spreadsheets&` +
  `code_challenge=${challenge}&` +
  `code_challenge_method=S256`;
```

**Why PKCE is Critical:**
- Prevents malicious apps from intercepting authorization codes
- Required for public clients (mobile apps, SPAs)
- Recommended for all OAuth flows as of RFC 9700

---

## 📋 OAuth Scope Clarification

### ⚠️ Important Scope Limitation

**Current Scope:** `https://www.googleapis.com/auth/spreadsheets`

**What This Actually Grants:**
- ✅ View all Google Sheets
- ✅ Edit all Google Sheets
- ✅ Create new Google Sheets
- ✅ Delete Google Sheets

**What We Claim (INCORRECT):**
- ❌ "App can ONLY access sheets it creates" - **FALSE**
- ❌ "App CANNOT access existing sheets" - **FALSE**

### The Truth

Google Sheets API does **NOT** provide a scope for "only sheets created by this app."

**More Restrictive Alternative:**
```
https://www.googleapis.com/auth/drive.file
```

**What This Grants:**
- ✅ View/edit files created by this app
- ✅ Files explicitly opened by user via file picker
- ❌ Cannot access other existing files

**Recommendation:** Use `drive.file` scope for better privacy.

### Updated Scope Request

```javascript
// ✅ BETTER: More restrictive scope
scope: 'https://www.googleapis.com/auth/drive.file'

// ❌ CURRENT: Broad access to all sheets
scope: 'https://www.googleapis.com/auth/spreadsheets'
```

**Trade-off:**
- `drive.file` = Better privacy, but requires file picker for existing sheets
- `spreadsheets` = Easier UX, but broader access

**User Disclosure:**
Update OAuth consent screen to clearly state:
> "This app can view, edit, create, and delete ALL your Google Sheets"

---

## 🔄 Refresh Token Handling

### The Problem

Access tokens expire after **1 hour**. Current implementation doesn't handle this.

**User Experience:**
```
Hour 0: User logs in → Gets access token → Syncs data ✅
Hour 1: Token expires → Sync fails ❌
User: "Why did sync stop working?"
```

### The Solution

Use **refresh tokens** to get new access tokens automatically.

### Implementation

#### 1. Request Offline Access

```javascript
// Client-side OAuth request
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=${REDIRECT_URI}&` +
  `response_type=code&` +
  `scope=https://www.googleapis.com/auth/drive.file&` +
  `access_type=offline&` +  // ← Request refresh token
  `prompt=consent`;         // ← Force consent to get refresh token
```

#### 2. Store Refresh Token Securely

```javascript
// After OAuth callback
const tokens = await exchangeCodeForTokens(authCode);

// Store securely (encrypted, user-specific)
await secureStorage.set('refresh_token', tokens.refresh_token);
await secureStorage.set('access_token', tokens.access_token);
await secureStorage.set('expires_at', Date.now() + (tokens.expires_in * 1000));
```

#### 3. Auto-Refresh Before Expiration

```javascript
async function getValidAccessToken() {
  const expiresAt = await secureStorage.get('expires_at');
  const now = Date.now();

  // If token expires in < 5 minutes, refresh it
  if (expiresAt - now < 5 * 60 * 1000) {
    const refreshToken = await secureStorage.get('refresh_token');
    const newTokens = await refreshAccessToken(refreshToken);
    
    await secureStorage.set('access_token', newTokens.access_token);
    await secureStorage.set('expires_at', Date.now() + (newTokens.expires_in * 1000));
    
    return newTokens.access_token;
  }

  return await secureStorage.get('access_token');
}

async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,  // Server-side only!
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  return await response.json();
}
```

#### 4. Handle Refresh Token Expiration

Refresh tokens can also expire (typically after 6 months of inactivity).

```javascript
async function syncData(data) {
  try {
    const accessToken = await getValidAccessToken();
    return await sendToBackend(accessToken, data);
  } catch (error) {
    if (error.message === 'invalid_grant') {
      // Refresh token expired - user must re-authenticate
      await promptUserToReLogin();
    }
    throw error;
  }
}
```

### Security Considerations

**Refresh Token Storage:**
- ✅ Encrypt at rest
- ✅ User-specific (not shared)
- ✅ Revocable by user
- ❌ Never log or transmit unnecessarily

**Rotation:**
- Google may issue new refresh token on each use
- Always update stored refresh token if new one provided

---

## 🚫 What We DON'T Do (Privacy)

### No Data Retention

```javascript
// ❌ We DON'T do this
database.save(nutritionData);
analytics.track(nutritionData);
logger.info(nutritionData);

// ✅ We DO this
sheets.append(nutritionData); // Direct to user's sheet
return { success: true };      // No data stored
```

### No User Tracking

- ❌ No analytics on user data
- ❌ No logging of nutrition/expense/fitness data
- ❌ No cross-user correlation
- ✅ Only rate limiting by user ID (for abuse prevention)

### No Third-Party Services

- ❌ No external analytics (Google Analytics, Mixpanel, etc.)
- ❌ No error tracking with user data (Sentry, etc.)
- ✅ Only Google APIs (Sheets, Drive, OAuth)

---

## 🔒 Best Practices

### For Developers

#### 1. Environment Variables

```bash
# ✅ GOOD - Use environment variables
GOOGLE_CLIENT_SECRET=abc123

# ❌ BAD - Hardcoded in code
const CLIENT_SECRET = "abc123";
```

#### 2. Git Hygiene

```bash
# .gitignore
.env
.env.local
*.secret
credentials.json
```

#### 3. Secret Rotation

If Client Secret is compromised:

1. Generate new credentials in Google Cloud Console
2. Update Vercel environment variables
3. Redeploy: `vercel --prod`
4. Delete old credentials

#### 4. CORS Configuration

```bash
# Development
ALLOWED_ORIGIN=http://localhost:3000

# Production
ALLOWED_ORIGIN=https://yourdomain.com

# Multiple origins (not recommended)
ALLOWED_ORIGIN=*  # Only for public APIs
```

### For Users

#### 1. Review OAuth Scopes

When signing in, users see:
- ✅ "View and manage spreadsheets in Google Drive"

**What this actually means:**
- App CAN view, edit, create, and delete ALL your Google Sheets
- NOT limited to sheets created by this app
- NOT limited to recently used sheets

**Why it's broad:**
Google Sheets API doesn't provide a "read-only for app-created sheets" scope.
We recommend using `drive.file` scope instead (better privacy).

**User can revoke anytime:**
1. Go to [Google Account Permissions](https://myaccount.google.com/permissions)
2. Find "Google Sheets Sync"
3. Click **Remove Access**


#### 3. Data Ownership

- ✅ Data lives in user's Google Drive
- ✅ User owns and controls the spreadsheet
- ✅ User can delete spreadsheet anytime
- ✅ No data stored on our servers

---

## 🧪 Security Testing

### Test 1: Token Validation

```bash
# Send invalid token
curl -X POST https://your-app.vercel.app/api/sync \
  -H "Content-Type: application/json" \
  -d '{"accessToken": "invalid", "sheetConfig": {...}, "rowData": [...]}'

# Expected: 401 Unauthorized
```

### Test 2: Rate Limiting

```bash
# Send 101 requests rapidly
for i in {1..101}; do
  curl -X POST https://your-app.vercel.app/api/sync \
    -H "Content-Type: application/json" \
    -d '{"accessToken": "...", ...}' &
done

# Expected: Some requests return 429 Rate Limit Exceeded
```

### Test 3: HTTPS Enforcement

```bash
# Try HTTP (should fail or redirect)
curl http://your-app.vercel.app/api/sync

# Expected: Redirect to HTTPS or connection refused
```

---

## 📋 Security Checklist

### Pre-Deployment

- [ ] Client Secret in environment variables (NOT code)
- [ ] `.env` added to [.gitignore](file:///C:/Users/balaj/Desktop/Personal/Ideas/Nutrition%20App/Antigravity/.gitignore)
- [ ] HTTPS enforced (Vercel automatic)
- [ ] CORS configured appropriately
- [ ] Rate limiting enabled
- [ ] Mock mode disabled (`MOCK_MODE=false`)

### Post-Deployment

- [ ] Test token validation
- [ ] Test rate limiting
- [ ] Verify HTTPS
- [ ] Check Vercel logs for errors
- [ ] Review OAuth consent screen
- [ ] Test token expiration handling

### Ongoing

- [ ] Monitor Vercel logs weekly
- [ ] Review OAuth permissions quarterly
- [ ] Rotate secrets if compromised
- [ ] Update dependencies monthly (`npm update`)

---

## 🚨 Incident Response

### If Client Secret is Exposed

1. **Immediately:**
   - Generate new OAuth credentials in Google Cloud
   - Update Vercel environment variables
   - Redeploy: `vercel --prod`

2. **Within 24 hours:**
   - Delete old credentials from Google Cloud
   - Review logs for unauthorized access
   - Notify users if data was compromised

3. **Post-incident:**
   - Document how exposure occurred
   - Update security practices
   - Consider additional monitoring

### If User Reports Unauthorized Access

1. **Verify:**
   - Check Vercel logs for suspicious activity
   - Verify user's OAuth token is valid

2. **Remediate:**
   - Revoke user's OAuth token (user can do via Google Account)
   - Check for rate limit bypass

3. **Prevent:**
   - Strengthen rate limiting if needed
   - Add additional validation

---

## 📊 Compliance

### GDPR (EU)

**Legal Basis for Processing:**
- **Consent:** User explicitly authorizes sync when signing in with OAuth
- **Legitimate Interest:** Minimal data processing necessary to provide the service

**Data Processing Documentation:**
- Users can request data processing activity log via email
- **Retention:** Data stored only in user's Google Drive (not our servers)
- **Deletion:** User can revoke access anytime, deleting our access rights

**GDPR Rights Supported:**
- ✅ **Right to access** - User's own data in their Google Sheets
- ✅ **Right to deletion** - User deletes spreadsheet or revokes OAuth
- ✅ **Right to data portability** - User exports from Google Sheets (CSV, Excel)
- ✅ **Right to withdraw consent** - Revoke OAuth access anytime
- ✅ **Right to rectification** - User edits data directly in their sheet
- ✅ **Right to restriction** - User can disable sync via toggle

**Data Controller:** User (data in their Google Drive)
**Data Processor:** This service (pass-through only)

**Compliance Measures:**
- ✅ No data retention (pass-through only)
- ✅ User owns data (in their Google Drive)
- ✅ Transparent processing (documented in security.md)
- ✅ Minimal data collection (only OAuth token for validation)

### CCPA (California)

- ✅ No sale of personal information
- ✅ No data collection beyond OAuth validation
- ✅ User controls data access
- ✅ Right to deletion (revoke OAuth)
- ✅ Right to know (documented in security.md)

### HIPAA (Healthcare) - NOT COMPLIANT

⚠️ **This service does NOT meet HIPAA requirements for protected health information (PHI).**

**If you use this service for PHI, you are violating HIPAA regulations.**


**Why Not HIPAA Compliant:**

❌ **No Business Associate Agreement (BAA)**  
   - Required for any service handling PHI  
   - Google Sheets does not offer BAA for standard accounts

❌ **No encryption at rest on backend**  
   - HIPAA requires encrypted storage  
   - Our pass-through model doesn't store data, but Google Sheets encryption is not HIPAA-certified

❌ **No audit logging for healthcare data**  
   - HIPAA requires detailed access logs  
   - We don't log user data (privacy-first), but this violates HIPAA audit requirements

❌ **No breach notification procedures for PHI**  
   - HIPAA requires 60-day breach notification  
   - We have no mechanism to detect PHI breaches

❌ **Uses Google Sheets (not a HIPAA-covered entity contract)**  
   - Standard Google Workspace doesn't sign BAAs  
   - Google Workspace Enterprise required for HIPAA

**If You Need HIPAA Compliance:**

Use these alternatives:
- **Hapi.js** with HIPAA features
- **AWS HealthLake** (HIPAA-eligible)
- **Azure Health Data Services**
- **FDA-regulated health tech platforms**

**For General Health Data (NOT PHI):**

This service is suitable for:
- ✅ Personal fitness tracking (non-clinical)
- ✅ Nutrition logging (personal use)
- ✅ Wellness apps (non-diagnostic)
- ❌ Clinical patient data
- ❌ Medical records
- ❌ Prescription information

---

## 🔗 Additional Resources

- [OAuth 2.0 Best Practices](https://datatracker.ietf.org/doc/html/rfc6749)
- [Google OAuth Security](https://developers.google.com/identity/protocols/oauth2/security-best-practices)
- [Vercel Security](https://vercel.com/docs/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

---

## 🔐 Security Contact

We take security seriously. If you discover a vulnerability:

**DO NOT** open public GitHub issues.

**Instead:**
- **Email:** basapu@umich.edu
- **Include:** Description, steps to reproduce, impact
- **Response:** Within 48 hours
- **Responsible Disclosure:** We'll credit you if you allow 30-day coordinated disclosure

Thank you for helping keep this project secure!


---

## 🤝 Trust & Transparency

### What We Promise

✅ **No data collection beyond what's necessary**
   - Only OAuth token for validation
   - No analytics on your data
   - No profiling or tracking

✅ **Your data stays yours**
   - Stored in your Google Drive (we never touch it)
   - You control access via your Google Account
   - You can delete the data anytime

✅ **Open source for accountability**
   - Code is public on GitHub
   - Anyone can audit it
   - No hidden trackers or back doors

✅ **Simple, focused scope**
   - Does one thing: sync to Google Sheets
   - No feature bloat
   - No unnecessary permissions

### What We Can't Protect

❌ **Google account compromise** - If attacker gets your Google password
❌ **Malicious Google extensions** - Browser extensions with Sheets access
❌ **Session hijacking** - If device is compromised
❌ **Google Sheets abuse** - If Google's systems are compromised

### Your Responsibility

- Keep your Google password secure
- Use 2FA on your Google account
- Review OAuth permissions quarterly
- Delete data you no longer need

---

**Security is a shared responsibility. Stay vigilant! 🛡️**

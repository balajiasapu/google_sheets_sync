# 🔑 Google OAuth 2.0 Setup Guide

This guide walks you through creating and configuring the Google Cloud credentials required for the sync backend.

---

## Prerequisites

- Google account
- Access to Google Cloud Console
- Vercel project (if deploying to production)

---

## 1. Create a Google Cloud Project

1.  Open the [Google Cloud Console](https://console.cloud.google.com/).
2.  Click the project selector at the top and select **New Project**.
3.  Enter a name (e.g., `My Sync App`) and click **Create**.

## 2. Enable Required APIs

1.  In the sidebar, go to **APIs & Services** > **Library**.
2.  Search for and enable the following:
    -   ✅ **Google Sheets API**
    -   ✅ **Google Drive API**

## 3. Configure OAuth Consent Screen

If this is your first time, you must configure the screen users see when authorizing your app.

1.  Go to **APIs & Services** > **OAuth consent screen**.
2.  Select **User Type** (External is standard for public apps).
3.  Fill in the required App Information:
    -   **App name**: (e.g., `Data Sync Pro`)
    -   **User support email**: Your email.
    -   **Developer contact info**: Your email.
4.  **Scopes**: Click **Add or Remove Scopes** and add:
    
⭐ **Recommended (Better Privacy):**
    -   `https://www.googleapis.com/auth/drive.file`
       (Access only to files created by your app)

Alternative (Broader Access):
    -   `https://www.googleapis.com/auth/spreadsheets`
       (Access to ALL user's Google Sheets)

**Security Note:** We recommend `drive.file` for better user privacy.
See [Security Guide](../security.md#oauth-scope-clarification) for detailed comparison.

5.  Click **Save and Continue**.

## 3.1 Add Test Users (External OAuth)

If your OAuth consent screen is **External**, you must add test users 
before other users can authenticate.

1. In **OAuth consent screen**, scroll to **Test users**
2. Click **Add users**
3. Enter email addresses of accounts that will test the app
4. Click **Add**

Once you move to **Production** status, this step isn't required.

**For Development:** Add your own email as a test user.


## 4. Create OAuth 2.0 Credentials

### Web Application (For Backend & Web Clients)

1.  Go to **APIs & Services** > **Credentials**.
2.  Click **Create Credentials** > **OAuth client ID**.
3.  Select **Application type**: `Web application`.
4.  **Authorized JavaScript origins**: 
These are the domains from which your client-side code will request OAuth tokens.
Add:
- Development: `http://localhost:3000`
- Production: `https://<your-vercel-project>.vercel.app`
**Note:** These must match your actual deployed domain.
5.  **Authorized redirect URIs**: Add your app's callback URL (e.g., `https://yourapp.com/auth-callback`).
6.  Click **Create**.
7.  **IMPORTANT**: Copy the **Client ID** and **Client Secret**.
    -   Save the `Client Secret` as `GOOGLE_CLIENT_SECRET` in your Vercel/Environment variables.

## 4.1 Store Credentials Safely

⚠️ **CRITICAL: Never commit these to Git!**

### For Local Development

1. Create a `.env.local` file in your project root:
   ```bash
   GOOGLE_CLIENT_ID=your-client-id-here
   GOOGLE_CLIENT_SECRET=your-client-secret-here
2. Add .env.local to .gitignore: 
	```bash
	echo ".env.local" >> .gitignore

**For Production (Vercel)**
1. Go to your Vercel project settings
2. Navigate to Settings > Environment Variables
3. Add the following environment variables:
   - **Key:** `GOOGLE_CLIENT_ID` **→ Value:** Your Client ID
   - **Key:** `GOOGLE_CLIENT_SECRET` **→ Value:** Your Client Secret
4. Click Save

✅ Verify: Run vercel env pull to sync variables locally for testing

See .env.example for all required variables.

##  5. Enable PKCE (RFC 9700)

⭐ **For Web Applications (Recommended):**

PKCE is automatically handled by Google's OAuth libraries and Vercel. 
No additional configuration needed — just ensure your client-side code implements it.

**For Mobile Apps (if applicable):**

1. In Credentials, select your OAuth Client ID
2. Scroll down to **Application restrictions**
3. Select **Android**, **iOS**, or **Mac** as appropriate
4. PKCE will be automatically enforced

See [Security Guide - PKCE Implementation](../security.md#pkce-implementation-rfc-9700-requirement) 
for client-side code examples.

## 6. Configure Your Application

### Redirect URI Setup
**Authorized redirect URIs**: 

For Vercel deployment, use:
- Development: `http://localhost:3000/auth-callback`
- Production: `https://<your-vercel-project>.vercel.app/auth-callback`

⚠️ **Important:**
- Replace `<your-vercel-project>` with your actual Vercel project name
- Ensure your client-side app has a `/auth-callback` route that:
  1. Captures the authorization code from URL params
  2. Exchanges code for tokens via your backend
  3. Stores tokens securely
  
**Note:** The `/api/sync` endpoint is where tokens are validated, 
not where the OAuth callback is handled.

### Token Exchange

Your client app must:
1. Redirect user to Google OAuth endpoint (with PKCE)
2. Capture authorization code from callback
3. Exchange code for tokens via your backend
4. Send access token to `/api/sync` endpoint for data sync

See [Security Guide](../security.md) for implementation details.

## 7. Verify Your Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → Your Project
2. **APIs & Services** → **Credentials**
3. Click your OAuth 2.0 Client ID
4. Verify:
   - ✅ Client ID is set
   - ✅ Client Secret is saved (not shown, only generated once)
   - ✅ Authorized redirect URIs include your callback URL
   - ✅ Authorized JavaScript origins include your domain

---

## 💡 Troubleshooting Tips

-   **"Project not found"**: Ensure you have selected the correct project in the top dropdown.
-   **"API not enabled"**: Confirm both Sheets and Drive APIs show as "Enabled" in the Library.
-   **Scopes Grayed Out**: You may need to wait a few minutes after enabling the APIs.

**OAuth-Specific Issues:**

-   **"Redirect URI mismatch"**: The redirect URI in your browser doesn't match 
    the one registered in Google Cloud Console. Double-check spelling and protocol (http vs https).

-   **"Invalid client ID"**: Ensure you're using the correct Client ID from Google Cloud Console, 
    not the Client Secret.

-   **"Test users only"**: If you get "Error 403: access_denied", you may not be logged in as 
    a test user. Add your email to test users in OAuth consent screen.

-   **"Token invalid after 1 hour"**: Access tokens expire. Ensure your client app 
    is sending the `refreshToken` to `/api/sync` endpoint for automatic refresh.

-   **"Rate limit exceeded"**: Default limit is 100 requests/hour per user. 
    See [API Reference](../api.md) for details.


## 🚀 What's Next?

Now that you have your OAuth credentials:

1. **Configure your backend:**
   - Add credentials to `.env.local` or Vercel environment variables
   - See [Deployment Guide](../DEPLOYMENT.md)

2. **Build your client app:**
   - Implement OAuth authorization code flow
   - See [Security Guide - Client Implementation](../security.md#pkce-implementation-rfc-9700-requirement)
   - Exchange auth code for access/refresh tokens

3. **Deploy to Vercel:**
   - `vercel --prod`
   - Update **Authorized redirect URIs** with production domain
   - See [Deployment Guide](../DEPLOYMENT.md)

4. **Test the full flow:**
   - User signs in with Google
   - Tokens obtained and validated
   - Data synced to Google Sheets

---

## 🔗 Related Guides

- [Security Guide](../security.md) - OAuth security details, PKCE, token handling
- [API Reference](../api.md) - How to call `/api/sync`
- [Deployment Guide](../DEPLOYMENT.md) - Deploy to Vercel
- [README](../README.md) - Overview and quick start

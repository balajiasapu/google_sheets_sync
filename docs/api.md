# 📖 API Reference - Google Sheets Sync

Detailed documentation for the backend proxy endpoints.

---

## POST `/api/sync`

Synchronizes application data to a user's Google Sheet.

### HTTP Method

**Supported:** `POST` only

**Other methods** (GET, PUT, DELETE, etc.) will return `405 Method Not Allowed`.

**CORS Preflight:** `OPTIONS` requests are supported for CORS negotiation.


### Request Headers

| Header | Value | Description |
|--------|-------|-------------|
| `Content-Type` | `application/json` | Mandatory for POST requests |
| `Origin` | Your domain | Must match `ALLOWED_ORIGIN` environment variable |

### Request Body

```json
{
  "accessToken": "ya29.a0AfH6...",
  "refreshToken": "1//0e...",
  "sheetConfig": {
    "sheetName": "Application Log",
    "headers": ["Date", "Category", "Amount", "Note"]
  },
  "rowData": [
    ["2026-01-03", "Office", 12.50, "Lunch"],
    ["2026-01-03", "Travel", 4.00, "Bus"]
  ]
}
```

#### Parameters

*   **`accessToken`** (string, **Required**): A valid Google OAuth 2.0 access token with `spreadsheets` or `drive.file` scope.
*   **`refreshToken`** (string, *Optional*): If provided, the proxy will attempt to refresh the access token if it is expired, ensuring background sync continuity.
*   **`sheetConfig`** (object, **Required**):
    *   **`sheetName`** (string, **Required**): The title of the spreadsheet. If it doesn't exist, it will be created. *Note: Should be a unique title within the user's Drive to avoid collisions.*
    *   **`headers`** (array of strings, **Required**): The exact headers for the first row of the sheet.
*   **`rowData`** (array of arrays, **Required**): The data rows to append.
    *   *Constraint:* Each inner array must have the exact same length as `sheetConfig.headers`.

---

### Responses

#### ✅ 200 OK (Success)
Returned when data is successfully appended to the sheet.

```json
{
  "success": true,
  "message": "Data synced successfully",
  "rowsAdded": 2,
  "spreadsheetId": "1abc1234567890def...",
  "tokenRefreshed": false
}
```

#### ❌ 400 Bad Request (Validation Error)
Returned when the request schema is invalid or headers don't match the existing sheet.

```json
{
  "success": false,
  "error": "invalid_schema",
  "message": "All rows must have 4 columns to match headers"
}
```
*   **Error: `header_mismatch`**: Occurs if the spreadsheet exists but its headers don't match `sheetConfig.headers`.

#### ❌ 401 Unauthorized (Auth Error)
Returned if the token is invalid, expired, or doesn't have required scopes.

```json
{
  "success": false,
  "error": "invalid_token",
  "message": "Access token is invalid or expired. Re-authentication required."
}
```

#### ❌ 429 Too Many Requests (Rate Limit)
Returned if the user exceeds the configured per-hour limit.

```json
{
  "success": false,
  "error": "rate_limit_exceeded",
  "message": "Hourly rate limit exceeded. Please try again later."
}
```

#### ❌ 500 Internal Server Error
Returned for unexpected backend failures.

```json
{
  "success": false,
  "error": "server_error",
  "message": "Internal server error occurred while syncing"
}
```
---
## 📚 Use Case Examples

### Example 1: Nutrition Tracking
Track daily meals and calories:

**Request:**
```json
{
  "accessToken": "...",
  "sheetConfig": {
    "sheetName": "Nutrition Tracker",
    "headers": ["Date", "Meal", "Calories", "Protein (g)", "Carbs (g)", "Fat (g)"]
  },
  "rowData": [
    ["2026-01-03", "Breakfast", 350, 12, 45, 8],
    ["2026-01-03", "Lunch", 620, 35, 60, 18]
  ]
}
```
### Example 2: Expense Logging
Track personal expenses:
```json
{
  "accessToken": "...",
  "sheetConfig": {
    "sheetName": "Expenses",
    "headers": ["Date", "Category", "Amount", "Description"]
  },
  "rowData": [
    ["2026-01-03", "Food", 12.50, "Lunch at office"],
    ["2026-01-03", "Transport", 4.00, "Bus fare"]
  ]
}
```

---

## Error Codes Reference

| Error Code | HTTP Status | Meaning | Action |
|-----------|-----------|---------|--------|
| `missing_fields` | 400 | Required field missing | Check request body |
| `invalid_schema` | 400 | Data format incorrect | Verify column count matches headers |
| `header_mismatch` | 400 | Headers don't match existing sheet | Update config or delete sheet |
| `invalid_token` | 401 | Token expired or invalid | Re-authenticate or use refresh token |
| `rate_limit_exceeded` | 429 | Too many requests | Wait 1 hour or check limit config |
| `method_not_allowed` | 405 | Wrong HTTP method | Use POST only |
| `server_error` | 500 | Backend failure | Check server logs, retry later |

---

## 🔐 Authentication

### Getting Access Tokens

Access tokens must be obtained through Google OAuth 2.0 authorization flow.

**Scopes Required:**
*   `https://www.googleapis.com/auth/spreadsheets` (broad: all sheets)
*   OR `https://www.googleapis.com/auth/drive.file` (recommended: app-created sheets only)

**Obtaining Tokens:**
1. Direct user to Google OAuth consent screen
2. User authorizes your app
3. Google returns `authorizationCode`
4. Exchange code for access and refresh tokens via your client backend
5. Send both tokens in request body to this proxy

**Token Expiration:**
*   Access tokens expire after **1 hour**
*   Refresh tokens expire after **6 months of inactivity**
*   Provide `refreshToken` to automatically handle expiration

**Security:**
*   Never expose access or refresh tokens in client code
*   Always use HTTPS for token transmission
*   Tokens are user-specific; don't reuse across users

---

## 🔒 Security Requirements

1.  **HTTPS Only**: The endpoint is only accessible over secure HTTPS connections.
2.  **CORS**: Enforced via the `ALLOWED_ORIGIN` environment variable.
3.  **Validation**: Strict audience, expiration, scope, and sender (`azp`) checks are performed on every token.

---
## Rate Limiting

**Default limit:** 100 requests/hour per authenticated user (by Google user ID)
**Tracking:** Stateful tracking via Vercel KV Redis store
**Window:** Rolling 1-hour window
**Configuration:** Customize via `RATE_LIMIT_PER_HOUR` environment variable

---
## Troubleshooting

### "Invalid token" Error
*   Token has expired (1 hour lifetime)
*   Solution: Provide `refreshToken` for automatic refresh
*   Or re-authenticate user

### "Header mismatch" Error
*   Existing sheet headers don't match your `sheetConfig.headers`
*   Solution: Either update client config OR delete sheet in Google Drive to recreate

### "Rate limit exceeded" Error
*   Made too many requests in 1 hour
*   Solution: Wait 1 hour for window to reset
*   Or increase `RATE_LIMIT_PER_HOUR` in production environment

---
## Examples with cURL

### Sync Nutrition Data
\`\`\`bash
curl -X POST https://your-app.vercel.app/api/sync \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "ya29.a0AfH6...",
    "sheetConfig": {
      "sheetName": "Nutrition",
      "headers": ["Date", "Meal", "Calories"]
    },
    "rowData": [["2026-01-03", "Breakfast", 350]]
  }'
\`\`\`

**Expected Response:**
\`\`\`json
{
  "success": true,
  "message": "Data synced successfully",
  "rowsAdded": 1,
  "spreadsheetId": "1abc123...",
  "tokenRefreshed": false
}
\`\`\`


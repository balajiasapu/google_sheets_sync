/**
 * Vercel Serverless Function - Generic Google Sheets Sync Proxy
 * 
 * Domain-Agnostic: Works with any data structure (nutrition, expenses, fitness, etc.)
 * 
 * Security:
 * - Validates OAuth access token with Google (RFC 9700 compliant)
 * - Uses client_secret from environment variables (NOT in client code)
 * - Acts as pass-through (doesn't store user data)
 * - Stateful Rate Limiting via Vercel KV
 * - Supports Refresh Tokens for seamless UX
 */

const { google } = require('googleapis');
const { kv } = require('@vercel/kv');

// Rate limiting configuration
const RATE_LIMIT = process.env.RATE_LIMIT_PER_HOUR || 100; // requests per hour per user
const RATE_WINDOW = 3600; // 1 hour in seconds for KV expiry

// Mock mode for development (NEVER use in production)
const MOCK_MODE = process.env.MOCK_MODE === 'true';

if (MOCK_MODE) {
    console.warn('🚨 MOCK_MODE ENABLED - DO NOT USE IN PRODUCTION 🚨');
    if (process.env.NODE_ENV === 'production') {
        throw new Error('MOCK_MODE must be false in production environments');
    }
}

/**
 * Main Lambda Handler
 */
module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only accept POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'method_not_allowed' });
    }

    try {
        const { accessToken, refreshToken, sheetConfig, rowData } = req.body;

        // Validate basic input
        if (!accessToken || !sheetConfig || !rowData) {
            return res.status(400).json({
                success: false,
                error: 'missing_fields',
                message: 'Access token, sheetConfig, and rowData are required'
            });
        }

        // Validate sheetConfig structure
        if (!sheetConfig.sheetName || !Array.isArray(sheetConfig.headers)) {
            return res.status(400).json({
                success: false,
                error: 'invalid_schema',
                message: 'sheetConfig must have sheetName (string) and headers (array)'
            });
        }

        // Validate rowData structure
        if (!Array.isArray(rowData) || rowData.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'invalid_schema',
                message: 'rowData must be a non-empty array of arrays'
            });
        }

        // Validate row length matches headers
        const headerCount = sheetConfig.headers.length;
        if (rowData.some(row => row.length !== headerCount)) {
            return res.status(400).json({
                success: false,
                error: 'invalid_schema',
                message: `All rows must have ${headerCount} columns to match headers`
            });
        }

        /**
         * Orchestrate the sync process with optional token refresh retry
         */
        async function attemptSync(activeToken, isRetry = false) {
            // Step 1: Validate access token (skip in mock mode)
            let tokenInfo;
            if (MOCK_MODE) {
                tokenInfo = { sub: 'mock_user_123' };
            } else {
                tokenInfo = await validateAccessToken(activeToken);
            }

            // Step 2: Handle Invalid/Expired Token
            if (!tokenInfo) {
                // If we have a refresh token and haven't retried yet, try to refresh
                if (refreshToken && !isRetry) {
                    console.log('[Sync Proxy] Token invalid, attempting refresh...');
                    const newToken = await refreshAccessToken(refreshToken);
                    if (newToken) {
                        return await attemptSync(newToken, true);
                    }
                }

                return res.status(401).json({
                    success: false,
                    error: 'invalid_token',
                    message: 'Access token is invalid or expired. Re-authentication required.'
                });
            }

            // Step 3: Rate limiting (Stateless check via Vercel KV)
            const userId = tokenInfo.sub;
            const isAllowed = await checkRateLimit(userId);
            if (!isAllowed) {
                return res.status(429).json({
                    success: false,
                    error: 'rate_limit_exceeded',
                    message: 'Hourly rate limit exceeded. Please try again later.'
                });
            }

            // Step 4: Execute Google Sheets Interaction
            const sheets = google.sheets({ version: 'v4' });
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: activeToken });

            // Find or create spreadsheet
            const spreadsheetId = await findOrCreateSpreadsheet(sheets, auth, sheetConfig, userId);

            // Append data
            const result = await appendData(sheets, auth, spreadsheetId, sheetConfig, rowData);

            // Step 5: Success Response
            return res.status(200).json({
                success: true,
                message: 'Data synced successfully',
                rowsAdded: result.rowsAdded,
                spreadsheetId: spreadsheetId,
                tokenRefreshed: isRetry // Inform client if a refresh occurred
            });
        }

        return await attemptSync(accessToken);

    } catch (error) {
        console.error('[Sync Proxy] Fatal Error:', error);

        // Handle specific header mismatch error
        if (error.message.includes('Header mismatch')) {
            return res.status(400).json({
                success: false,
                error: 'header_mismatch',
                message: error.message
            });
        }

        return res.status(500).json({
            success: false,
            error: 'server_error',
            message: 'Internal server error occurred while syncing'
        });
    }
};

/**
 * Validate access token with Google's tokeninfo endpoint (RFC 9700 compliant)
 */
async function validateAccessToken(accessToken) {
    try {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `access_token=${encodeURIComponent(accessToken)}`
        });

        if (!response.ok) return null;

        const tokenInfo = await response.json();

        // Audience check
        if (process.env.GOOGLE_CLIENT_ID && tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
            console.error('[Sync Proxy] Audience mismatch');
            return null;
        }

        // Expiration check
        if (tokenInfo.exp < Math.floor(Date.now() / 1000)) return null;

        // Scope check (Strict validation)
        const validScopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file'
        ];
        const hasValidScope = tokenInfo.scope?.split(' ').some(scope =>
            validScopes.includes(scope)
        );
        if (!hasValidScope) {
            console.error('[Sync Proxy] Token missing required strict scope');
            return null;
        }

        // Sender constraint (azp)
        if (tokenInfo.azp && process.env.GOOGLE_CLIENT_ID && tokenInfo.azp !== process.env.GOOGLE_CLIENT_ID) {
            return null;
        }

        return tokenInfo;
    } catch (error) {
        console.error('[Sync Proxy] Token validation error:', error);
        return null;
    }
}

/**
 * Refresh expired access token using refresh token
 */
async function refreshAccessToken(refreshToken) {
    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            }).toString()
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error('[Sync Proxy] Token refresh failed:', error);
        return null;
    }
}

/**
 * Stateful Rate Limit check via Vercel KV
 */
async function checkRateLimit(userId) {
    try {
        const key = `ratelimit:${userId}`;
        const current = await kv.get(key) || 0;

        if (current >= RATE_LIMIT) {
            return false;
        }

        await kv.incr(key);
        if (current === 0) {
            await kv.expire(key, RATE_WINDOW);
        }

        return true;
    } catch (error) {
        console.error('[Sync Proxy] Rate limit store error:', error);
        return true; // Fail open to not block users on database issues
    }
}

/**
 * Find or create spreadsheet in user's Drive
 */
async function findOrCreateSpreadsheet(sheets, auth, sheetConfig, userId) {
    const drive = google.drive({ version: 'v3', auth });

    try {
        const searchResponse = await drive.files.list({
            q: `name='${sheetConfig.sheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (searchResponse.data.files && searchResponse.data.files.length > 0) {
            const spreadsheetId = searchResponse.data.files[0].id;
            await ensureHeaders(sheets, auth, spreadsheetId, sheetConfig);
            return spreadsheetId;
        }

        // Create new
        const createResponse = await sheets.spreadsheets.create({
            auth,
            requestBody: {
                properties: { title: sheetConfig.sheetName },
                sheets: [{
                    properties: { title: 'Sheet1' },
                    data: [{
                        startRow: 0,
                        startColumn: 0,
                        rowData: [{
                            values: sheetConfig.headers.map(h => ({
                                userEnteredValue: { stringValue: h }
                            }))
                        }]
                    }]
                }]
            }
        });

        return createResponse.data.spreadsheetId;
    } catch (error) {
        console.error('[Sync Proxy] Spreadsheet init error:', error);
        throw error;
    }
}

/**
 * Verify headers - Non-destructive approach
 */
async function ensureHeaders(sheets, auth, spreadsheetId, sheetConfig) {
    try {
        const response = await sheets.spreadsheets.values.get({
            auth,
            spreadsheetId,
            range: 'Sheet1!A1:ZZ1'
        });

        const existingHeaders = response.data.values ? response.data.values[0] : [];

        if (JSON.stringify(existingHeaders) !== JSON.stringify(sheetConfig.headers)) {
            console.warn('[Sync Proxy] ⚠️ Header mismatch detected!');
            console.warn('Expected:', sheetConfig.headers);
            console.warn('Found:', existingHeaders);

            throw new Error(
                'Sheet headers do not match configuration. ' +
                'Please update client sheetConfig.headers to match the spreadsheet ' +
                'or delete the file in Google Drive to recreate it.'
            );
        }
    } catch (error) {
        if (error.message.includes('Header mismatch')) throw error;
        console.warn('[Sync Proxy] Could not verify headers:', error.message);
    }
}

/**
 * Append data rows
 */
async function appendData(sheets, auth, spreadsheetId, sheetConfig, rowData) {
    try {
        const columnCount = sheetConfig.headers.length;
        const columnLetter = getColumnLetter(columnCount);
        const range = `Sheet1!A:${columnLetter}`;

        await sheets.spreadsheets.values.append({
            auth,
            spreadsheetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS', // Ensure rows are inserted correctly
            requestBody: { values: rowData }
        });

        console.log(`[Sync Proxy] Successfully appended ${rowData.length} rows`);
        return { rowsAdded: rowData.length };
    } catch (error) {
        console.error('[Sync Proxy] Error appending data:', error);
        throw new Error(`Failed to append data: ${error.message}`);
    }
}

/**
 * Convert column index to Excel-style column letter
 */
function getColumnLetter(colIndex) {
    let col = '';
    while (colIndex > 0) {
        colIndex--; // Convert to 0-based
        col = String.fromCharCode((colIndex % 26) + 65) + col;
        colIndex = Math.floor(colIndex / 26);
    }
    return col;
}

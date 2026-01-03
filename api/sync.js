/**
 * Vercel Serverless Function - Generic Google Sheets Sync Proxy
 * 
 * Domain-Agnostic: Works with any data structure (nutrition, expenses, fitness, etc.)
 * 
 * Security:
 * - Validates OAuth access token with Google
 * - Uses client_secret from environment variables (NOT in client code)
 * - Acts as pass-through (doesn't store user data)
 * 
 * Privacy:
 * - Only receives minimal data as defined by client
 * - Writes to user's own Google Sheet
 * - No data retention on server
 */

const { google } = require('googleapis');

// Rate limiting (simple in-memory store for demo; use Redis in production)
// NOTE: This in-memory store is "best effort" for serverless environments.
// Vercel functions are stateless and may spin up multiple instances.
// For strict enforcement, use an external store like Vercel KV or Redis.
const rateLimitStore = new Map();
const RATE_LIMIT = process.env.RATE_LIMIT_PER_HOUR || 100; // requests per hour per user
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in ms

// Mock mode for development (NEVER use in production)
const MOCK_MODE = process.env.MOCK_MODE === 'true';

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
        const { accessToken, sheetConfig, rowData } = req.body;

        // Validate input
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
        const invalidRows = rowData.filter(row => row.length !== headerCount);
        if (invalidRows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'invalid_schema',
                message: `All rows must have ${headerCount} columns to match headers`
            });
        }

        // Step 1: Validate access token with Google (skip in mock mode)
        let tokenInfo;
        if (MOCK_MODE) {
            console.warn('[Sync Proxy] MOCK MODE - Skipping token validation');
            tokenInfo = { sub: 'mock_user_123' };
        } else {
            tokenInfo = await validateAccessToken(accessToken);
            if (!tokenInfo) {
                return res.status(401).json({
                    success: false,
                    error: 'invalid_token',
                    message: 'Invalid or expired access token'
                });
            }
        }

        // Step 2: Rate limiting (prevent abuse)
        const userId = tokenInfo.sub; // Google user ID
        if (!checkRateLimit(userId)) {
            return res.status(429).json({
                success: false,
                error: 'rate_limit_exceeded',
                message: 'Too many requests. Please try again later.'
            });
        }

        // Step 3: Initialize Google Sheets API with user's token
        const sheets = google.sheets({ version: 'v4' });
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });

        // Step 4: Find or create spreadsheet with configured name
        const spreadsheetId = await findOrCreateSpreadsheet(sheets, auth, sheetConfig, userId);

        // Step 5: Append data rows
        const result = await appendData(sheets, auth, spreadsheetId, sheetConfig, rowData);

        // Step 6: Return success
        return res.status(200).json({
            success: true,
            message: 'Data synced successfully',
            rowsAdded: result.rowsAdded,
            spreadsheetId: spreadsheetId
        });

    } catch (error) {
        console.error('[Sync Proxy] Error:', error);

        // Handle specific errors
        if (error.code === 401 || error.code === 403) {
            return res.status(401).json({
                success: false,
                error: 'token_expired',
                message: 'Token expired. Please sign in again.'
            });
        }

        return res.status(500).json({
            success: false,
            error: 'server_error',
            message: 'Internal server error'
        });
    }
};

/**
 * Validate access token with Google's tokeninfo endpoint
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Object|null>} - Token info or null if invalid
 */
async function validateAccessToken(accessToken) {
    try {
        const response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`);

        if (!response.ok) {
            return null;
        }

        const tokenInfo = await response.json();

        // Verify token is for our app (optional but recommended)
        if (process.env.GOOGLE_CLIENT_ID && tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
            console.error('[Sync Proxy] Token audience mismatch');
            return null;
        }

        return tokenInfo;
    } catch (error) {
        console.error('[Sync Proxy] Token validation error:', error);
        return null;
    }
}

/**
 * Check rate limit for user
 * @param {string} userId - Google user ID
 * @returns {boolean} - True if within limit
 */
function checkRateLimit(userId) {
    const now = Date.now();
    const userLimit = rateLimitStore.get(userId) || { count: 0, resetTime: now + RATE_WINDOW };

    // Reset if window expired
    if (now > userLimit.resetTime) {
        userLimit.count = 0;
        userLimit.resetTime = now + RATE_WINDOW;
    }

    // Check limit
    if (userLimit.count >= RATE_LIMIT) {
        return false;
    }

    // Increment
    userLimit.count++;
    rateLimitStore.set(userId, userLimit);
    return true;
}

/**
 * Find or create spreadsheet in user's Drive (generic, domain-agnostic)
 * @param {Object} sheets - Google Sheets API instance
 * @param {Object} auth - OAuth2 client
 * @param {Object} sheetConfig - Configuration with sheetName and headers
 * @param {string} userId - Google user ID (for logging)
 * @returns {Promise<string>} - Spreadsheet ID
 */
async function findOrCreateSpreadsheet(sheets, auth, sheetConfig, userId) {
    const drive = google.drive({ version: 'v3', auth });

    try {
        // Search for existing spreadsheet
        const searchResponse = await drive.files.list({
            q: `name='${sheetConfig.sheetName}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (searchResponse.data.files && searchResponse.data.files.length > 0) {
            const spreadsheetId = searchResponse.data.files[0].id;
            console.log('[Sync Proxy] Found existing spreadsheet:', spreadsheetId);

            // Ensure sheet has correct headers
            await ensureHeaders(sheets, auth, spreadsheetId, sheetConfig);

            return spreadsheetId;
        }

        // Create new spreadsheet with headers
        const headerRow = sheetConfig.headers.map(header => ({
            userEnteredValue: { stringValue: header }
        }));

        const createResponse = await sheets.spreadsheets.create({
            auth,
            requestBody: {
                properties: {
                    title: sheetConfig.sheetName
                },
                sheets: [{
                    properties: {
                        title: 'Sheet1'
                    },
                    data: [{
                        startRow: 0,
                        startColumn: 0,
                        rowData: [{
                            values: headerRow
                        }]
                    }]
                }]
            }
        });

        console.log('[Sync Proxy] Created new spreadsheet:', createResponse.data.spreadsheetId);
        return createResponse.data.spreadsheetId;

    } catch (error) {
        console.error('[Sync Proxy] Error finding/creating spreadsheet:', error);
        throw error;
    }
}

/**
 * Ensure spreadsheet has correct headers (for existing sheets)
 * @param {Object} sheets - Google Sheets API instance
 * @param {Object} auth - OAuth2 client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {Object} sheetConfig - Configuration with headers
 *
 * WARNING: This function will overwrite headers if they don't match.
 * Do not manually reorder columns in Google Sheets; update the client config instead.
 */
async function ensureHeaders(sheets, auth, spreadsheetId, sheetConfig) {
    try {
        // Get first row to check headers
        const response = await sheets.spreadsheets.values.get({
            auth,
            spreadsheetId,
            range: 'Sheet1!A1:ZZ1'
        });

        const existingHeaders = response.data.values ? response.data.values[0] : [];

        // If headers don't match, log warning and update
        if (JSON.stringify(existingHeaders) !== JSON.stringify(sheetConfig.headers)) {
            console.warn('[Sync Proxy] Header mismatch detected. Existing:', existingHeaders, 'Expected:', sheetConfig.headers);
            console.warn('[Sync Proxy] Updating headers. Manual column reordering will be overwritten.');

            await sheets.spreadsheets.values.update({
                auth,
                spreadsheetId,
                range: 'Sheet1!A1',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [sheetConfig.headers]
                }
            });
            console.log('[Sync Proxy] Headers updated successfully');
        }
    } catch (error) {
        console.warn('[Sync Proxy] Could not verify/update headers:', error.message);
        // Non-critical error, continue
    }
}

/**
 * Append data rows to spreadsheet (generic, domain-agnostic)
 * @param {Object} sheets - Google Sheets API instance
 * @param {Object} auth - OAuth2 client
 * @param {string} spreadsheetId - Spreadsheet ID
 * @param {Object} sheetConfig - Configuration with sheetName
 * @param {Array} rowData - Array of arrays to append
 * @returns {Promise<Object>} - { rowsAdded: number }
 */
async function appendData(sheets, auth, spreadsheetId, sheetConfig, rowData) {
    try {
        // Determine range based on number of columns
        const columnCount = sheetConfig.headers.length;
        const columnLetter = getColumnLetter(columnCount); // Handles 1-26 (A-Z) and 27+ (AA, AB, etc.)
        const range = `Sheet1!A:${columnLetter}`;

        const response = await sheets.spreadsheets.values.append({
            auth,
            spreadsheetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: rowData
            }
        });

        console.log('[Sync Proxy] Appended', rowData.length, 'rows');
        return { rowsAdded: rowData.length };
    } catch (error) {
        console.error('[Sync Proxy] Error appending data:', error);
        throw error;
    }
}

/**
 * Convert column index to Excel-style column letter
 * Handles columns beyond Z (e.g., 27 -> AA, 28 -> AB)
 * @param {number} colIndex - Column index (1-based)
 * @returns {string} - Column letter (A, B, ..., Z, AA, AB, ...)
 */
function getColumnLetter(colIndex) {
    let letter = '';
    while (colIndex > 0) {
        let temp = (colIndex - 1) % 26;
        letter = String.fromCharCode(temp + 65) + letter;
        colIndex = Math.floor((colIndex - temp - 1) / 26);
    }
    return letter;
}

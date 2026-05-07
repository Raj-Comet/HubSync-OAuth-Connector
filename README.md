# HubSpot OAuth Connector

A production-ready HubSpot OAuth connector built with Node.js backend and React TypeScript frontend. Demonstrates proper OAuth flow with token refresh, structured logging, and real-time contact fetching.

## Features

✅ **OAuth 2.0 Flow** - Secure authorization with HubSpot  
✅ **Signed State Validation** - HMAC-SHA256 signed state with constant-time comparison  
✅ **Single-Flight Token Refresh** - Efficient concurrent request handling  
✅ **Structured JSON Logging** - Route tracking, latency measurement, secure logs  
✅ **Error Handling** - Clean errors (no stack traces in responses)  
✅ **Real HubSpot Integration** - Fetch actual contacts with pagination  

## Tech Stack

- **Backend**: Node.js, Express.js, Axios, Pino logging
- **Frontend**: React 18, TypeScript, Vite
- **Storage**: In-memory Map (production: add persistent DB)
- **Authentication**: HubSpot OAuth 2.0

## Live Deployment

**Frontend**: https://hubspot-oauth-frontend.vercel.app  
**Backend**: https://hubspot-oauth-backend.onrender.com  

## Setup Instructions

### Prerequisites

- Node.js 16+
- Free HubSpot Developer Account: https://developers.hubspot.com
- Git

### Local Development

#### 1. Clone Repository
```bash
git clone <your-repo-url>
cd HubSync\ OAuth\ Connector
```

#### 2. HubSpot OAuth Setup

1. Go to https://developers.hubspot.com
2. Create a private app with:
   - **Scopes**: `crm.objects.contacts.read`
   - **Redirect URI**: `http://localhost:3001/callback`
3. Copy your Client ID and Client Secret

#### 3. Backend Setup
```bash
cd backend
cp .env.example .env
```

Edit `.env`:
```
HUBSPOT_CLIENT_ID=your_client_id
HUBSPOT_CLIENT_SECRET=your_client_secret
STATE_SECRET=your-random-secret-key
FRONTEND_URL=http://localhost:3000
PORT=3001
NODE_ENV=development
```

Install and run:
```bash
npm install
npm run dev
```

Backend runs on http://localhost:3001

#### 4. Frontend Setup
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs on http://localhost:3000

#### 5. Test OAuth Flow

1. Visit http://localhost:3000
2. Click "Connect HubSpot" → redirects to HubSpot login
3. Authorize the app
4. Callback returns with userId in URL
5. Click "Get Contacts" → loads real contacts from HubSpot

## API Endpoints

### `GET /connect`
Returns HubSpot OAuth authorization URL with signed state.

**Response:**
```json
{
  "authorizeUrl": "https://app.hubspot.com/oauth/authorize?..."
}
```

---

### `GET /callback`
OAuth callback endpoint. Validates state, exchanges code for tokens, stores in-memory.

**Query Parameters:**
- `code` - Authorization code from HubSpot
- `state` - Signed state for CSRF protection

**Behavior:**
- ✅ Validates signed state with HMAC-SHA256
- ✅ Exchanges code for access/refresh tokens
- ✅ Stores tokens in-memory with expiration
- ✅ Redirects to frontend with userId

---

### `GET /contacts`
Fetches first 25 HubSpot contacts with pagination support.

**Query Parameters:**
- `userId` (required) - User ID from OAuth callback

**Properties Returned:**
- `firstname`, `lastname`, `email`, `phone`

**Response:**
```json
{
  "results": [
    {
      "id": "12345",
      "properties": {
        "firstname": { "value": "John" },
        "lastname": { "value": "Doe" },
        "email": { "value": "john@example.com" },
        "phone": { "value": "+1234567890" }
      }
    }
  ],
  "paging": {
    "next": {
      "after": "cursor_token"
    }
  }
}
```

**Error Handling:**
- **401 Unauthorized**: Token expired → Auto-refresh → Retry once → Clean error if fails
- **400 Bad Request**: Missing userId
- **500 Error**: Returns clean error message (no stack trace)

**Structured Logging:**
```json
{
  "event": "contacts_fetched",
  "route": "/contacts",
  "userId": "user_abc123",
  "latency": 234,
  "refreshed": false,
  "contactCount": 25
}
```

---

## Single-Flight Token Refresh

**Problem**: If 10 concurrent `/contacts` requests hit an expired token, we don't want 10 refresh calls.

**Solution**: Single-flight pattern using Promise caching:

```javascript
const refreshInFlight = new Map(); // userId -> Promise

async function refreshAccessToken(userId) {
  // If refresh already in flight, wait for it
  if (refreshInFlight.has(userId)) {
    return refreshInFlight.get(userId);
  }
  
  // Create refresh promise
  const refreshPromise = (async () => {
    // ... perform refresh ...
  })();
  
  refreshInFlight.set(userId, refreshPromise);
  return refreshPromise;
}
```

**How it works:**
1. First request detects expired token, starts refresh
2. Stores Promise in `refreshInFlight` Map
3. Requests 2-10 check Map, find existing Promise, wait for it
4. All 10 requests use same token from single refresh call
5. Promise removed from Map after completion

**Benefits:**
- Reduces HubSpot API calls by 90%
- Prevents token quota exhaustion
- Ensures consistency across concurrent requests

---

## Token Storage

**Current**: In-memory Map
```javascript
const tokenStore = new Map(); // userId -> { accessToken, refreshToken, expiresAt }
```

**For Production**, consider:
- PostgreSQL with encrypted tokens
- Redis for session management
- AWS SecretsManager for sensitive data

---

## Signed State Validation

**Purpose**: Prevent CSRF attacks in OAuth flow

**Implementation**: HMAC-SHA256 with constant-time comparison

```javascript
// Generate
const timestamp = Date.now();
const randomPart = crypto.randomBytes(16).toString('hex');
const stateData = `${timestamp}:${randomPart}`;
const signature = crypto
  .createHmac('sha256', STATE_SECRET)
  .update(stateData)
  .digest('hex');
const signedState = `${stateData}:${signature}`;

// Validate
const isValid = crypto.timingSafeEqual(
  Buffer.from(providedSignature),
  Buffer.from(expectedSignature)
);
```

**Security Features:**
- ✅ Timestamp prevents replay attacks (5 min expiry)
- ✅ Random component ensures uniqueness
- ✅ Constant-time comparison prevents timing attacks
- ✅ State stored temporarily and consumed once

---

## Logging

**Structured JSON logs** with:
- `event` - Log event name
- `route` - API route
- `latency` - Request latency in ms
- `userId` - User identifier
- `error` - Error message (never tokens)

**Log Levels**: info, warn, error

**Security**:
- 🔒 Never log access tokens
- 🔒 Never log refresh tokens
- 🔒 Never return tokens in API responses
- 🔒 Clean error messages in responses

---

## Production Deployment

### Backend (Render)

1. Push to GitHub
2. Create new Web Service on Render
3. Connect GitHub repository
4. Set environment variables:
   ```
   HUBSPOT_CLIENT_ID=...
   HUBSPOT_CLIENT_SECRET=...
   STATE_SECRET=...
   FRONTEND_URL=https://your-frontend.vercel.app
   BACKEND_URL=https://your-backend.onrender.com
   NODE_ENV=production
   ```
5. Deploy

### Frontend (Vercel)

1. Import project to Vercel
2. Set environment variables:
   ```
   VITE_BACKEND_URL=https://your-backend.onrender.com
   ```
3. Deploy

### HubSpot Configuration

1. Go to Private App settings
2. Update Redirect URI to production URL:
   ```
   https://your-backend.onrender.com/callback
   ```
3. Test OAuth flow on production URL

---

## What I'd Build Next (Day 1 on the Job)

1. **Persistent Database** - Replace in-memory Map with PostgreSQL
   - Store encrypted tokens with user profiles
   - Track token refresh timestamps
   - Enable multi-user support

2. **Token Encryption** - Never store raw tokens
   - Use AWS KMS or similar
   - Decrypt on-demand for API calls

3. **Rate Limiting** - Prevent abuse
   - Implement sliding window rate limiter
   - Per-user and per-IP limits

4. **Advanced Error Recovery** - Better UX
   - Detect rate limits, return retry-after
   - Queue failed requests
   - Exponential backoff for retries

5. **Webhook Support** - Real-time sync
   - Subscribe to HubSpot contact changes
   - Push updates to frontend via WebSockets
   - Cache recent contacts locally

6. **Batch Operations** - Handle large datasets
   - Paginate contacts properly
   - Stream responses
   - Add search/filter capabilities

7. **Audit Logging** - Compliance
   - Log all token operations
   - Track user actions
   - Immutable audit trail

8. **Tests** - Production readiness
   - Unit tests for token refresh logic
   - Integration tests for OAuth flow
   - E2E tests with HubSpot sandbox

---

## Development Time

**Total time to production**: ~3.5 hours

**Breakdown:**
- Backend setup & OAuth implementation: 1.2 hours
- Frontend UI & integration: 0.9 hours
- Deployment (Render + Vercel): 0.7 hours
- Testing & debugging: 0.4 hours
- Documentation & video: 0.3 hours

**Challenges overcome:**
- Single-flight refresh pattern required careful Promise management
- Constant-time state comparison to prevent timing attacks
- Structured logging without exposing sensitive tokens
- CORS configuration for OAuth callback redirect

---

## Troubleshooting

### "Invalid or expired state"
- State expires after 5 minutes
- Restart OAuth flow by clicking "Connect HubSpot"

### "401 Unauthorized"
- Token expired and refresh failed
- Verify HUBSPOT_CLIENT_SECRET is correct
- Check HubSpot API quota

### "Cannot GET /callback"
- Redirect URI doesn't match HubSpot settings
- Update Redirect URI to match deployment URL

### Frontend can't reach backend
- Check VITE_BACKEND_URL environment variable
- Verify CORS headers on backend
- Check firewall/network settings

---

## License

MIT

## Support

For issues or questions, open a GitHub issue or contact the development team.

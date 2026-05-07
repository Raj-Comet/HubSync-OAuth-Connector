# Technical Architecture - HubSpot OAuth Connector

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Vercel)                       │
│  React 18 + TypeScript + Vite                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │ • Connect HubSpot Button → OAuth Flow              │    │
│  │ • Get Contacts Button → API Call                   │    │
│  │ • Error State Handling                             │    │
│  │ • Contact List Display (25 items)                  │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────────┬────────────────────────────────┘
                            │
                    HTTP/CORS (Axios)
                            │
┌───────────────────────────┴────────────────────────────────┐
│                    Backend (Render)                        │
│  Node.js + Express.js                                      │
│  ┌────────────────────────────────────────────────────┐    │
│  │ GET /connect → OAuth URL Generation                │    │
│  │ GET /callback → Token Exchange                     │    │
│  │ GET /contacts → Contact Fetching + Refresh Logic   │    │
│  │ GET /health → Health Check                         │    │
│  └────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────┐    │
│  │ In-Memory Token Store (Map)                         │    │
│  │ State Management                                    │    │
│  │ Structured JSON Logging (Pino)                      │    │
│  │ Single-Flight Refresh Queue                         │    │
│  └────────────────────────────────────────────────────┘    │
└───────────────────────────┬────────────────────────────────┘
                            │
                    HTTPS (Axios)
                            │
┌───────────────────────────┴────────────────────────────────┐
│              HubSpot API                                    │
│  • OAuth Endpoints                                          │
│  • Token Management                                         │
│  • CRM Contacts API                                         │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Backend Components

#### 1. OAuth Handler (`/connect`)
- **Purpose**: Generate OAuth authorization URL
- **Flow**:
  1. Generate signed state (HMAC-SHA256)
  2. Store state temporarily (5 min expiry)
  3. Build authorization URL with HubSpot params
  4. Return to frontend
- **Security**: HMAC signature prevents tampering

#### 2. Callback Handler (`/callback`)
- **Purpose**: Exchange auth code for tokens
- **Flow**:
  1. Receive `code` and `state` from HubSpot
  2. Validate `state` with constant-time compare
  3. POST to HubSpot token endpoint
  4. Store tokens in-memory with expiry
  5. Redirect to frontend with userId
- **Security**: State validation prevents CSRF attacks

#### 3. Contacts Fetcher (`/contacts`)
- **Purpose**: Fetch HubSpot contacts with auto-refresh
- **Flow**:
  1. Check token expiry
  2. If valid: call HubSpot API
  3. If expired: single-flight refresh → retry
  4. If refresh fails: return clean error
- **Single-Flight Pattern**: Prevents duplicate refresh calls

#### 4. Token Manager
- **Storage**: `Map<userId, TokenData>`
- **TokenData**:
  ```js
  {
    accessToken: "string",
    refreshToken: "string",
    expiresAt: number (timestamp)
  }
  ```
- **Refresh Logic**: Uses single-flight Promise cache
- **Expiry**: Tokens checked before each API call

#### 5. Logger
- **Library**: Pino with pretty printing
- **Format**: Structured JSON
- **Fields**: event, route, latency, userId, error
- **Security**: Never logs tokens or sensitive data

### Frontend Components

#### 1. App Component
- **State**:
  - `userId`: Extracted from URL on mount
  - `isConnected`: Boolean connection status
  - `contacts`: Array of Contact objects
  - `loading`: Request in progress
  - `error`: Error message display
  - `successMessage`: Success feedback

- **Handlers**:
  - `handleConnectHubSpot()`: Initiates OAuth flow
  - `handleGetContacts()`: Calls backend API
  - `handleDisconnect()`: Clears state

#### 2. UI Components
- **Header**: Title and description
- **Status Section**: Shows connection status
- **Controls**: Connect/Disconnect/Get Contacts buttons
- **Messages**: Error and success banners
- **Contact List**: Grid display with details
- **Raw JSON**: Expandable JSON view

#### 3. API Client
- **Axios Instance**: Default to backend URL
- **Endpoints**:
  - `GET /connect` → OAuth URL
  - `GET /contacts?userId={id}` → Contact list
- **Error Handling**: Maps HTTP status to user messages

## Data Flow

### OAuth Flow (Sequence Diagram)

```
User              Frontend           Backend          HubSpot
 │                   │                 │                │
 │  Click "Connect"  │                 │                │
 ├──────────────────→│                 │                │
 │                   │  GET /connect   │                │
 │                   ├────────────────→│                │
 │                   │  {authorizeUrl} │                │
 │                   │←────────────────┤                │
 │                   │ Redirect        │                │
 │◄──────────────────┤ to HubSpot       │                │
 │ Login & Consent   │                 │                │
 │─────────────────────────────────────────────────────→│
 │                                                       │ Authorize
 │◄─────────────────────────────────────────────────────┤
 │                   │ Redirect        │                │
 │                   │ /callback?code&state             │
 │                   │                 │                │
 │                   │ GET /callback   │                │
 │                   │ code + state    │                │
 │                   ├────────────────→│                │
 │                   │                 │ Validate state │
 │                   │                 │ Exchange code  │
 │                   │                 ├───────────────→│
 │                   │                 │←───────────────┤
 │                   │                 │ {tokens}       │
 │                   │                 │ Store tokens   │
 │                   │ Redirect        │                │
 │                   │ /?userId=x      │                │
 │◄──────────────────┤                 │                │
 │ Show contacts btn │                 │                │
 │                   │                 │                │
```

### Contacts Fetch (Single-Flight Refresh)

```
Request 1     Request 2-10       Backend           HubSpot
(expired)     (expired)
   │              │                 │                │
   ├─────────────→│ Check token    │                │
   │              ├────────────────→│ Try GET        │
   │              │                 ├───────────────→│
   │              │                 │← 401 (expired) │
   │              │                 │                │
   │              │  Start refresh  │                │
   │              │  (set flag)     │                │
   │              │  POST /token    │                │
   │              ├────────────────────────────────→│
   │              │                 │                │
   │ Also checks  ├─────────────────┼───────────────→│
   │ (sees flag)  │  Refresh in FLT │                │
   │ WAITS        ├──────────────────────────────────┤
   │              │                 │ (Wait here)    │
   │              │                 │←─ new token    │
   │              │                 │                │
   │              │  Both use new   │                │
   │              │  token          │                │
   │              ├────────────────→│ GET /contacts  │
   │◄─────────────┤                 │←───────────────┤
   │              ├────────────────→│                │
   │              │                 ├───────────────→│
   │              │                 │← contacts     │
   │◄─────────────┤                 │                │
   │ Render       │ Render          │                │
   │ contacts     │ contacts        │                │
```

## Security Considerations

### 1. OAuth State Validation

**Attack**: CSRF (Cross-Site Request Forgery)

**Defense**:
```javascript
// Generate signed state
const state = `${timestamp}:${randomBytes}:${HMAC_SHA256}`;

// Validate with constant-time compare
crypto.timingSafeEqual(provided, expected);
```

**Why HMAC-SHA256 + Constant-Time Compare**:
- HMAC ensures state wasn't tampered with
- Constant-time compare prevents timing attacks
- Timestamp prevents replays (5 min expiry)

### 2. Token Storage

**Threat**: Token theft if database compromised

**Current**: In-memory (safe for demo)

**Production**: 
- Encrypt tokens at rest
- Use `buffer.compare()` for equality checks
- Never log token values
- Rotate keys periodically

### 3. API Response Security

**Threat**: Exposing sensitive data in errors

**Defense**:
```javascript
// ❌ BAD
res.status(500).json({ error: err.stack });

// ✅ GOOD
res.status(401).json({ error: 'Authentication failed' });
```

**Rules**:
- Never return tokens in responses
- Never expose stack traces to clients
- Return only necessary fields in contact data

### 4. CORS Configuration

**Current**:
```javascript
app.use(cors()); // Allows all origins
```

**Production**:
```javascript
app.use(cors({
  origin: ['https://your-frontend.vercel.app'],
  credentials: true
}));
```

### 5. Environment Variables

**Never commit**:
- `.env` file (in `.gitignore`)
- HubSpot credentials
- `STATE_SECRET`

**Use platform-specific env vars**:
- Vercel: Project Settings → Environment Variables
- Render: Dashboard → Environment Variables
- GitHub Secrets for CI/CD

## Performance Optimizations

### 1. Single-Flight Refresh

**Problem**: 10 concurrent requests = 10 token refresh calls

**Solution**: Promise cache
```javascript
if (refreshInFlight.has(userId)) {
  return refreshInFlight.get(userId); // Wait for in-flight refresh
}
```

**Impact**: 90% reduction in token refresh API calls

### 2. Token Expiry Caching

**Future optimization**: Cache token validity
```javascript
// Don't check expiry on every request, use grace period
const needsRefresh = now >= token.expiresAt - 60000; // Refresh 1 min early
```

### 3. Contact Pagination

**Current**: Hardcoded limit 25

**Future**: Support cursor-based pagination
```javascript
GET /contacts?userId={id}&after={cursor}
```

### 4. Response Caching

**Future**: Cache contacts for 5 minutes
```javascript
const cache = new Map(); // userId -> { data, expiresAt }
```

## Logging Examples

### Successful OAuth Flow
```json
{
  "event": "oauth_flow_started",
  "route": "/connect",
  "stateLength": 88
}
```

### Successful Token Exchange
```json
{
  "event": "callback_tokens_stored",
  "route": "/callback",
  "userId": "user_abc123",
  "expiresAt": "2024-03-15T10:30:00Z"
}
```

### Token Refresh Required
```json
{
  "event": "contacts_token_expired",
  "route": "/contacts",
  "userId": "user_abc123",
  "latency": 234
}
```

### Successful Contact Fetch
```json
{
  "event": "contacts_fetched",
  "route": "/contacts",
  "userId": "user_abc123",
  "latency": 245,
  "refreshed": false,
  "contactCount": 25
}
```

### Error - Clean Error Returned
```json
{
  "event": "contacts_error",
  "route": "/contacts",
  "latency": 150,
  "error": "Failed to fetch contacts",
  "status": 500
}
```

Response to client:
```json
{
  "error": "Failed to fetch contacts"
}
```

## Database Schema (Future)

When moving to PostgreSQL:

```sql
-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  hubspot_id VARCHAR UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tokens Table (encrypted)
CREATE TABLE oauth_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Audit Log Table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  event VARCHAR,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Deployment Architecture

### Development
```
Local Machine
├── Backend: localhost:3001
├── Frontend: localhost:3000
└── HubSpot OAuth: Sandbox redirect URI
```

### Production
```
GitHub Repository
├── Backend (src/) → Render → Backend URL
└── Frontend (src/) → Vercel → Frontend URL

HubSpot OAuth Configuration
└── Redirect URI: https://backend.onrender.com/callback
```

## Testing Strategy

### Unit Tests (Backend)
- State validation with HMAC
- Token expiry checking
- Single-flight refresh logic
- Error message sanitization

### Integration Tests
- Full OAuth flow with mock HubSpot API
- Token refresh on 401
- Contact pagination

### E2E Tests
- Browser automation (Playwright)
- Full user journey on production
- Performance benchmarks

## Monitoring & Alerts

### Metrics to Track
- Request latency (p50, p95, p99)
- Error rate by endpoint
- Token refresh frequency
- OAuth flow abandonment rate

### Alert Rules
- Error rate > 5%
- Token refresh failures > 10/hour
- Response time > 2 seconds
- Cold start time > 5 seconds

### Tools
- Sentry: Error tracking
- DataDog: Performance monitoring
- CloudWatch: AWS logs (if using AWS services)

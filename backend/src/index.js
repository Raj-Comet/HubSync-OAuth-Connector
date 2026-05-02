import express from 'express';
import cors from 'cors';
import axios from 'axios';
import crypto from 'crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// CONFIGURATION & LOGGER SETUP
// ============================================================================

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const HUBSPOT_CLIENT_ID = process.env.HUBSPOT_CLIENT_ID;
const HUBSPOT_CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;
const STATE_SECRET = process.env.STATE_SECRET || 'dev-secret-change-in-prod';

const HUBSPOT_AUTH_URL = 'https://app.hubspot.com/oauth/authorize';
const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';
const HUBSPOT_API_BASE = 'https://api.hubapi.com';

// ============================================================================
// TOKEN STORAGE & STATE MANAGEMENT
// ============================================================================

// In-memory storage: { userId -> { accessToken, refreshToken, expiresAt, refreshing } }
const tokenStore = new Map();
const stateStore = new Map();

// Refresh state tracking: { userId -> Promise } for single-flight refresh
const refreshInFlight = new Map();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a signed state for OAuth flow
 * Uses HMAC-SHA256 with a timestamp
 */
function generateSignedState() {
  const timestamp = Date.now();
  const randomPart = crypto.randomBytes(16).toString('hex');
  const stateData = `${timestamp}:${randomPart}`;
  
  const signature = crypto
    .createHmac('sha256', STATE_SECRET)
    .update(stateData)
    .digest('hex');
  
  const signedState = `${stateData}:${signature}`;
  stateStore.set(signedState, { createdAt: timestamp });
  
  return signedState;
}

/**
 * Validate a signed state
 * Uses constant-time comparison to prevent timing attacks
 */
function validateSignedState(state) {
  if (!state) return false;
  
  const parts = state.split(':');
  if (parts.length !== 3) return false;
  
  const [timestamp, randomPart, providedSignature] = parts;
  const stateData = `${timestamp}:${randomPart}`;
  
  const expectedSignature = crypto
    .createHmac('sha256', STATE_SECRET)
    .update(stateData)
    .digest('hex');
  
  // Constant-time comparison
  const isValid = crypto.timingSafeEqual(
    Buffer.from(providedSignature),
    Buffer.from(expectedSignature)
  );
  
  if (!isValid) return false;
  
  // Check state exists and isn't too old (5 minutes)
  const stateRecord = stateStore.get(state);
  if (!stateRecord) return false;
  
  const ageMs = Date.now() - stateRecord.createdAt;
  if (ageMs > 5 * 60 * 1000) {
    stateStore.delete(state);
    return false;
  }
  
  return true;
}

/**
 * Check if token is expired
 */
function isTokenExpired(token) {
  if (!token || !token.expiresAt) return true;
  return Date.now() >= token.expiresAt;
}

/**
 * Get or create unique user ID from state
 */
function getUserIdFromState(state) {
  return `user_${state.substring(0, 16)}`;
}

/**
 * Refresh access token with single-flight pattern
 * If 10 concurrent requests hit expired token, refresh runs exactly once
 */
async function refreshAccessToken(userId) {
  // If refresh already in flight, wait for it
  if (refreshInFlight.has(userId)) {
    return refreshInFlight.get(userId);
  }
  
  // Create refresh promise
  const refreshPromise = (async () => {
    try {
      const token = tokenStore.get(userId);
      if (!token || !token.refreshToken) {
        throw new Error('No refresh token available');
      }
      
      logger.info(
        {
          event: 'token_refresh_start',
          userId,
          route: '/contacts',
        },
        'Starting token refresh for user'
      );
      
      const response = await axios.post(HUBSPOT_TOKEN_URL, {
        grant_type: 'refresh_token',
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        refresh_token: token.refreshToken,
      });
      
      const newToken = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        expiresAt: Date.now() + response.data.expires_in * 1000,
      };
      
      tokenStore.set(userId, newToken);
      
      logger.info(
        {
          event: 'token_refresh_success',
          userId,
          route: '/contacts',
          newExpiresAt: new Date(newToken.expiresAt).toISOString(),
        },
        'Token refreshed successfully'
      );
      
      return newToken;
    } catch (error) {
      logger.error(
        {
          event: 'token_refresh_failed',
          userId,
          route: '/contacts',
          error: error.message,
        },
        'Token refresh failed'
      );
      throw error;
    } finally {
      refreshInFlight.delete(userId);
    }
  })();
  
  refreshInFlight.set(userId, refreshPromise);
  return refreshPromise;
}

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(
  pinoHttp({
    logger,
    customLogLevel: (req, res) => {
      if (res.statusCode >= 400) return 'error';
      return 'info';
    },
    customSuccessMessage: (req, res) => {
      return `${req.method} ${req.url} - ${res.statusCode}`;
    },
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
  })
);

app.use(cors());
app.use(express.json());

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /connect
 * Returns OAuth authorization URL with signed state
 */
app.get('/connect', (req, res) => {
  try {
    const signedState = generateSignedState();
    const params = new URLSearchParams({
      client_id: HUBSPOT_CLIENT_ID,
      redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:3001'}/callback`,
      state: signedState,
      scope: 'crm.objects.contacts.read',
    });
    
    const authorizeUrl = `${HUBSPOT_AUTH_URL}?${params.toString()}`;
    
    req.log.info(
      {
        event: 'oauth_flow_started',
        route: '/connect',
        stateLength: signedState.length,
      },
      'OAuth flow initiated'
    );
    
    res.json({ authorizeUrl });
  } catch (error) {
    req.log.error(
      {
        event: 'oauth_flow_error',
        route: '/connect',
        error: error.message,
      },
      'Failed to generate authorize URL'
    );
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

/**
 * GET /callback
 * OAuth callback - validates state, exchanges code for tokens
 */
app.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      req.log.warn(
        {
          event: 'callback_missing_params',
          route: '/callback',
          hasCode: !!code,
          hasState: !!state,
        },
        'Missing code or state'
      );
      return res.status(400).json({ error: 'Missing code or state' });
    }
    
    // Validate signed state
    if (!validateSignedState(state)) {
      req.log.warn(
        {
          event: 'callback_invalid_state',
          route: '/callback',
          stateLength: state.length,
        },
        'Invalid or expired state'
      );
      return res.status(400).json({ error: 'Invalid or expired state' });
    }
    
    req.log.info(
      {
        event: 'callback_state_validated',
        route: '/callback',
      },
      'State validated successfully'
    );
    
    // Exchange code for tokens
    const tokenResponse = await axios.post(HUBSPOT_TOKEN_URL, {
      grant_type: 'authorization_code',
      client_id: HUBSPOT_CLIENT_ID,
      client_secret: HUBSPOT_CLIENT_SECRET,
      redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:3001'}/callback`,
      code,
    });
    
    const userId = getUserIdFromState(state);
    const tokenData = {
      accessToken: tokenResponse.data.access_token,
      refreshToken: tokenResponse.data.refresh_token,
      expiresAt: Date.now() + tokenResponse.data.expires_in * 1000,
    };
    
    tokenStore.set(userId, tokenData);
    
    req.log.info(
      {
        event: 'callback_tokens_stored',
        route: '/callback',
        userId,
        expiresAt: new Date(tokenData.expiresAt).toISOString(),
      },
      'Tokens exchanged and stored'
    );
    
    // Store userId in session via redirect URL
    const redirectUrl = `${FRONTEND_URL}/?userId=${encodeURIComponent(userId)}`;
    res.redirect(redirectUrl);
  } catch (error) {
    req.log.error(
      {
        event: 'callback_error',
        route: '/callback',
        error: error.message,
        status: error.response?.status,
      },
      'Callback error occurred'
    );
    res.status(500).json({ error: 'Failed to exchange code for tokens' });
  }
});

/**
 * GET /contacts
 * Returns first 25 HubSpot contacts
 * Handles token refresh with single-flight pattern
 * On 401: refresh token and retry once
 */
app.get('/contacts', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { userId } = req.query;
    
    if (!userId) {
      req.log.warn(
        {
          event: 'contacts_missing_user',
          route: '/contacts',
          latency: Date.now() - startTime,
        },
        'Missing userId'
      );
      return res.status(400).json({ error: 'Missing userId' });
    }
    
    let token = tokenStore.get(userId);
    if (!token) {
      req.log.warn(
        {
          event: 'contacts_no_token',
          route: '/contacts',
          userId,
          latency: Date.now() - startTime,
        },
        'No token found for user'
      );
      return res.status(401).json({ error: 'Not connected to HubSpot' });
    }
    
    // Helper function to fetch contacts with current token
    const fetchContacts = async (accessToken) => {
      const response = await axios.get(
        `${HUBSPOT_API_BASE}/crm/v3/objects/contacts`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: {
            limit: 25,
            properties: ['firstname', 'lastname', 'email', 'phone'],
          },
        }
      );
      return response.data;
    };
    
    let contactsData;
    let refreshed = false;
    
    try {
      // Try fetching with current token
      contactsData = await fetchContacts(token.accessToken);
      
      req.log.info(
        {
          event: 'contacts_fetched',
          route: '/contacts',
          userId,
          latency: Date.now() - startTime,
          refreshed: false,
          contactCount: contactsData.results?.length || 0,
        },
        'Contacts fetched successfully'
      );
    } catch (error) {
      if (error.response?.status === 401) {
        req.log.info(
          {
            event: 'contacts_token_expired',
            route: '/contacts',
            userId,
            latency: Date.now() - startTime,
          },
          'Token expired, attempting refresh'
        );
        
        // Token expired, attempt single-flight refresh
        try {
          const refreshedToken = await refreshAccessToken(userId);
          token = refreshedToken;
          contactsData = await fetchContacts(refreshedToken.accessToken);
          refreshed = true;
          
          req.log.info(
            {
              event: 'contacts_fetched_after_refresh',
              route: '/contacts',
              userId,
              latency: Date.now() - startTime,
              refreshed: true,
              contactCount: contactsData.results?.length || 0,
            },
            'Contacts fetched after token refresh'
          );
        } catch (refreshError) {
          req.log.error(
            {
              event: 'contacts_refresh_failed',
              route: '/contacts',
              userId,
              latency: Date.now() - startTime,
              error: 'Token refresh failed',
            },
            'Failed to refresh token and retry'
          );
          return res.status(401).json({
            error: 'Authentication failed. Please reconnect.',
          });
        }
      } else {
        throw error;
      }
    }
    
    res.json(contactsData);
  } catch (error) {
    const latency = Date.now() - startTime;
    
    req.log.error(
      {
        event: 'contacts_error',
        route: '/contacts',
        latency,
        error: error.message,
        status: error.response?.status,
      },
      'Failed to fetch contacts'
    );
    
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch contacts',
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================================================
// ERROR HANDLING & SERVER START
// ============================================================================

app.use((err, req, res, next) => {
  logger.error(
    {
      event: 'unhandled_error',
      error: err.message,
      stack: err.stack,
    },
    'Unhandled error'
  );
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.info(
    {
      event: 'server_started',
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
    },
    `Backend server running on port ${PORT}`
  );
});

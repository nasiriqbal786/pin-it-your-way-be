import { ApiConfig } from '../../scripts/api-config.js';

export async function handler(event, context) {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  const apiConfig = new ApiConfig({ verbosity: 2 });
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { PINTEREST_APP_ID, PINTEREST_REDIRECT_URI } = process.env;

    if (!PINTEREST_APP_ID || !PINTEREST_REDIRECT_URI) {
      throw new Error('Missing Pinterest configuration');
    }

    // Generate random state for security
    const state = Math.random().toString(36).substring(2, 15);

    // Build Pinterest OAuth URL
    const scopes = ['boards:read', 'boards:write', 'pins:read', 'pins:write', 'user_accounts:read'];
    const authUrl = new URL('https://www.pinterest.com/oauth/');

    authUrl.searchParams.set('client_id', apiConfig.app_id);
    authUrl.searchParams.set('redirect_uri', apiConfig.redirect_uri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(','));
    authUrl.searchParams.set('state', state);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        authUrl: authUrl.toString(),
        state: state
      })
    };

  } catch (error) {
    console.error('Pinterest auth error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};

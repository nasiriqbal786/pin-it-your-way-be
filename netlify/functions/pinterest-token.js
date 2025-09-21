// Handle OAuth callback and exchange code for token
const axios = require('axios');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { PINTEREST_APP_ID, PINTEREST_APP_SECRET, PINTEREST_REDIRECT_URI } = process.env;
    
    if (!PINTEREST_APP_ID || !PINTEREST_APP_SECRET || !PINTEREST_REDIRECT_URI) {
      throw new Error('Missing Pinterest configuration');
    }

    // Handle GET request (OAuth callback from Pinterest)
    if (event.httpMethod === 'GET') {
      const { code, state, error } = event.queryStringParameters || {};
      
      if (error) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'text/html' },
          body: `
            <html><body>
              <script>
                window.opener.postMessage({
                  success: false, 
                  error: '${error}'
                }, '*');
                window.close();
              </script>
            </body></html>
          `
        };
      }

      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for access token
      const tokenResponse = await axios.post('https://api.pinterest.com/v5/oauth/token', {
        grant_type: 'authorization_code',
        client_id: PINTEREST_APP_ID,
        client_secret: PINTEREST_APP_SECRET,
        code: code,
        redirect_uri: PINTEREST_REDIRECT_URI
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      // Get user info
      const userResponse = await axios.get('https://api.pinterest.com/v5/user_account', {
        headers: {
          'Authorization': `Bearer ${tokenResponse.data.access_token}`
        }
      });

      // Return success to extension
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html><body>
            <script>
              window.opener.postMessage({
                success: true,
                token: '${tokenResponse.data.access_token}',
                refreshToken: '${tokenResponse.data.refresh_token || ''}',
                user: ${JSON.stringify(userResponse.data)}
              }, '*');
              window.close();
            </script>
          </body></html>
        `
      };
    }

    // Handle POST request (from extension for API calls)
    if (event.httpMethod === 'POST') {
      const { action, token, ...params } = JSON.parse(event.body);
      
      if (!token) {
        throw new Error('Access token required');
      }

      let response;
      
      switch (action) {
        case 'getBoards':
          response = await axios.get('https://api.pinterest.com/v5/boards', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              boards: response.data.items.map(board => ({
                id: board.id,
                name: board.name,
                description: board.description
              }))
            })
          };

        case 'createPin':
          const { boardId, imageUrl, title, description } = params;
          response = await axios.post('https://api.pinterest.com/v5/pins', {
            board_id: boardId,
            media_source: {
              source_type: 'image_url',
              url: imageUrl
            },
            title: title || 'Pinned via Pin It Your Way',
            description: description || ''
          }, {
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              pin: response.data
            })
          };

        default:
          throw new Error('Unknown action');
      }
    }

  } catch (error) {
    console.error('Pinterest token error:', error);
    
    // Handle Pinterest API errors
    if (error.response) {
      return {
        statusCode: error.response.status,
        headers,
        body: JSON.stringify({
          success: false,
          error: error.response.data.message || 'Pinterest API error'
        })
      };
    }

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

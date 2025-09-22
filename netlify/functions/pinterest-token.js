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

            console.log('OAuth callback received with code:', code, 'and state:', state);
            if (!code) {
                throw new Error('No authorization code received');
            }

            console.log('OAuth callback received with code:', code, 'and state:', state);

            // Exchange code for token
            const params = new URLSearchParams();
            params.append('grant_type', 'authorization_code');
            params.append('code', code);
            params.append('redirect_uri', PINTEREST_REDIRECT_URI);

            // 2) Build Basic Auth header
            const basicAuth = Buffer.from(
                `${PINTEREST_APP_ID}:${PINTEREST_APP_SECRET}`
            ).toString('base64');

            // 3) Exchange code for token
            const tokenResponse = await axios({
                method: 'post',
                url: 'https://api.pinterest.com/v5/oauth/token',
                data: params.toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'Authorization': `Basic ${basicAuth}`
                }
            });


            // Get user info
            const userResponse = await axios.get('https://api.pinterest.com/v5/user_account', {
                headers: {
                    'Authorization': `Bearer ${tokenResponse.data.access_token}`
                }
            });

            // Return data safely via postMessage
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
                                expiresIn: ${tokenResponse.data.expires_in || 0},
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
                case 'refreshToken':
                    if (!params.refreshToken) {
                        throw new Error('Refresh token required');
                    }

                    const refreshParams = new URLSearchParams();
                    refreshParams.append('grant_type', 'refresh_token');
                    refreshParams.append('refresh_token', params.refreshToken);
                    refreshParams.append('client_id', PINTEREST_APP_ID);
                    refreshParams.append('client_secret', PINTEREST_APP_SECRET);

                    response = await axios.post(
                        'https://api.pinterest.com/v5/oauth/token',
                        refreshParams.toString(),
                        { headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' } }
                    );

                    return {
                        statusCode: 200,
                        headers,
                        body: JSON.stringify({
                            success: true,
                            accessToken: response.data.access_token,
                            refreshToken: response.data.refresh_token || params.refreshToken,
                            expiresIn: response.data.expires_in
                        })
                    };

                case 'getBoards':
                    if (!token) throw new Error('Access token required');
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
                    if (!token) throw new Error('Access token required');
                    const { boardId, imageUrl, title, description } = params;
                    response = await axios.post('https://api.pinterest.com/v5/pins', {
                        board_id: boardId,
                        media_source: { source_type: 'image_url', url: imageUrl },
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
        console.error('Pinterest token error:', error.response?.data || error.message);

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

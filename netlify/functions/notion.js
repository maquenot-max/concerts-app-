const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, x-notion-token',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      },
      body: ''
    };
  }

  const token = event.headers['x-notion-token'];
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Token manquant' }) };
  }

  // Extraire le path Notion depuis les query params
  const params = event.queryStringParameters || {};
  const notionPath = params.path || '/databases';
  const bodyData = event.body || null;

  const options = {
    hostname: 'api.notion.com',
    port: 443,
    path: '/v1' + notionPath,
    method: event.httpMethod,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, x-notion-token',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          },
          body: data
        });
      });
    });
    req.on('error', (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });
    if (bodyData) req.write(bodyData);
    req.end();
  });
};

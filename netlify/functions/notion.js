const https = require('https');

exports.handler = async function(event) {
  const raw = event.path || '';
  const path = raw
    .replace('/concerts-app/.netlify/functions/notion', '')
    .replace('/.netlify/functions/notion', '')
    || '/';

  const token = event.headers['x-notion-token'];

  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Token manquant' }) };
  }

  const notionPath = '/v1' + path + (event.rawQuery ? '?' + event.rawQuery : '');

  const options = {
    hostname: 'api.notion.com',
    port: 443,
    path: notionPath,
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
    if (event.body) req.write(event.body);
    req.end();
  });
};

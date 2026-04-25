const { getStore } = require('@netlify/blobs');

exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const store = getStore('concerts-app');
  const qs = event.queryStringParameters || {};
  const action = qs.action;

  try {
    // GET data
    if (event.httpMethod === 'GET') {
      if (action === 'concerts') {
        const raw = await store.get('concerts');
        return { statusCode: 200, headers, body: raw || '[]' };
      }
      if (action === 'taskstates') {
        const raw = await store.get('taskstates');
        return { statusCode: 200, headers, body: raw || '{}' };
      }
      if (action === 'process') {
        const raw = await store.get('process');
        return { statusCode: 200, headers, body: raw || 'null' };
      }
    }

    // POST/PUT — save data
    if (event.httpMethod === 'POST') {
      const body = event.body || '{}';
      if (action === 'concerts') {
        await store.set('concerts', body);
        return { statusCode: 200, headers, body: '{"ok":true}' };
      }
      if (action === 'taskstates') {
        await store.set('taskstates', body);
        return { statusCode: 200, headers, body: '{"ok":true}' };
      }
      if (action === 'process') {
        await store.set('process', body);
        return { statusCode: 200, headers, body: '{"ok":true}' };
      }
    }

    return { statusCode: 400, headers, body: '{"error":"Action inconnue"}' };

  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

export default async (req, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const store = context.blobs;

  try {
    if (req.method === 'GET') {
      const val = await store.get(action);
      return new Response(val || (action === 'taskstates' ? '{}' : '[]'), { status: 200, headers });
    }

    if (req.method === 'POST') {
      const body = await req.text();
      await store.set(action, body);
      return new Response('{"ok":true}', { status: 200, headers });
    }

    return new Response('{"error":"Methode inconnue"}', { status: 400, headers });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
};

export const config = { path: '/api' };

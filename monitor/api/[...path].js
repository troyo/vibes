export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  // Build the upstream URL from the catch-all path segments
  const pathSegments = req.query.path;
  if (!pathSegments || pathSegments.length === 0) {
    return res.status(400).json({ error: 'Missing API path' });
  }

  const apiPath = '/api/' + pathSegments.join('/');
  const upstream = new URL(apiPath, 'https://worldmonitor.app');

  // Forward query parameters (excluding the catch-all "path" param)
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path') {
      queryParams.set(key, Array.isArray(value) ? value[0] : value);
    }
  }
  const qs = queryParams.toString();
  if (qs) {
    upstream.search = qs;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const fetchOptions = {
      method: req.method,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WorldMonitor/1.0)',
        'Accept': 'application/json, */*',
      },
      redirect: 'follow',
    };

    // Forward POST body if present
    if (req.method === 'POST' && req.body) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(upstream.toString(), fetchOptions);
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream returned ${response.status}`,
      });
    }

    const contentType = response.headers.get('content-type') || 'application/json';
    const body = await response.text();

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(200).send(body);
  } catch (err) {
    const isTimeout = err.name === 'AbortError';
    res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'Request timed out' : 'Failed to fetch from upstream',
    });
  }
}

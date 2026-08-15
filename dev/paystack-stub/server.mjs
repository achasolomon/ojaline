import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 9202);
const transactions = new Map();
const webhooks = [];

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
  });
}

function paystackTx(reference, amount, email) {
  return {
    reference,
    amount,
    currency: 'NGN',
    email,
    status: 'initiated',
    access_code: `mock-${reference}`,
    authorization_url: `http://localhost:${PORT}/mock-checkout/${reference}`,
    created_at: new Date().toISOString(),
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/transaction/initialize') {
    let parsed;
    try {
      parsed = await readBody(req);
    } catch {
      return json(res, 400, { error: 'invalid JSON' });
    }
    const reference = parsed.reference ?? `mock-${randomUUID()}`;
    const tx = paystackTx(reference, parsed.amount ?? 0, parsed.email ?? 'test@ojaline.dev');
    transactions.set(reference, tx);
    return json(res, 200, { status: true, message: 'Authorization URL created', data: tx });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/transaction/verify/')) {
    const reference = decodeURIComponent(url.pathname.split('/').pop());
    const tx = transactions.get(reference);
    if (!tx) return json(res, 404, { status: false, message: 'Unknown transaction reference' });
    const success = url.searchParams.get('mock_success') !== 'false';
    const verified = { ...tx, status: success ? 'success' : 'abandoned' };
    transactions.set(reference, verified);
    return json(res, 200, { status: true, data: verified });
  }

  if (req.method === 'POST' && url.pathname === '/webhook') {
    let parsed;
    try {
      parsed = await readBody(req);
    } catch {
      return json(res, 400, { error: 'invalid JSON' });
    }
    webhooks.push({ ...parsed, received_at: new Date().toISOString() });
    const reference = parsed?.data?.reference;
    if (reference && transactions.has(reference)) {
      transactions.set(reference, { ...transactions.get(reference), status: 'success' });
    }
    return json(res, 200, { status: true });
  }

  if (req.method === 'GET' && url.pathname === '/captured') {
    return json(res, 200, { transactions: [...transactions.values()], webhooks });
  }

  return json(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => console.log(`[paystack-stub] listening on :${PORT}`));

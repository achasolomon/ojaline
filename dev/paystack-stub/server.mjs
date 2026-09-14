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

function paystackTx(reference, amount, email, callbackUrl) {
  return {
    reference,
    amount,
    currency: 'NGN',
    email,
    status: 'initiated',
    access_code: `mock-${reference}`,
    authorization_url: `http://localhost:${PORT}/mock-checkout/${reference}`,
    callback_url: callbackUrl ?? 'http://localhost:5173/orders',
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
    const tx = paystackTx(reference, parsed.amount ?? 0, parsed.email ?? 'test@ojaline.dev', parsed.callback_url);
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

  if (req.method === 'GET' && url.pathname.startsWith('/mock-checkout/')) {
    const reference = decodeURIComponent(url.pathname.split('/').pop());
    const tx = transactions.get(reference);
    if (!tx) return json(res, 404, { status: false, message: 'Unknown transaction reference' });
    const naira = `₦${((tx.amount ?? 0) / 100).toLocaleString('en-NG')}`;
    const cb = tx.callback_url;
    const sep = cb.includes('?') ? '&' : '?';
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Paystack (stub) checkout</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#eef2f7;color:#1a2b3c;display:grid;place-items:center;min-height:100vh}
  .card{background:#fff;border-radius:16px;box-shadow:0 12px 32px rgba(15,42,70,.14);padding:32px;width:min(420px,92vw);text-align:center}
  h1{font-size:18px;margin:0 0 4px}
  .amount{font-size:30px;font-weight:800;margin:18px 0 4px;color:#0b63ce}
  .ref{color:#8a97a5;font-size:12px;margin-bottom:24px}
  button,#cancel{display:block;width:100%;border:none;border-radius:10px;font-size:15px;font-weight:700;padding:13px;cursor:pointer;text-decoration:none}
  #pay{background:#0b63ce;color:#fff}
  #cancel{background:transparent;color:#5b6b7a;margin-top:10px;border:1px solid #d4dce5}
  .status{font-size:13px;margin-top:14px;color:#5b6b7a}
</style>
</head>
<body>
<div class="card">
  <h1>Paystack <span style="color:#8a97a5;font-weight:500">(stub)</span></h1>
  <div class="amount">${naira}</div>
  <div class="ref">Reference: ${tx.reference}</div>
  <button id="pay" type="button">Approve &amp; pay</button>
  <a id="cancel" href="${cb}${sep}status=abandoned&reference=${encodeURIComponent(reference)}">Cancel &amp; go back</a>
  <div class="status" id="status">This is a local test payment page — no real money moves.</div>
</div>
<script>
const btn = document.getElementById('pay');
const statusEl = document.getElementById('status');
btn.addEventListener('click', async () => {
  btn.disabled = true;
  statusEl.textContent = 'Confirming payment…';
  try {
    const res = await fetch('/mock-pay/' + encodeURIComponent('${reference}'), { method: 'POST' });
    const body = await res.json();
    if (!res.ok || body.status !== true) throw new Error(body.error || 'payment failed');
    statusEl.textContent = 'Payment confirmed — redirecting…';
    location.href = '${cb}${sep}status=success&reference=${encodeURIComponent(reference)}';
  } catch (err) {
    statusEl.textContent = 'Payment failed: ' + err.message + ' (is the API running on :3000?)';
    btn.disabled = false;
  }
});
</script>
</body>
</html>`;
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(html);
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

  if (req.method === 'POST' && url.pathname.startsWith('/mock-pay/')) {
    const reference = decodeURIComponent(url.pathname.split('/').pop());
    const tx = transactions.get(reference);
    if (!tx) return json(res, 404, { status: false, message: 'Unknown reference' });
    transactions.set(reference, { ...tx, status: 'success' });

    const webhookUrl = process.env.API_WEBHOOK_URL ?? 'http://host.docker.internal:3000/webhook/paystack';
    const payload = JSON.stringify({ event: 'charge.success', data: { reference, amount: tx.amount, currency: 'NGN', status: 'success' } });
    try {
      const u = new URL(webhookUrl);
      const httpMod = u.protocol === 'https:' ? await import('node:https') : await import('node:http');
      await new Promise((resolve, reject) => {
        const req2 = httpMod.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, (res2) => { res2.resume(); res2.on('end', resolve); });
        req2.on('error', reject);
        req2.write(payload);
        req2.end();
      });
    } catch (err) {
      return json(res, 502, { status: false, error: err.message });
    }
    return json(res, 200, { status: true, message: `webhook sent for ${reference}` });
  }

  if (req.method === 'GET' && url.pathname === '/captured') {
    return json(res, 200, { transactions: [...transactions.values()], webhooks });
  }

  return json(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => console.log(`[paystack-stub] listening on :${PORT}`));

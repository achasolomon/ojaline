import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 9201);
const sentMessages = [];
const ussdSessions = new Map();

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/healthz') {
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/v1/messages') {
    let parsed;
    try {
      parsed = await readBody(req);
    } catch {
      return json(res, 400, { error: 'invalid JSON' });
    }
    const recipients = Array.isArray(parsed.to) ? parsed.to : [];
    const sent = {
      message: parsed.message,
      to: recipients,
      from: parsed.from ?? 'OJALINE',
      sent_at: new Date().toISOString(),
    };
    sentMessages.push(sent);
    return json(res, 200, {
      SMSMessageData: {
        Recipients: recipients.map((number, i) => ({
          number,
          status: 'Success',
          cost: '1',
          messageId: `ats-mock-${sentMessages.length}-${i}`,
        })),
      },
    });
  }

  if (req.method === 'POST' && url.pathname === '/v1/ussd/input') {
    let parsed;
    try {
      parsed = await readBody(req);
    } catch {
      return json(res, 400, { error: 'invalid JSON' });
    }
    const sessionId = parsed.sessionId ?? randomSession();
    const text = parsed.text ?? '';
    const previous = ussdSessions.get(sessionId);
    ussdSessions.set(sessionId, text);
    const reply = previous === undefined ? 'CON Welcome to Ojaline\n1. Buy\n2. Sell' : 'END Coming in Sprint 1';
    return json(res, 200, { sessionId, message: reply });
  }

  if (req.method === 'GET' && url.pathname === '/captured') {
    return json(res, 200, { messages: sentMessages, sessions: [...ussdSessions.entries()] });
  }

  return json(res, 404, { error: 'not found' });
});

function randomSession() {
  return Math.random().toString(36).slice(2, 12);
}

server.listen(PORT, '0.0.0.0', () => console.log(`[ats-mock] listening on :${PORT}`));

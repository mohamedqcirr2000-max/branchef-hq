// api/check-envelopes.js
const crypto = require('crypto');

const C = {
  ik:  process.env.DS_INTEGRATION_KEY,
  uid: process.env.DS_USER_ID,
  aid: process.env.DS_ACCOUNT_ID,
  base: process.env.DS_BASE_URI || 'https://demo.docusign.net',
  key: process.env.DS_PRIVATE_KEY,
};

const host = () => /demo\./.test(C.base) ? 'account-d.docusign.com' : 'account.docusign.com';
const b64 = b => Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

function pem(k) {
  if (!k) return k;
  if (k.includes('\\n') && !k.includes('\n')) k = k.replace(/\\n/g, '\n');
  return k.trim();
}

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const p = b64(JSON.stringify({
    iss: C.ik, sub: C.uid, aud: host(),
    iat: now, exp: now + 3600, scope: 'signature impersonation',
  }));
  const s = crypto.createSign('RSA-SHA256');
  s.update(h + '.' + p);
  const jwt = h + '.' + p + '.' + b64(s.sign(pem(C.key)));

  const r = await fetch('https://' + host() + '/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('token ' + r.status + ' ' + JSON.stringify(j));
  return j.access_token;
}

async function handler(req, res) {
  const miss = ['ik', 'uid', 'aid', 'key'].filter(k => !C[k]);
  if (miss.length) return res.status(500).json({ error: 'Missing env: ' + miss.join(', ') });

  try {
    const t = await token();
    const from = new Date(Date.now() - 7 * 864e5).toISOString();
    const url = C.base + '/restapi/v2.1/accounts/' + C.aid + '/envelopes'
      + '?from_date=' + encodeURIComponent(from)
      + '&status=sent,delivered,completed,declined,voided';

    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t } });
    const d = await r.json();
    if (!r.ok) throw new Error('list ' + r.status + ' ' + JSON.stringify(d));

    const envelopes = (d.envelopes || []).map(e => ({
      envelopeId: e.envelopeId,
      status: e.status,
      subject: e.emailSubject,
      changedAt: e.statusChangedDateTime,
      completedAt: e.completedDateTime || null,
    }));

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, count: envelopes.length, envelopes });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}

module.exports = handler;

// api/_docusign.js
// Shared DocuSign plumbing. Nothing here is exposed as a route — the two
// endpoints import it. The private key never leaves the server.

const crypto = require('crypto');

const CFG = {
  integrationKey: process.env.DS_INTEGRATION_KEY,
  userId:         process.env.DS_USER_ID,
  accountId:      process.env.DS_ACCOUNT_ID,
  templateId:     process.env.DS_TEMPLATE_ID,
  baseUri:        process.env.DS_BASE_URI || 'https://demo.docusign.net',
  privateKey:     process.env.DS_PRIVATE_KEY,
};

/* demo keys talk to account-d, production keys to account.docusign.com */
function authHost(){
  return /demo\./.test(CFG.baseUri) ? 'account-d.docusign.com' : 'account.docusign.com';
}

function missingConfig(){
  return ['integrationKey','userId','accountId','templateId','privateKey']
    .filter(k => !CFG[k])
    .map(k => 'DS_' + k.replace(/[A-Z]/g, c => '_' + c).toUpperCase());
}

const b64url = buf =>
  Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

/* Vercel stores the key with literal \n when pasted on one line — accept both. */
function normalizeKey(k){
  let key = String(k || '').trim();
  if (key.indexOf('\\n') >= 0 && key.indexOf('\n') < 0) key = key.replace(/\\n/g, '\n');
  return key;
}

let cached = { token: null, expires: 0 };

async function getToken(){
  if (cached.token && Date.now() < cached.expires - 60000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg:'RS256', typ:'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: CFG.integrationKey,
    sub: CFG.userId,
    aud: authHost(),
    iat: now,
    exp: now + 3600,
    scope: 'signature impersonation'
  }));

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + payload);
  const signature = b64url(signer.sign(normalizeKey(CFG.privateKey)));
  const assertion = header + '.' + payload + '.' + signature;

  const res = await fetch('https://' + authHost() + '/oauth/token', {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    /* the first call after creating a key always fails until consent is granted */
    if (body.error === 'consent_required') {
      const err = new Error('consent_required');
      err.consentUrl = 'https://' + authHost() + '/oauth/auth'
        + '?response_type=code&scope=signature%20impersonation'
        + '&client_id=' + CFG.integrationKey
        + '&redirect_uri=' + encodeURIComponent('https://branchef.team/api/docusign-callback');
      throw err;
    }
    throw new Error('DocuSign auth failed: ' + (body.error_description || body.error || res.status));
  }

  cached = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return cached.token;
}

async function ds(path, options = {}){
  const token = await getToken();
  const res = await fetch(
    CFG.baseUri + '/restapi/v2.1/accounts/' + CFG.accountId + path,
    Object.assign({}, options, {
      headers: Object.assign({
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      }, options.headers || {})
    })
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('DocuSign ' + res.status + ': ' + (body.message || JSON.stringify(body)));
  return body;
}

module.exports = { CFG, ds, getToken, missingConfig };

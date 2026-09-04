// api/send-contract.js
// Called by the sales team from branchef.team. Verifies who is asking,
// then sends the partner agreement from the template.

const { CFG, ds, missingConfig } = require('./_docusign');

/* Only these people may send an agreement. The browser proves who it is with a
   Firebase ID token; without this check anyone could send contracts as BranChef. */
const ALLOWED = [
  'simo.chatei@getbranchef.com',
  'nadirkassimi@getbranchef.com',
  'saber@getbranchef.com',
  'nadege@getbranchef.com',
  'sophia@getbranchef.com'
];

async function verifyCaller(idToken){
  if (!idToken) throw new Error('not signed in');
  const res = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyAofsIEnR6WclsU0ELmv8L_vd4mkfn8EuY',
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ idToken }) }
  );
  const body = await res.json().catch(() => ({}));
  const user = body.users && body.users[0];
  if (!user || !user.email) throw new Error('could not verify your session');
  const email = String(user.email).toLowerCase();
  if (ALLOWED.indexOf(email) < 0) throw new Error('your account cannot send agreements');
  return email;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error:'POST only' });

  const gaps = missingConfig();
  if (gaps.length) {
    return res.status(500).json({ error:'Missing on Vercel: ' + gaps.join(', ') });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { idToken, restaurantName, ownerName, ownerEmail, brands, leadId } = body;

    const sender = await verifyCaller(idToken);

    if (!restaurantName || !ownerName || !ownerEmail) {
      return res.status(400).json({ error:'restaurant, owner and email are required' });
    }

    const envelope = await ds('/envelopes', {
      method:'POST',
      body: JSON.stringify({
        templateId: CFG.templateId,
        status: 'sent',
        emailSubject: 'BranChef — Partner Agreement for ' + restaurantName,
        templateRoles: [{
          roleName: 'Partner',          // must match the Role on the template
          name: ownerName,
          email: ownerEmail
        }],
        /* per-envelope webhook: works on any plan, and only fires for
           envelopes this app sent */
        eventNotification: {
          url: 'https://branchef.team/api/docusign-webhook',
          requireAcknowledgment: 'true',
          loggingEnabled: 'true',
          envelopeEvents: [
            { envelopeEventStatusCode: 'delivered' },
            { envelopeEventStatusCode: 'completed' },
            { envelopeEventStatusCode: 'declined' },
            { envelopeEventStatusCode: 'voided' }
          ],
          recipientEvents: [
            { recipientEventStatusCode: 'Delivered' },
            { recipientEventStatusCode: 'Completed' }
          ],
          eventData: { version: 'restv2.1', format: 'json', includeData: ['custom_fields'] }
        },
        customFields: {
          textCustomFields: [
            { name:'leadId',         value: leadId || '' },
            { name:'restaurantName', value: restaurantName },
            { name:'brands',         value: (brands || []).join(', ') },
            { name:'sentBy',         value: sender }
          ]
        }
      })
    });

    return res.status(200).json({
      ok: true,
      envelopeId: envelope.envelopeId,
      status: envelope.status,
      sentTo: ownerEmail
    });

  } catch (e) {
    /* the very first send needs one-time consent — hand back the link */
    if (e.message === 'consent_required') {
      return res.status(428).json({ error:'consent_required', consentUrl: e.consentUrl });
    }
    return res.status(400).json({ error: e.message || 'failed to send' });
  }
};

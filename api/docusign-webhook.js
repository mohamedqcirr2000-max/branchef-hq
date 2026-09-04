// api/docusign-webhook.js
// DocuSign calls this when the restaurant opens or signs the agreement.
// It writes straight to Firestore, so the dashboards move on their own.

const PROJECT = 'branchef-app';
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';

/* Firestore's REST API wants typed values */
const sv = v =>
  typeof v === 'number'  ? { integerValue: String(v) } :
  typeof v === 'boolean' ? { booleanValue: v } :
                           { stringValue: String(v == null ? '' : v) };

async function patchDoc(collection, id, fields){
  const keys = Object.keys(fields);
  const url = FS + '/' + collection + '/' + id + '?'
    + keys.map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const body = { fields: {} };
  keys.forEach(k => { body.fields[k] = sv(fields[k]); });
  const res = await fetch(url, {
    method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  return res.ok;
}

async function addDoc(collection, fields){
  const body = { fields: {} };
  Object.keys(fields).forEach(k => { body.fields[k] = sv(fields[k]); });
  await fetch(FS + '/' + collection, {
    method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
}

function customField(data, name){
  const list = (data.customFields && data.customFields.textCustomFields) || [];
  const hit = list.filter(f => f.name === name)[0];
  return hit ? hit.value : '';
}

module.exports = async (req, res) => {
  /* DocuSign retries hard on a non-200, so answer quickly and never throw */
  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const event = payload.event || '';
    const data  = payload.data  || {};
    const env   = data.envelopeSummary || {};

    const leadId   = customField(env, 'leadId');
    const restName = customField(env, 'restaurantName') || 'a restaurant';

    /* envelope-delivered means it was opened; completed means it was signed */
    let status = null, note = null;
    if (event === 'envelope-delivered' || event === 'recipient-delivered') {
      status = 'viewed';
      note   = restName + ' opened the agreement';
    } else if (event === 'envelope-completed') {
      status = 'signed';
      note   = '✍️ ' + restName + ' SIGNED the agreement — Nadir, ship the tablet';
    } else if (event === 'envelope-declined') {
      status = 'rejected';
      note   = '❌ ' + restName + ' declined the agreement';
    } else if (event === 'envelope-voided') {
      status = 'rejected';
      note   = restName + ' — agreement voided';
    }

    if (status && leadId) {
      await patchDoc('leads', leadId, {
        status: status,
        envelopeId: data.envelopeId || '',
        lastEvent: event,
        lastEventAt: new Date().toISOString()
      });
    }

    if (note) {
      await addDoc('notifications', {
        type: status === 'signed' ? 'signed' : 'docusign',
        message: note,
        read: false,
        createdBy: 'DocuSign',
        createdAt: new Date().toISOString()
      });
    }

    return res.status(200).json({ ok:true });
  } catch (e) {
    /* still 200 — a failure here would make DocuSign retry for days */
    return res.status(200).json({ ok:false, note: e.message });
  }
};

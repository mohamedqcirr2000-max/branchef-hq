// api/docusign-templates.js
// Lists the templates on the connected DocuSign account with their real IDs.
// Handy once — the template ID is not easy to find in the DocuSign UI.

const { ds, CFG, missingConfig } = require('./_docusign');

module.exports = async (req, res) => {
  const gaps = missingConfig().filter(k => k !== 'DS_TEMPLATE_ID');
  if (gaps.length) return res.status(500).json({ error:'Missing on Vercel: ' + gaps.join(', ') });

  try {
    /* the list endpoint returns a summary without recipients, so read each
       template on its own to see the real role names */
    const list = await ds('/templates?count=50');
    const templates = [];
    for (const tpl of (list.envelopeTemplates || [])) {
      let roles = [], tabs = 0;
      try {
        const full = await ds('/templates/' + tpl.templateId);
        const signers = (full.recipients && full.recipients.signers) || [];
        roles = signers.map(s => s.roleName || '(no role name)');
        signers.forEach(s => {
          const t = s.tabs || {};
          Object.keys(t).forEach(k => { if (Array.isArray(t[k])) tabs += t[k].length; });
        });
      } catch (err) { roles = ['(could not read: ' + err.message + ')']; }
      templates.push({ name: tpl.name, templateId: tpl.templateId, roles, signingFields: tabs });
    }

    return res.status(200).json({
      account: CFG.accountId,
      currentlyConfigured: CFG.templateId || '(not set)',
      matchesATemplate: templates.some(t => t.templateId === CFG.templateId),
      readyToSend: templates.some(t =>
        t.templateId === CFG.templateId && t.roles.indexOf('Partner') >= 0 && t.signingFields > 0),
      templates
    });
  } catch (e) {
    if (e.message === 'consent_required') {
      return res.status(428).json({ error:'consent_required', consentUrl: e.consentUrl });
    }
    return res.status(400).json({ error: e.message });
  }
};

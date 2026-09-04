// api/docusign-templates.js
// Lists the templates on the connected DocuSign account with their real IDs.
// Handy once — the template ID is not easy to find in the DocuSign UI.

const { ds, CFG, missingConfig } = require('./_docusign');

module.exports = async (req, res) => {
  const gaps = missingConfig().filter(k => k !== 'DS_TEMPLATE_ID');
  if (gaps.length) return res.status(500).json({ error:'Missing on Vercel: ' + gaps.join(', ') });

  try {
    const list = await ds('/templates?count=50');
    const templates = (list.envelopeTemplates || []).map(tpl => ({
      name: tpl.name,
      templateId: tpl.templateId,
      roles: (tpl.recipients && tpl.recipients.signers || []).map(s => s.roleName)
    }));

    return res.status(200).json({
      account: CFG.accountId,
      currentlyConfigured: CFG.templateId || '(not set)',
      matchesATemplate: templates.some(t => t.templateId === CFG.templateId),
      templates
    });
  } catch (e) {
    if (e.message === 'consent_required') {
      return res.status(428).json({ error:'consent_required', consentUrl: e.consentUrl });
    }
    return res.status(400).json({ error: e.message });
  }
};

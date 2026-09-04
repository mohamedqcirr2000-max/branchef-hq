// api/docusign-callback.js
// Where DocuSign lands after you grant consent to the app, once, ever.

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(`<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BranChef — DocuSign connected</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F7F6FA;
       display:grid;place-items:center;min-height:100vh;margin:0;color:#14131A}
  .box{background:#fff;border:1px solid #ECEAF2;border-radius:18px;padding:40px;
       max-width:440px;text-align:center;box-shadow:0 8px 24px rgba(20,19,26,.07)}
  h1{font-size:20px;margin:0 0 10px}
  p{color:#4A4856;font-size:14px;line-height:1.7;margin:0 0 22px}
  a{display:inline-block;background:linear-gradient(135deg,#9B59FF,#FF6FD8);color:#fff;
    text-decoration:none;padding:11px 22px;border-radius:11px;font-weight:600;font-size:14px}
</style>
<div class="box">
  <h1>DocuSign is connected</h1>
  <p>BranChef HQ can now send partner agreements. You only ever have to do this once.</p>
  <a href="https://branchef.team">Back to BranChef HQ</a>
</div>`);
};

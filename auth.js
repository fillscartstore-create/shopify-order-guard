const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const router = express.Router();

const SCOPES = 'read_orders,write_orders';

function verifyHmac(query, secret) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${Array.isArray(rest[key]) ? rest[key].join(',') : rest[key]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hmac, 'hex'));
  } catch {
    return false;
  }
}

// Step 1: Shopify hits "/" (or "/auth") with ?shop=xxx.myshopify.com&hmac=...
// We verify it and redirect the merchant to Shopify's permission screen.
router.get(['/', '/auth'], (req, res, next) => {
  const { shop } = req.query;
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  if (!shop) {
    // Not an install request (e.g. someone just visiting the URL directly)
    return res.status(200).send('Shopify Order Guard is running.');
  }

  if (!apiKey || !apiSecret) {
    return res.status(500).send('Server misconfigured: SHOPIFY_API_KEY / SHOPIFY_API_SECRET missing.');
  }

  if (req.query.hmac && !verifyHmac(req.query, apiSecret)) {
    return res.status(400).send('Invalid request signature.');
  }

  const redirectUri = `https://${req.get('host')}/auth/callback`;
  const state = crypto.randomBytes(16).toString('hex');
  const installUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  res.redirect(installUrl);
});

// Step 2: Shopify redirects back here with a temporary "code" after merchant approves.
// We exchange it for a permanent Admin API access token and show it on screen.
router.get('/auth/callback', async (req, res) => {
  const { shop, code, hmac } = req.query;
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  if (!shop || !code) {
    return res.status(400).send('Missing shop or code.');
  }
  if (hmac && !verifyHmac(req.query, apiSecret)) {
    return res.status(400).send('Invalid request signature.');
  }

  try {
    const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    });
    const accessToken = tokenRes.data.access_token;

    res.status(200).send(`
      <html>
        <body style="font-family: sans-serif; padding: 40px; max-width: 700px; margin: auto;">
          <h2>✅ App installed successfully!</h2>
          <p><b>Store:</b> ${shop}</p>
          <p><b>Copy this Admin API access token</b> and paste it into Render's
          <code>SHOPIFY_ADMIN_ACCESS_TOKEN</code> environment variable, and set
          <code>SHOPIFY_STORE_DOMAIN</code> to <code>${shop}</code>:</p>
          <textarea readonly style="width:100%; height:60px; font-size:16px; padding:10px;">${accessToken}</textarea>
          <p style="color:#888; margin-top:20px;">You can close this page after copying the token.</p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('OAuth token exchange failed:', err.response?.data || err.message);
    res.status(500).send('Failed to complete installation. Check server logs.');
  }
});

module.exports = router;

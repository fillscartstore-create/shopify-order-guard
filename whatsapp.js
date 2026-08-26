const axios = require('axios');
const config = require('./config');

const GRAPH_URL = `https://graph.facebook.com/v20.0/${config.whatsapp.phoneNumberId}/messages`;

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function sendTemplateMessage(toPhone, templateParams = []) {
  const payload = {
    messaging_product: 'whatsapp',
    to: toPhone.replace('+', ''),
    type: 'template',
    template: {
      name: config.whatsapp.templateName,
      language: { code: config.whatsapp.languageCode },
      components: templateParams.length
        ? [{ type: 'body', parameters: templateParams.map((p) => ({ type: 'text', text: String(p) })) }]
        : [],
    },
  };

  const { data } = await axios.post(GRAPH_URL, payload, {
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  return data;
}

async function sendTextMessage(toPhone, body) {
  const payload = {
    messaging_product: 'whatsapp',
    to: toPhone.replace('+', ''),
    type: 'text',
    text: { body },
  };
  const { data } = await axios.post(GRAPH_URL, payload, {
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  return data;
}

// Bulk send with delay to respect Meta rate limits, returns per-order results
async function sendBulk(recipients, buildParams, delayMs) {
  const results = [];
  for (const r of recipients) {
    try {
      const params = buildParams ? buildParams(r) : [];
      const res = await sendTemplateMessage(r.phone, params);
      results.push({ order_id: r.order_id, phone: r.phone, ok: true, messageId: res?.messages?.[0]?.id });
    } catch (err) {
      results.push({
        order_id: r.order_id,
        phone: r.phone,
        ok: false,
        error: err.response?.data || err.message,
      });
    }
    await sleep(delayMs);
  }
  return results;
}

module.exports = { sendTemplateMessage, sendTextMessage, sendBulk };

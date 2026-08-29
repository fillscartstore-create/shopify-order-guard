const express = require('express');
const crypto = require('crypto');
const config = require('./config');
const shopify = require('./shopify');
const { evaluateOrder } = require('./fraudDetection');
const { normalizePhone, upsertOrder, setStatus, logEvent } = require('./db');

const router = express.Router();

// IMPORTANT: this route must receive the RAW body for HMAC verification.
// It is mounted with express.raw() in index.js, not express.json().
function verifyShopifyWebhook(req) {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  if (!hmacHeader || !config.shopify.webhookSecret) return false;
  const digest = crypto
    .createHmac('sha256', config.shopify.webhookSecret)
    .update(req.body) // raw Buffer
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

function parseOrderFromRawBody(req) {
  return JSON.parse(req.body.toString('utf8'));
}

function toDbRow(order, status, cityValid = 1) {
  const rawPhone = order.phone || order.customer?.phone || order.shipping_address?.phone;
  return {
    order_id: String(order.id),
    order_number: String(order.order_number || order.name || ''),
    phone: normalizePhone(rawPhone),
    email: (order.email || order.customer?.email || '').trim().toLowerCase(),
    customer_name: `${order.shipping_address?.first_name || order.customer?.first_name || ''} ${order.shipping_address?.last_name || order.customer?.last_name || ''}`.trim(),
    city: order.shipping_address?.city || '',
    city_valid: cityValid ? 1 : 0,
    ip_address: order.browser_ip || '',
    status,
    financial_status: order.financial_status || '',
    total_price: order.total_price || '',
    tags: order.tags || '',
    created_at: order.created_at || new Date().toISOString(),
    updated_at: order.updated_at || new Date().toISOString(),
  };
}

// ---- 1) orders/create ----
router.post('/orders-create', async (req, res) => {
  if (!verifyShopifyWebhook(req)) return res.status(401).send('Invalid signature');
  res.status(200).send('ok'); // ack fast, Shopify requires quick response

  try {
    const order = parseOrderFromRawBody(req);
    const verdict = await evaluateOrder(order);

    if (verdict.verdict === 'blocked_in_process') {
      await upsertOrder(toDbRow(order, 'blocked', verdict.cityValid));
      const dupTags = (verdict.matchedOrders || []).slice(0, 5).map((m) => `dup-order-${m.split('(')[0]}`);
      await shopify.addTags(order.id, order.tags, [config.app.blockedTag, 'duplicate-in-process', ...dupTags]);
      await logEvent(order.id, 'blocked_in_process', verdict.reasons);
      await shopify.cancelOrder(order.id, 'other');
      await setStatus(String(order.id), 'cancelled');
      return;
    }

    if (verdict.verdict === 'blocked_invalid_city') {
      // City spelling mismatch is flagged for manual review only — never auto-cancelled.
      // Only duplicate/in-process orders (handled above) are cancelled automatically.
      await upsertOrder(toDbRow(order, 'blocked', false));
      await shopify.addTags(order.id, order.tags, ['invalid-city', 'needs-review']);
      await logEvent(order.id, 'flagged_invalid_city', verdict.reasons);
      return;
    }

    if (verdict.verdict === 'duplicate') {
      await upsertOrder(toDbRow(order, 'processing', verdict.cityValid));
      const dupTags = (verdict.matchedOrders || []).slice(0, 5).map((m) => `dup-order-${m.split('(')[0]}`);
      await shopify.addTags(order.id, order.tags, ['possible-duplicate', ...dupTags]);
      await logEvent(order.id, 'flagged_duplicate', verdict.reasons);
      return;
    }

    if (verdict.verdict === 'suspicious') {
      await upsertOrder(toDbRow(order, 'processing', verdict.cityValid));
      await shopify.addTags(order.id, order.tags, ['needs-review']);
      await logEvent(order.id, 'flagged_suspicious', verdict.reasons);
      return;
    }

    // ok
    await upsertOrder(toDbRow(order, 'processing', true));
    await logEvent(order.id, 'order_ok', verdict.reasons);
  } catch (err) {
    console.error('orders-create webhook error:', err.message);
  }
});

// ---- 4) orders/updated -> auto-cancel when "cancelled" tag appears ----
router.post('/orders-updated', async (req, res) => {
  if (!verifyShopifyWebhook(req)) return res.status(401).send('Invalid signature');
  res.status(200).send('ok');

  try {
    const order = parseOrderFromRawBody(req);
    const tags = (order.tags || '').toLowerCase().split(',').map((t) => t.trim());

    await upsertOrder(toDbRow(order, order.cancelled_at ? 'cancelled' : 'processing'));

    if (tags.includes(config.app.cancelTriggerTag) && !order.cancelled_at) {
      await shopify.cancelOrder(order.id, 'customer');
      await setStatus(String(order.id), 'cancelled');
      await logEvent(order.id, 'auto_cancelled_from_tag', config.app.cancelTriggerTag);
    }
  } catch (err) {
    console.error('orders-updated webhook error:', err.message);
  }
});

module.exports = router;

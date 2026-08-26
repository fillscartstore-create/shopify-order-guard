const express = require('express');
const config = require('./config');
const shopify = require('./shopify');
const whatsapp = require('./whatsapp');
const { getUnconfirmedOrders, setStatus, logEvent, upsertOrder, normalizePhone } = require('./db');
const { requireAuth } = require('./authHelpers');

const router = express.Router();

// POST /bulk-confirm/run
// Sends WhatsApp confirmation template to every order currently marked "processing"
// and not yet tagged as sent. Body: { orderIds?: string[] } to limit to specific orders.
router.post('/run', requireAuth, async (req, res) => {
  try {
    const { orderIds } = req.body || {};
    let candidates = await getUnconfirmedOrders();
    if (Array.isArray(orderIds) && orderIds.length) {
      const set = new Set(orderIds.map(String));
      candidates = candidates.filter((o) => set.has(o.order_id));
    }
    candidates = candidates.filter((o) => o.phone);

    if (candidates.length === 0) {
      return res.json({ sent: 0, message: 'No eligible orders to confirm.' });
    }

    const results = await whatsapp.sendBulk(
      candidates,
      (o) => [o.customer_name || 'Customer', o.order_number, o.total_price],
      config.app.bulkSendDelayMs
    );

    for (const r of results) {
      if (r.ok) {
        try {
          const order = await shopify.getOrder(r.order_id);
          await shopify.addTags(r.order_id, order.tags, [config.app.confirmedSentTag]);
        } catch (e) {
          console.error('tag update failed for', r.order_id, e.message);
        }
        await logEvent(r.order_id, 'confirmation_sent', r.messageId);
      } else {
        await logEvent(r.order_id, 'confirmation_send_failed', r.error);
      }
    }

    res.json({
      sent: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    console.error('bulk-confirm error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /bulk-confirm/pending - preview which orders would be messaged
router.get('/pending', requireAuth, async (req, res) => {
  const all = await getUnconfirmedOrders();
  const candidates = all.filter((o) => o.phone);
  res.json({ count: candidates.length, orders: candidates });
});

module.exports = router;

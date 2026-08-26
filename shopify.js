const axios = require('axios');
const config = require('./config');

const client = axios.create({
  baseURL: `https://${config.shopify.domain}/admin/api/${config.shopify.apiVersion}`,
  headers: {
    'X-Shopify-Access-Token': config.shopify.token,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

async function getOrder(orderId) {
  const { data } = await client.get(`/orders/${orderId}.json`);
  return data.order;
}

async function cancelOrder(orderId, reason = 'customer') {
  // reason: customer | fraud | inventory | declined | other
  const { data } = await client.post(`/orders/${orderId}/cancel.json`, {
    reason,
    email: false,
    restock: true,
  });
  return data;
}

async function updateOrderTags(orderId, tagsArray) {
  const { data } = await client.put(`/orders/${orderId}.json`, {
    order: { id: orderId, tags: tagsArray.join(', ') },
  });
  return data.order;
}

async function addTags(orderId, currentTagsCsv, newTags) {
  const existing = (currentTagsCsv || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const merged = Array.from(new Set([...existing, ...newTags]));
  return updateOrderTags(orderId, merged);
}

async function listOpenOrders({ limit = 250, tag } = {}) {
  const params = { status: 'open', limit };
  if (tag) params.tag = tag;
  const { data } = await client.get('/orders.json', { params });
  return data.orders;
}

module.exports = {
  client,
  getOrder,
  cancelOrder,
  updateOrderTags,
  addTags,
  listOpenOrders,
};

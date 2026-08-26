const { normalizePhone, getRecentOrdersByAny, getActiveOrdersByAny } = require('./db');
const { validateCity } = require('./cityValidator');
const config = require('./config');

// Very basic Pakistani mobile number sanity check: +92 followed by 10 digits, starting 3
function isValidPakPhone(phone) {
  if (!phone) return false;
  return /^\+923\d{9}$/.test(phone);
}

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidName(name) {
  const n = (name || '').trim();
  if (n.length < 3) return false;
  if (/^(.)\1{2,}$/.test(n.replace(/\s/g, ''))) return false; // "aaaa", "xxxx"
  if (!/[a-zA-Z]/.test(n)) return false; // must contain letters
  return true;
}

function isSuspiciousAddress(order) {
  const addr = order?.shipping_address;
  if (!addr) return true;
  const line1 = (addr.address1 || '').trim();
  if (line1.length < 6) return true;
  if (/^(.)\1{4,}$/.test(line1.replace(/\s/g, ''))) return true;
  return false;
}

/**
 * Evaluate an incoming order for fraud/duplicate/spam signals.
 * Checks: phone, name, email, city (spelling), IP, address, and whether
 * this customer already has an order "in process".
 * Returns { verdict, phone, email, ip, city, cityValid, reasons: [] }
 */
async function evaluateOrder(shopifyOrder) {
  const reasons = [];

  const rawPhone = shopifyOrder?.phone || shopifyOrder?.customer?.phone || shopifyOrder?.shipping_address?.phone;
  const phone = normalizePhone(rawPhone);
  const email = (shopifyOrder?.email || shopifyOrder?.customer?.email || '').trim().toLowerCase();
  const ip = shopifyOrder?.browser_ip || null;
  const name = `${shopifyOrder?.shipping_address?.first_name || shopifyOrder?.customer?.first_name || ''} ${shopifyOrder?.shipping_address?.last_name || shopifyOrder?.customer?.last_name || ''}`.trim();
  const cityRaw = shopifyOrder?.shipping_address?.city || '';
  const cityCheck = validateCity(cityRaw);
  const orderId = String(shopifyOrder.id);

  if (!phone || !isValidPakPhone(phone)) reasons.push('invalid_or_missing_phone');
  if (!isValidEmail(email)) reasons.push('invalid_or_missing_email');
  if (!isValidName(name)) reasons.push('invalid_or_missing_name');
  if (isSuspiciousAddress(shopifyOrder)) reasons.push('suspicious_or_missing_address');
  if (!cityCheck.valid) reasons.push(`invalid_city_spelling:"${cityRaw}"`);
  if (!ip) reasons.push('missing_ip');

  const identity = { phone, email, ip };

  // Helper: describe which identity field(s) matched a given prior order
  function matchFields(o) {
    const f = [];
    if (phone && o.phone === phone) f.push('phone');
    if (email && o.email === email) f.push('email');
    if (ip && o.ip_address === ip) f.push('ip');
    return f.join('+');
  }

  // Rule: customer already has an order "in process" (match by phone OR email OR IP) -> block
  const activeOrders = await getActiveOrdersByAny(identity, orderId);
  if (activeOrders.length > 0) {
    const matchedOrderNumbers = activeOrders.map((o) => `${o.order_number || o.order_id}(${matchFields(o)})`);
    return {
      verdict: 'blocked_in_process',
      phone, email, ip, city: cityRaw, cityValid: cityCheck.valid,
      matchedOrders: matchedOrderNumbers,
      reasons: [...reasons, `existing_active_order:${matchedOrderNumbers.join(',')}`],
    };
  }

  // Invalid city spelling on its own is enough to block a new order
  if (!cityCheck.valid) {
    return {
      verdict: 'blocked_invalid_city',
      phone, email, ip, city: cityRaw, cityValid: false,
      reasons,
    };
  }

  // Repeat order (same phone/email/IP) within the 90-day (configurable) duplicate window -> flag
  const windowStart = new Date(Date.now() - config.app.duplicateWindowHours * 3600 * 1000).toISOString();
  const recent = await getRecentOrdersByAny(identity, windowStart, orderId);
  if (recent.length > 0) {
    const matchedOrderNumbers = recent.map((o) => `${o.order_number || o.order_id}(${matchFields(o)})`);
    reasons.push(`repeat_order_within_${config.app.duplicateWindowHours}h:${matchedOrderNumbers.join(',')}`);
    return { verdict: 'duplicate', phone, email, ip, city: cityRaw, cityValid: true, matchedOrders: matchedOrderNumbers, reasons };
  }

  if (reasons.length > 0) {
    return { verdict: 'suspicious', phone, email, ip, city: cityRaw, cityValid: cityCheck.valid, reasons };
  }

  return { verdict: 'ok', phone, email, ip, city: cityCheck.matched || cityRaw, cityValid: true, reasons: [] };
}

module.exports = { evaluateOrder, isValidPakPhone, isValidEmail, isValidName, isSuspiciousAddress };

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase's free Postgres
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id        TEXT PRIMARY KEY,
      order_number    TEXT,
      phone           TEXT,
      email           TEXT,
      customer_name   TEXT,
      city            TEXT,
      city_valid      INTEGER DEFAULT 1,
      ip_address      TEXT,
      status          TEXT DEFAULT 'processing',
      financial_status TEXT,
      total_price     TEXT,
      tags            TEXT,
      created_at      TEXT,
      updated_at      TEXT
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_ip ON orders(ip_address);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_log (
      id SERIAL PRIMARY KEY,
      order_id TEXT,
      event TEXT,
      detail TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('[db] tables ready');
}

function normalizePhone(raw) {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, '');
  if (p.startsWith('0')) p = '+92' + p.slice(1);
  else if (p.startsWith('92') && !p.startsWith('+')) p = '+' + p;
  else if (!p.startsWith('+')) p = '+' + p;
  return p;
}

async function upsertOrder(order) {
  await pool.query(
    `INSERT INTO orders (order_id, order_number, phone, email, customer_name, city, city_valid, ip_address, status, financial_status, total_price, tags, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (order_id) DO UPDATE SET
       order_number=$2, phone=$3, email=$4, customer_name=$5, city=$6, city_valid=$7,
       ip_address=$8, status=$9, financial_status=$10, total_price=$11, tags=$12, updated_at=$14`,
    [
      order.order_id, order.order_number, order.phone, order.email, order.customer_name,
      order.city, order.city_valid, order.ip_address, order.status, order.financial_status,
      order.total_price, order.tags, order.created_at, order.updated_at,
    ]
  );
}

async function getActiveOrdersByAny({ phone, email, ip }, excludeOrderId = null) {
  const { rows } = await pool.query(
    `SELECT * FROM orders
     WHERE status = 'processing'
       AND order_id != $1
       AND (
         (phone IS NOT NULL AND phone != '' AND phone = $2)
         OR (email IS NOT NULL AND email != '' AND email = $3)
         OR (ip_address IS NOT NULL AND ip_address != '' AND ip_address = $4)
       )
     ORDER BY created_at DESC`,
    [excludeOrderId || '', phone || '', email || '', ip || '']
  );
  return rows;
}

async function getRecentOrdersByAny({ phone, email, ip }, sinceIso, excludeOrderId = null) {
  const { rows } = await pool.query(
    `SELECT * FROM orders
     WHERE created_at >= $1
       AND order_id != $2
       AND (
         (phone IS NOT NULL AND phone != '' AND phone = $3)
         OR (email IS NOT NULL AND email != '' AND email = $4)
         OR (ip_address IS NOT NULL AND ip_address != '' AND ip_address = $5)
       )
     ORDER BY created_at DESC`,
    [sinceIso, excludeOrderId || '', phone || '', email || '', ip || '']
  );
  return rows;
}

async function setStatus(orderId, status) {
  await pool.query(`UPDATE orders SET status = $1, updated_at = $2 WHERE order_id = $3`, [
    status,
    new Date().toISOString(),
    orderId,
  ]);
}

async function logEvent(orderId, event, detail = '') {
  await pool.query(`INSERT INTO event_log (order_id, event, detail) VALUES ($1,$2,$3)`, [
    orderId,
    event,
    typeof detail === 'string' ? detail : JSON.stringify(detail),
  ]);
}

async function getUnconfirmedOrders() {
  const { rows } = await pool.query(`SELECT * FROM orders WHERE status = 'processing'`);
  return rows;
}

module.exports = {
  pool,
  initDb,
  normalizePhone,
  upsertOrder,
  getActiveOrdersByAny,
  getRecentOrdersByAny,
  setStatus,
  logEvent,
  getUnconfirmedOrders,
};

const express = require('express');
const { pool } = require('./db');
const { requireAuth } = require('./authHelpers');

const router = express.Router();
router.use(requireAuth);

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const STATUS_META = {
  processing: { color: '#3b82f6', bg: 'rgba(59,130,246,0.14)', icon: '⏳', label: 'Processing' },
  blocked:    { color: '#ef4444', bg: 'rgba(239,68,68,0.14)',  icon: '⛔', label: 'Blocked' },
  cancelled:  { color: '#9ca3af', bg: 'rgba(156,163,175,0.14)', icon: '✖',  label: 'Cancelled' },
  confirmed:  { color: '#22c55e', bg: 'rgba(34,197,94,0.14)',  icon: '✅', label: 'Confirmed' },
};

function statusPill(status) {
  const m = STATUS_META[status] || { color: '#9ca3af', bg: 'rgba(156,163,175,0.14)', icon: '•', label: status };
  return `<span class="pill" style="color:${m.color};background:${m.bg};">${m.icon} ${esc(m.label)}</span>`;
}

function tagChips(tagsCsv) {
  const tags = (tagsCsv || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!tags.length) return '<span class="muted">—</span>';
  return tags.slice(0, 3).map((t) => {
    const isWarn = /dup|block|invalid|suspicious|review/i.test(t);
    return `<span class="chip ${isWarn ? 'chip-warn' : ''}">${esc(t)}</span>`;
  }).join(' ') + (tags.length > 3 ? ` <span class="muted">+${tags.length - 3}</span>` : '');
}

router.get('/', async (req, res) => {
  try {
    const { rows: orders } = await pool.query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 300`);
    const { rows: statsRows } = await pool.query(`SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status`);
    const stats = { processing: 0, blocked: 0, cancelled: 0, confirmed: 0 };
    statsRows.forEach((r) => { stats[r.status] = r.count; });
    const total = statsRows.reduce((a, r) => a + r.count, 0);

    const { rows: dailyRows } = await pool.query(`
      SELECT to_char(date_trunc('day', created_at::timestamptz), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM orders
      WHERE created_at::timestamptz >= NOW() - INTERVAL '7 days'
      GROUP BY day ORDER BY day ASC
    `);
    const dayMap = {};
    dailyRows.forEach((r) => { dayMap[r.day] = r.count; });
    const chartDays = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      chartDays.push({ label: d.toLocaleDateString(undefined, { weekday: 'short' }), count: dayMap[key] || 0 });
    }
    const maxCount = Math.max(1, ...chartDays.map((d) => d.count));
    const barsHtml = chartDays.map((d) => {
      const h = Math.round((d.count / maxCount) * 80) + 4;
      return `<div class="bar-col">
        <div class="bar-val">${d.count}</div>
        <div class="bar" style="height:${h}px;"></div>
        <div class="bar-label">${esc(d.label)}</div>
      </div>`;
    }).join('');

    const msg = req.query.msg ? `<div class="banner">✅ ${esc(req.query.msg)}</div>` : '';

    const rowsHtml = orders.map((o) => `
      <tr data-status="${esc(o.status)}" data-search="${esc((o.order_number + ' ' + o.customer_name + ' ' + o.phone + ' ' + o.city).toLowerCase())}">
        <td class="mono">${esc(o.order_number || o.order_id)}</td>
        <td>${esc(o.customer_name) || '<span class="muted">—</span>'}</td>
        <td class="mono">${esc(o.phone) || '<span class="muted">—</span>'}</td>
        <td>${esc(o.city) || '<span class="muted">—</span>'}${o.city_valid ? '' : ' <span class="warn-dot" title="Invalid city spelling">⚠️</span>'}</td>
        <td>${statusPill(o.status)}</td>
        <td>${tagChips(o.tags)}</td>
        <td class="mono">${o.total_price ? 'Rs.' + esc(o.total_price) : '<span class="muted">—</span>'}</td>
        <td class="muted small">${new Date(o.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
      </tr>
    `).join('');

    res.status(200).send(`<!DOCTYPE html>
    <html>
    <head>
      <title>Order Guard — Dashboard</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        :root {
          --bg:#0b0d12; --panel:#12151c; --panel2:#171b24; --border:#232734;
          --text:#e8eaed; --muted:#8b93a3; --accent:#6366f1; --accent2:#8b5cf6;
        }
        * { box-sizing:border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif;
          background: radial-gradient(circle at 20% 0%, #171224 0%, var(--bg) 45%);
          color: var(--text); margin:0; padding:28px 32px 60px; min-height:100vh;
        }
        .topbar { display:flex; align-items:center; justify-content:space-between; margin-bottom:26px; flex-wrap:wrap; gap:12px; }
        .brand { display:flex; align-items:center; gap:12px; }
        .brand-icon { width:40px; height:40px; border-radius:12px; background:linear-gradient(135deg,var(--accent),var(--accent2)); display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 4px 14px rgba(99,102,241,0.35); }
        .brand h1 { font-size:19px; margin:0; letter-spacing:-0.02em; }
        .brand .sub { color:var(--muted); font-size:12.5px; display:flex; align-items:center; gap:6px; }
        .live-dot { width:7px; height:7px; border-radius:50%; background:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.2); display:inline-block; }

        .grid { display:grid; grid-template-columns: repeat(4, 1fr) 1.4fr; gap:14px; margin-bottom:22px; }
        @media (max-width: 980px) { .grid { grid-template-columns: repeat(2,1fr); } }

        .card { background:linear-gradient(160deg, var(--panel2), var(--panel)); border:1px solid var(--border); border-radius:14px; padding:16px 18px; position:relative; overflow:hidden; }
        .card .icon { font-size:18px; opacity:0.85; }
        .card .n { font-size:26px; font-weight:700; margin-top:6px; letter-spacing:-0.02em; }
        .card .l { font-size:12.5px; color:var(--muted); margin-top:2px; }
        .card .accent { position:absolute; top:0; left:0; right:0; height:3px; }

        .chart-card { grid-row: span 1; }
        .chart-title { font-size:12.5px; color:var(--muted); margin-bottom:10px; }
        .bars { display:flex; align-items:flex-end; gap:10px; height:110px; }
        .bar-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
        .bar-val { font-size:10.5px; color:var(--muted); margin-bottom:3px; }
        .bar { width:100%; max-width:22px; border-radius:5px 5px 0 0; background:linear-gradient(180deg,var(--accent2),var(--accent)); }
        .bar-label { font-size:10.5px; color:var(--muted); margin-top:6px; }

        .toolbar { display:flex; align-items:center; gap:10px; margin:22px 0 14px; flex-wrap:wrap; }
        .search { flex:1; min-width:200px; background:var(--panel); border:1px solid var(--border); border-radius:9px; padding:9px 14px; color:var(--text); font-size:13.5px; }
        .search:focus { outline:none; border-color:var(--accent); }
        select { background:var(--panel); border:1px solid var(--border); border-radius:9px; padding:9px 12px; color:var(--text); font-size:13.5px; }
        button.primary {
          background:linear-gradient(135deg,var(--accent),var(--accent2)); color:white; border:none;
          padding:10px 20px; border-radius:9px; font-size:13.5px; font-weight:600; cursor:pointer;
          box-shadow:0 4px 14px rgba(99,102,241,0.3); transition:transform .12s ease;
        }
        button.primary:hover { transform:translateY(-1px); }
        button.primary:disabled { opacity:0.55; cursor:not-allowed; transform:none; }
        button.ghost { background:transparent; border:1px solid var(--border); color:var(--text); padding:9px 14px; border-radius:9px; font-size:13px; cursor:pointer; }
        button.ghost:hover { border-color:var(--accent); }

        .table-wrap { background:var(--panel); border:1px solid var(--border); border-radius:14px; overflow:hidden; }
        table { width:100%; border-collapse:collapse; font-size:13px; }
        thead th { text-align:left; color:var(--muted); font-weight:600; font-size:11.5px; text-transform:uppercase; letter-spacing:0.04em; padding:12px 14px; border-bottom:1px solid var(--border); background:var(--panel2); position:sticky; top:0; }
        tbody td { padding:11px 14px; border-bottom:1px solid #1b1e27; }
        tbody tr:hover { background:rgba(99,102,241,0.05); }
        tbody tr:last-child td { border-bottom:none; }
        .mono { font-family: 'SF Mono', Consolas, monospace; font-size:12.5px; }
        .muted { color:var(--muted); }
        .small { font-size:11.5px; }
        .pill { padding:4px 10px; border-radius:20px; font-size:11.5px; font-weight:600; white-space:nowrap; }
        .chip { display:inline-block; background:rgba(148,163,184,0.14); color:#cbd5e1; padding:2px 8px; border-radius:6px; font-size:11px; margin-right:4px; }
        .chip-warn { background:rgba(239,68,68,0.14); color:#fca5a5; }
        .warn-dot { font-size:11px; }
        .banner { background:rgba(34,197,94,0.12); border:1px solid rgba(34,197,94,0.35); color:#86efac; padding:11px 16px; border-radius:10px; margin-bottom:16px; font-size:13.5px; }
        .empty { text-align:center; color:var(--muted); padding:40px; }
        .footer-note { color:var(--muted); font-size:12px; margin-top:16px; text-align:center; }
      </style>
    </head>
    <body>
      <div class="topbar">
        <div class="brand">
          <div class="brand-icon">🛡️</div>
          <div>
            <h1>Order Guard</h1>
            <div class="sub"><span class="live-dot"></span> Fillscart — live monitoring</div>
          </div>
        </div>
        <button class="ghost" onclick="location.reload()">↻ Refresh</button>
      </div>

      ${msg}

      <div class="grid">
        <div class="card"><div class="accent" style="background:${STATUS_META.processing.color}"></div><div class="icon">⏳</div><div class="n">${stats.processing}</div><div class="l">Processing</div></div>
        <div class="card"><div class="accent" style="background:${STATUS_META.blocked.color}"></div><div class="icon">⛔</div><div class="n">${stats.blocked}</div><div class="l">Blocked</div></div>
        <div class="card"><div class="accent" style="background:${STATUS_META.cancelled.color}"></div><div class="icon">✖</div><div class="n">${stats.cancelled}</div><div class="l">Cancelled</div></div>
        <div class="card"><div class="accent" style="background:${STATUS_META.confirmed.color}"></div><div class="icon">✅</div><div class="n">${stats.confirmed}</div><div class="l">Confirmed</div></div>
        <div class="card chart-card">
          <div class="chart-title">Orders — last 7 days</div>
          <div class="bars">${barsHtml}</div>
        </div>
      </div>

      <div class="toolbar">
        <input class="search" id="searchBox" placeholder="🔍 Search by name, phone, city, order #..." oninput="filterTable()">
        <select id="statusFilter" onchange="filterTable()">
          <option value="">All statuses</option>
          <option value="processing">Processing</option>
          <option value="blocked">Blocked</option>
          <option value="cancelled">Cancelled</option>
          <option value="confirmed">Confirmed</option>
        </select>
        <button class="primary" id="bulkBtn" onclick="runBulk()">📨 Send Bulk WhatsApp Confirmations</button>
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Order</th><th>Name</th><th>Phone</th><th>City</th><th>Status</th><th>Tags</th><th>Price</th><th>Created</th>
          </tr></thead>
          <tbody id="tbody">${rowsHtml || `<tr><td colspan="8" class="empty">No orders yet — they'll appear here as they come in.</td></tr>`}</tbody>
        </table>
      </div>
      <div class="footer-note">Showing latest 300 orders · Order Guard v1</div>

      <script>
        function filterTable() {
          const q = document.getElementById('searchBox').value.toLowerCase();
          const status = document.getElementById('statusFilter').value;
          document.querySelectorAll('#tbody tr[data-status]').forEach(row => {
            const matchesSearch = !q || row.dataset.search.includes(q);
            const matchesStatus = !status || row.dataset.status === status;
            row.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
          });
        }
        async function runBulk() {
          const btn = document.getElementById('bulkBtn');
          btn.disabled = true;
          btn.textContent = 'Sending...';
          try {
            const res = await fetch('/bulk-confirm/run', { method: 'POST', credentials: 'same-origin' });
            const data = await res.json();
            window.location.href = '/dashboard?msg=' + encodeURIComponent(
              'Sent: ' + (data.sent ?? 0) + ', Failed: ' + (data.failed ?? 0) + '. ' + (data.message || '')
            );
          } catch (e) {
            btn.disabled = false;
            btn.textContent = '📨 Send Bulk WhatsApp Confirmations';
            alert('Failed to send: ' + e.message);
          }
        }
      </script>
    </body>
    </html>
    `);
  } catch (err) {
    console.error('dashboard error:', err.message);
    res.status(500).send('Dashboard error: ' + err.message);
  }
});

module.exports = router;

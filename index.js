const express = require('express');
const config = require('./config');
const webhooksRouter = require('./webhooks');
const bulkConfirmRouter = require('./bulkConfirm');
const authRouter = require('./auth');
const { initDb } = require('./db');

const app = express();

// Webhook routes need the RAW body (for HMAC verification) so mount express.raw()
// ONLY on that path, before the global json() parser.
app.use('/webhooks', express.raw({ type: 'application/json' }), webhooksRouter);

// Everything else uses normal JSON parsing.
app.use(express.json());
app.use('/bulk-confirm', bulkConfirmRouter);
app.use('/', authRouter); // handles "/", "/auth", "/auth/callback" for the install flow

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

async function start() {
  await initDb(); // creates tables in Postgres if they don't exist yet
  app.listen(config.app.port, () => {
    console.log(`Shopify Order Guard running on port ${config.app.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start app:', err.message);
  process.exit(1);
});

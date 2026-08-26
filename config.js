require('dotenv').config();

function required(name, fallback = undefined) {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    console.warn(`[config] Warning: ${name} is not set in .env`);
  }
  return val;
}

module.exports = {
  shopify: {
    domain: required('SHOPIFY_STORE_DOMAIN'),
    token: required('SHOPIFY_ADMIN_ACCESS_TOKEN'),
    apiVersion: required('SHOPIFY_API_VERSION', '2024-10'),
    webhookSecret: required('SHOPIFY_WEBHOOK_SECRET'),
  },
  whatsapp: {
    phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: required('WHATSAPP_ACCESS_TOKEN'),
    templateName: required('WHATSAPP_CONFIRMATION_TEMPLATE', 'order_confirmation'),
    languageCode: required('WHATSAPP_LANGUAGE_CODE', 'ur'),
  },
  app: {
    port: parseInt(process.env.PORT || '3000', 10),
    cancelTriggerTag: (process.env.CANCEL_TRIGGER_TAG || 'cancelled').toLowerCase(),
    confirmedSentTag: process.env.CONFIRMED_SENT_TAG || 'confirmation-sent',
    blockedTag: process.env.BLOCKED_TAG || 'duplicate-blocked',
    duplicateWindowHours: parseFloat(process.env.DUPLICATE_WINDOW_HOURS || '2160'),
    bulkSendDelayMs: parseInt(process.env.BULK_SEND_DELAY_MS || '1200', 10),
    adminApiKey: required('ADMIN_API_KEY'),
  },
};

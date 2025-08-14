// ESM Express server with SPA fallback for /web/buyer/ and /web/merchant/
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root with built frontend. By default use ./web/web (buyer/, merchant/ live here)
const WEB_ROOT = process.env.WEB_ROOT || path.join(__dirname, 'web', 'web');

// Concrete app dirs
const BUYER_DIR = process.env.BUYER_DIR || path.join(WEB_ROOT, 'buyer');
const MERCHANT_DIR = process.env.MERCHANT_DIR || path.join(WEB_ROOT, 'merchant');

const app = express();

// Static serving for both apps (no directory index)
app.use('/web/buyer', express.static(BUYER_DIR, { index: false }));
app.use('/web/merchant', express.static(MERCHANT_DIR, { index: false }));

// Health
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    web_root: WEB_ROOT,
    buyer: BUYER_DIR,
    merchant: MERCHANT_DIR
  });
});

// SPA fallbacks: always send index.html for client-side routes
app.get('/web/buyer/*', (_req, res) => {
  res.sendFile(path.join(BUYER_DIR, 'index.html'));
});
app.get('/web/merchant/*', (_req, res) => {
  res.sendFile(path.join(MERCHANT_DIR, 'index.html'));
});

// Optional root redirect
app.get('/', (_req, res) => {
  res.redirect('/web/buyer/');
});

const PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, () => {
  console.log(`Web server on :${PORT}`);
  console.log('BUYER_DIR    =', BUYER_DIR);
  console.log('MERCHANT_DIR =', MERCHANT_DIR);
});

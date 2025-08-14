// server.js (ESM) — robust SPA fallback for Foody with multi-entry (buyer/merchant)
// Works whether this file is in repo root or in /web, and whether build is in web/dist or web/.
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

// Candidate base directories that may contain the compiled app
const baseCandidates = [
  // typical when server.js is at repo root
  path.join(__dirname, "web", "dist"),
  path.join(__dirname, "web"),
  // typical when server.js is inside /web
  path.join(__dirname, "dist"),
  __dirname,
  // also consider CWD
  path.join(process.cwd(), "web", "dist"),
  path.join(process.cwd(), "web"),
  path.join(process.cwd(), "dist"),
  process.cwd(),
];

// Helper: a base is valid if it contains at least one of the expected index files
function isValidBase(base) {
  return [
    path.join(base, "index.html"),
    path.join(base, "buyer", "index.html"),
    path.join(base, "merchant", "index.html"),
  ].some(exists);
}

const WEB_BASE = baseCandidates.find(isValidBase);
if (!WEB_BASE) {
  console.error("Foody web: build directory not found. Tried:", baseCandidates);
  // Fail fast with clear message instead of sending /app/index.html
  process.exit(1);
}

const app = express();

// Health
app.get(["/health", "/health/"], (_req, res) => res.json({ ok: true, base: WEB_BASE }));

// Runtime config
app.get("/config.js", (_req, res) => {
  const cfg = {
    FOODY_API: process.env.FOODY_API || "https://foodyback-production.up.railway.app",
  };
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.send(`window.__FOODY__=${JSON.stringify(cfg)};`);
});

// Static assets
app.use(express.static(WEB_BASE, { index: false }));

// SPA fallback that prefers merchant/buyer entry points if present
function sendIndexFor(req, res) {
  const wantMerchant = req.path.startsWith("/web/merchant");
  const wantBuyer = req.path === "/web" || req.path.startsWith("/web/buyer");

  const merchantIndex = path.join(WEB_BASE, "merchant", "index.html");
  const buyerIndex = path.join(WEB_BASE, "buyer", "index.html");
  const rootIndex = path.join(WEB_BASE, "index.html");

  let chosen = rootIndex;
  if (wantMerchant && exists(merchantIndex)) chosen = merchantIndex;
  else if (wantBuyer && exists(buyerIndex)) chosen = buyerIndex;
  else if (exists(rootIndex)) chosen = rootIndex;
  else if (exists(buyerIndex)) chosen = buyerIndex;
  else if (exists(merchantIndex)) chosen = merchantIndex;

  return res.sendFile(chosen);
}

// Routes
app.get("/web", sendIndexFor);
app.get("/web/*", sendIndexFor);

// If you want all unknown routes to fall back to SPA, uncomment:
// app.get("*", (req, res) => res.sendFile(path.join(WEB_BASE, "index.html")));

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Foody web running on :${PORT}, base ${WEB_BASE}`);
});

// server.js (ESM, SPA fallback) — tailored for Railway Web service with Root directory = 'web'
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// We are already inside /app/web on Railway (Root directory = 'web').
// Detect build directory: prefer /app/web/dist, otherwise /app/web itself.
const candidates = [
  path.join(__dirname, "dist"),
  __dirname,
];
let WEB_DIR = candidates.find((p) => fs.existsSync(path.join(p, "index.html"))) || __dirname;

const app = express();

// Healthcheck
app.get(["/health", "/health/"], (_req, res) => res.json({ ok: true }));

// Frontend runtime config
app.get("/config.js", (_req, res) => {
  const cfg = {
    FOODY_API: process.env.FOODY_API || "https://foodyback-production.up.railway.app",
  };
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.send(`window.__FOODY__=${JSON.stringify(cfg)};`);
});

// Serve static assets (turn off auto index so SPA fallback handles client routes)
app.use(express.static(WEB_DIR, { index: false }));

// --- SPA fallback ---
// Always serve the *same* index.html for client routes (do NOT append req.path).
const sendIndex = (_req, res) => res.sendFile(path.join(WEB_DIR, "index.html"));

// Your app routes live under /web/*
app.get("/web", sendIndex);
app.get("/web/*", sendIndex);

// If you later move routes to the root, you can enable:
// app.get("*", sendIndex);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Foody web running on :${PORT}, serving ${WEB_DIR}`);
});

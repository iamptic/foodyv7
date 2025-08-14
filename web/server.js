// server.js (ESM, SPA fallback for /web/*)
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to auto-detect build directory: web/dist -> web
const candidates = [
  path.join(__dirname, "web", "dist"),
  path.join(__dirname, "web"),
  path.join(process.cwd(), "web", "dist"),
  path.join(process.cwd(), "web"),
];
let WEB_DIR = candidates.find((p) => fs.existsSync(path.join(p, "index.html")));
if (!WEB_DIR) WEB_DIR = path.join(__dirname, "web"); // default fallback

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

// Static assets (no auto index so SPA fallback can handle client routes)
app.use(express.static(WEB_DIR, { index: false }));

// --- SPA fallback ---
// Serve index.html for client-side routes under /web and /web/*
const sendIndex = (_req, res) => res.sendFile(path.join(WEB_DIR, "index.html"));
app.get("/web", sendIndex);
app.get("/web/*", sendIndex);

// (Optional) To make ALL unknown routes fallback to SPA, uncomment the below:
// app.get("*", sendIndex);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Foody web running on :${PORT}, serving ${WEB_DIR}`);
});

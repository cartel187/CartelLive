import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import apiApp from "./api/index.js"; // Import the Express API application containing router

async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- Domain Guard System ---
  app.use((req, res, next) => {
    const adminToken = "cartelflag";
    const userPortalToken = "carteltoken";
    const telegramUrl = "https://t.me/cartel187";
    
    // 1. Always allow API and internal Vite traffic
    if (req.path.startsWith("/api") || req.path.startsWith("/play") || req.path.startsWith("/jiotv") || req.path.startsWith("/@") || req.path.startsWith("/node_modules")) {
      return next();
    }

    // 2. Allow Assets (static files)
    if (req.path.includes(".")) {
      return next();
    }

    // 3. Extract tok from query or cookie
    const queryToken = req.query.token as string || "";
    let cookieToken = "";
    if (req.headers.cookie) {
      const parts = req.headers.cookie.split(";");
      for (const part of parts) {
        const [k, v] = part.trim().split("=");
        if (k === "auth_token") {
          cookieToken = v;
        }
      }
    }

    const activeToken = queryToken || cookieToken;

    if (activeToken === adminToken || activeToken === userPortalToken) {
      // If of query token, set cookie to remember session
      if (queryToken) {
        res.setHeader("Set-Cookie", `auth_token=${queryToken}; Path=/; Max-Age=2592000; SameSite=Lax`);
      }
      return next();
    }

    // 4. Everything else (Main domain access, deep links) redirects to Telegram
    console.log(`[Guard] Blocked access to ${req.path} from ${req.ip} - Redirecting to Telegram`);
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.redirect(307, telegramUrl);
  });

  // Mount API paths first (re-using the Vercel-ready handler)
  app.use(apiApp);

  // Vite middleware for development or fallback static files for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Live stream guard running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical server failure on start:", err);
});

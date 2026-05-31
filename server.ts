import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import apiApp from "./api/index.js"; // Import the Express API application containing router

async function startServer() {
  const app = express();
  const PORT = 3000;

  // --- Domain Guard System ---
  app.use((req, res, next) => {
    const bypassToken = "cartelflag";
    const telegramUrl = "https://t.me/cartel187";
    
    // 1. Allow Static Assets (JS, CSS, Images) to load regardless
    if (req.path.includes(".") || req.path.startsWith("/@")) {
      return next();
    }

    // 2. Allow specific API paths if they have their own tokens
    // but the user's requirement is "visit the domain" -> redirect
    const token = req.query.token;

    // 3. Check for the token
    if (token === bypassToken) {
      return next();
    }

    // --- Dynamic Redirect Logic ---
    // If it's a browser page request (no extension, not an XHR typically)
    // and no token is present, we send to Telegram.
    console.log(`[Guard] Blocked access to ${req.path} from ${req.ip} - Access with ?token=${bypassToken}`);
    return res.redirect(telegramUrl);
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

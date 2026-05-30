import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import apiApp from "./api/index.js"; // Import the Express API application containing router

async function startServer() {
  const app = express();
  const PORT = 3000;

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

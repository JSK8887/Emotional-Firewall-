import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Security Headers
  app.use(helmet({
    contentSecurityPolicy: false, // Vite needs inline scripts in dev
  }));

  // 2. CORS - Restrict to App URL
  app.use(cors({
    origin: process.env.APP_URL || "*",
    methods: ["GET", "POST"],
  }));

  // 3. Rate Limiting - Prevent Brute Force
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: "Too many requests from this IP, please try again later.",
  });
  app.use("/api/", limiter);

  app.use(express.json({ limit: "10kb" })); // Limit body size

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "secure", timestamp: new Date().toISOString() });
  });

  // Vite middleware for development
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

  // Global Error Handler - Hide Stack Traces
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err.stack);
    res.status(500).json({
      error: "Internal Server Error",
      message: process.env.NODE_ENV === "production" ? "Something went wrong" : err.message
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

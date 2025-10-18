import "dotenv/config";
// Ensure NODE_ENV defaults to production when not explicitly set. Some hosting
// environments (or running the bundled server) may not set NODE_ENV, and the
// app relies on it to decide whether to run Vite dev middleware or serve
// compiled static files. Defaulting here avoids accidentally starting the dev
// middleware in production.
process.env.NODE_ENV = process.env.NODE_ENV || "production";

// Log environment information to help with debugging
console.log(`Starting server with NODE_ENV=${process.env.NODE_ENV}`);
console.log(`Running in directory: ${process.cwd()}`);
console.log(`Vercel environment: ${process.env.VERCEL === '1' ? 'Yes' : 'No'}`);

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import fs from "fs";

const app = express();
// Ensure Express' internal env matches the Node environment we set above.
// This avoids cases where `app.get('env')` still returns 'development' and
// accidentally activates the Vite dev middleware in production builds.
app.set("env", process.env.NODE_ENV || app.get("env"));

// Log the Express environment
console.log(`Express env set to: ${app.get("env")}`);

// Add CORS headers for API requests
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    console.log("Registering routes...");
    const server = await registerRoutes(app);
    console.log("Routes registered successfully");

    // Setup global error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      
      console.error(`Error handler caught: ${err.stack || err}`);
      
      // Only send response if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(status).json({ 
          message,
          status,
          timestamp: new Date().toISOString(),
          path: _req.path
        });
      }
      
      // Don't throw the error as it will crash the server
      // Just log it so we can see it in the console/logs
    });

    console.log(`Express environment: ${app.get("env")}`);
    
    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      console.log("Setting up Vite development middleware...");
      await setupVite(app, server);
      console.log("Vite development middleware setup complete");
    } else {
      console.log("Setting up static file serving...");
      serveStatic(app);
      console.log("Static file serving setup complete");
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    // For Vercel serverless environment, don't actually listen on a port
    // The server is handled by Vercel's serverless infrastructure
    if (process.env.VERCEL === '1') {
      console.log("Running in Vercel serverless environment - no need to listen on a port");
      // Export the Express app for Vercel serverless
      // module.exports doesn't work well with ESM, use export default
      console.log("Exporting Express app for Vercel serverless");
    } else {
      // For local development and other environments, listen on the port
      server.listen(port, "0.0.0.0", () => {
        log(`Server listening on port ${port}`);
      });
    }
  } catch (error) {
    console.error("Fatal error starting the server:", error);
    
    // In production, try to recover rather than crash
    if (process.env.NODE_ENV === "production") {
      // Create a minimal Express app that can at least handle API requests
      console.log("Attempting to start minimal recovery server...");
      
      app.get("/api/health", (_req, res) => {
        res.json({ status: "recovering", error: String(error) });
      });
      
      if (!process.env.VERCEL) {
        const port = parseInt(process.env.PORT || '5000', 10);
        app.listen(port, "0.0.0.0", () => {
          console.log(`Recovery server listening on port ${port}`);
        });
      } else {
        // Export the recovery app for Vercel
        console.log("Exporting recovery Express app for Vercel serverless");
      }
    } else {
      // In development, crash so the developer sees the error
      throw error;
    }
  }
})();

// Export the Express app for ESM and Vercel serverless
export default app;
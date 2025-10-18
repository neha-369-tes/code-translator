import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        // Log the error but do NOT kill the dev server.
        // Exiting here causes the Express server to drop connections and the
        // Simple Browser to show cancelled/unresponsive loads.
        viteLogger.error(msg, options);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  try {
    // In Vercel serverless, the dist/public directory is mapped through routes in vercel.json
    // For local execution, we need to find the actual static files directory
    let distPath;
    
    // Check if we're running on Vercel
    if (process.env.VERCEL === '1') {
      // On Vercel, use a fixed path according to Vercel's deployment structure
      distPath = path.join(process.cwd(), 'public');
      console.log(`Running on Vercel, setting static path to: ${distPath}`);
    } else {
      // For local environments, try multiple possible locations
      const possiblePaths = [
        path.join(process.cwd(), 'dist', 'public'),
        path.join(process.cwd(), 'public'),
        path.join(import.meta.dirname || process.cwd(), 'public'),
        path.join(import.meta.dirname || process.cwd(), '..', 'public')
      ];
      
      console.log(`Checking possible static file paths: ${possiblePaths.join(', ')}`);
      distPath = possiblePaths.find(p => fs.existsSync(p));
      
      if (!distPath) {
        console.error(`None of the possible static file paths exist`);
        // Continue anyway - we might be in a serverless environment where the
        // vercel.json routes configuration handles static files differently
        distPath = path.join(process.cwd(), 'public');
        console.warn(`Defaulting to: ${distPath} (may not exist)`);
      } else {
        console.log(`Found static files at: ${distPath}`);
      }
    }
    
    // Log directories to help with debugging
    console.log(`Current directory: ${process.cwd()}`);
    try {
      console.log(`Files in current directory: ${fs.readdirSync(process.cwd()).join(', ')}`);
      
      if (fs.existsSync(path.join(process.cwd(), 'dist'))) {
        console.log(`Files in dist directory: ${fs.readdirSync(path.join(process.cwd(), 'dist')).join(', ')}`);
      }
      
      if (fs.existsSync(distPath)) {
        console.log(`Files in static directory: ${fs.readdirSync(distPath).join(', ')}`);
      }
    } catch (err) {
      console.error(`Error listing directories: ${err}`);
    }

    // Setup static file middleware
    app.use(express.static(distPath, { 
      maxAge: '1d',
      fallthrough: true
    }));

    // Fall through to index.html for client-side routing
    app.use("*", (_req, res) => {
      try {
        const indexPath = path.join(distPath, "index.html");
        
        if (fs.existsSync(indexPath)) {
          console.log(`Serving index.html from ${indexPath}`);
          res.sendFile(indexPath);
        } else {
          console.error(`index.html not found at ${indexPath}`);
          
          // Special case for Vercel - if index.html doesn't exist locally,
          // let the request fall through to Vercel's routing
          if (process.env.VERCEL === '1') {
            console.log('Running on Vercel, sending simple HTML response');
            res.send(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>App</title>
                  <meta charset="UTF-8" />
                  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                </head>
                <body>
                  <div id="root">Loading...</div>
                  <script>
                    window.location.reload();
                  </script>
                </body>
              </html>
            `);
          } else {
            res.status(404).send(`
              Index file not found at ${indexPath}.<br>
              Current directory: ${process.cwd()}<br>
              Static directory: ${distPath}<br>
              Environment: ${process.env.NODE_ENV}
            `);
          }
        }
      } catch (err) {
        console.error(`Error serving index.html: ${err}`);
        res.status(500).send(`Error serving index.html: ${err}`);
      }
    });
  } catch (err) {
    console.error(`Error setting up static file serving: ${err}`);
    // Don't throw - let the server continue without static file serving
    // This allows the API routes to work even if static file serving is broken
    app.use("*", (_req, res) => {
      if (!res.headersSent) {
        res.status(500).send(`Static file serving error: ${err}`);
      }
    });
  }
}

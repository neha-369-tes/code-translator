// This file is a specific entry point for Vercel serverless functions
// It loads the server code directly to avoid issues with imports

// Setup environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.VERCEL = '1';

// Import needed modules
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Create express app
const app = express();

// Log environment for debugging
console.log(`Vercel serverless function starting`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`CWD: ${process.cwd()}`);

// Setup middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Setup CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Add simple logging
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`${req.method} ${req.path} started`);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} completed in ${duration}ms`);
  });
  
  next();
});

// Add API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: 'vercel' });
});

// Try to set up static file serving
try {
  // In Vercel, static files are served directly through vercel.json routes
  // This is just a fallback
  const staticPath = path.join(process.cwd(), 'public');
  if (fs.existsSync(staticPath)) {
    console.log(`Serving static files from: ${staticPath}`);
    app.use(express.static(staticPath));
  } else {
    console.log(`Static path not found: ${staticPath}`);
  }

  // Handle client-side routing
  app.get('*', (req, res) => {
    // Avoid handling API requests
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    // Try to serve index.html
    const indexPath = path.join(process.cwd(), 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>App</title>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <script>
              // Redirect to the main domain if needed
              if (window.location.pathname !== '/' && !window.location.pathname.includes('.')) {
                window.location.href = '/';
              }
            </script>
          </head>
          <body>
            <div id="root">Application is loading...</div>
          </body>
        </html>
      `);
    }
  });
} catch (err) {
  console.error('Error setting up static serving:', err);
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : err.message
  });
});

// Export for Vercel
export default app;
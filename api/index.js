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
  // Log current working directory and its contents
  console.log('Current working directory:', process.cwd());
  try {
    const cwdFiles = fs.readdirSync(process.cwd());
    console.log('Files in CWD:', cwdFiles.join(', '));
  } catch (e) {
    console.log('Could not list CWD files:', e.message);
  }
  
  // Try multiple possible static file locations
  const possiblePaths = [
    path.join(process.cwd(), 'dist', 'public'),
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), '.vercel', 'output', 'static'),
    path.join(process.cwd(), '..', 'public'),
  ];
  
  let staticPath = null;
  for (const tryPath of possiblePaths) {
    if (fs.existsSync(tryPath)) {
      staticPath = tryPath;
      console.log(`Found static files at: ${staticPath}`);
      try {
        const files = fs.readdirSync(staticPath);
        console.log(`Files in static directory: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);
      } catch (e) {
        console.log('Could not list static files:', e.message);
      }
      break;
    }
  }
  
  if (!staticPath) {
    console.log('No static files directory found in any of:', possiblePaths.join(', '));
    staticPath = path.join(process.cwd(), 'dist', 'public'); // default fallback
  }
  
  // Serve static files with proper configuration
  app.use(express.static(staticPath, {
    maxAge: '1d',
    index: false, // Don't auto-serve index.html, we'll handle it explicitly
  }));

  // Handle client-side routing - this should be the last route
  app.get('*', (req, res) => {
    // Avoid handling API requests
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    console.log(`Handling catch-all route for: ${req.path}`);
    
    // Try to serve index.html from multiple locations
    const indexPaths = [
      path.join(staticPath, 'index.html'),
      path.join(process.cwd(), 'dist', 'public', 'index.html'),
      path.join(process.cwd(), 'public', 'index.html'),
    ];
    
    for (const indexPath of indexPaths) {
      if (fs.existsSync(indexPath)) {
        console.log(`Serving index.html from: ${indexPath}`);
        return res.sendFile(indexPath);
      } else {
        console.log(`index.html not found at: ${indexPath}`);
      }
    }
    
    // If no index.html found, return an error page with debug info
    console.error('No index.html found in any location');
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Build Error</title>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body { font-family: monospace; padding: 20px; background: #1a1a1a; color: #fff; }
            .error { background: #330000; border: 1px solid #660000; padding: 15px; margin: 10px 0; }
            .info { background: #003300; border: 1px solid #006600; padding: 15px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <h1>⚠️ Build Error</h1>
          <div class="error">
            <h2>index.html not found</h2>
            <p>The application was not built correctly or the build output is in an unexpected location.</p>
          </div>
          <div class="info">
            <h2>Debug Information</h2>
            <p><strong>CWD:</strong> ${process.cwd()}</p>
            <p><strong>Static Path:</strong> ${staticPath}</p>
            <p><strong>Tried paths:</strong></p>
            <ul>
              ${indexPaths.map(p => `<li>${p} - ${fs.existsSync(p) ? '✓ exists' : '✗ not found'}</li>`).join('')}
            </ul>
          </div>
          <div class="info">
            <h2>Next Steps</h2>
            <ol>
              <li>Check Vercel build logs for errors during the build process</li>
              <li>Verify that <code>npm run build</code> completes successfully</li>
              <li>Check that vite.config.ts outputs to the correct directory</li>
            </ol>
          </div>
        </body>
      </html>
    `);
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
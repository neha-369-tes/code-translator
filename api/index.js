// This file is the entry point for Vercel serverless functions
// It imports the actual built server with all routes

// Setup environment variables BEFORE any imports
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.VERCEL = '1';

console.log(`Vercel serverless function starting`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`CWD: ${process.cwd()}`);

// Import the actual built server from dist/index.js
// This includes all the real API routes from server/routes.ts
import serverApp from '../dist/index.js';

// The server/index.ts file exports the Express app
// It's already configured with all routes, middleware, etc.
// Just export it directly for Vercel to use
export default serverApp;
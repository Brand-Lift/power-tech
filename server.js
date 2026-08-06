/**
 * server.js — Power Tech Express API Server
 *
 * Responsibilities:
 *  - Load environment variables
 *  - Initialise Supabase client
 *  - Configure CORS, JSON body parsing
 *  - Mount route modules
 *  - Start HTTP server
 */

'use strict';

// ─── Load environment ─────────────────────────────────────────────────────────
require('dotenv').config();

// ─── Imports ──────────────────────────────────────────────────────────────────
const express    = require('express');
const cors       = require('cors');
const { createClient } = require('@supabase/supabase-js');

// ─── Validate required env vars ───────────────────────────────────────────────
const REQUIRED_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'ADMIN_API_KEY',
];

REQUIRED_VARS.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ FATAL: Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

// ─── Supabase Client ──────────────────────────────────────────────────────────
// We use the service-role key so the backend can bypass Row Level Security.
// NEVER expose this key to the frontend.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  }
);

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow requests from the frontend URL (and localhost in development).
const allowedOrigins = [
  process.env.FRONTEND_URL,        // e.g. https://yourusername.github.io
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  // add more if needed
].filter(Boolean); // remove empty/undefined values

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
  credentials: true,
}));

// ─── Body Parser ──────────────────────────────────────────────────────────────
// Increase limit to 10MB to accommodate Base64 payment screenshots.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Attach Supabase to every request ────────────────────────────────────────
// Makes req.db available in all route handlers.
app.use((req, _res, next) => {
  req.db = supabase;
  next();
});

// ─── Route Modules ────────────────────────────────────────────────────────────
const authRoutes  = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');

app.use('/api/auth',  authRoutes);
app.use('/api',       orderRoutes);
app.use('/api/admin', adminRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// Catches errors thrown or passed to next() in any route.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err);
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3000;

app.listen(PORT, () => {
  console.log(`\n⚡ Power Tech API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

// Export for testing purposes
module.exports = { app, supabase };

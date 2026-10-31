const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth.routes');
const logger = require('./utils/logger');

const app = express();

/**
 * Security & Middleware Setup
 */

// 1. CORS Configuration
// Allows credentials (HttpOnly cookies) from localhost:3000, localhost:5173, or configured FRONTEND_URL
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      // In development, automatically allow localhost or 127.0.0.1 on any port
      const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (allowedOrigins.includes(origin) || (process.env.NODE_ENV !== 'production' && isLocalhost)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS policy blocked access from origin ${origin}`));
    },
    credentials: true, // Crucial: Allows browser to send & receive HttpOnly cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

// 2. Cookie Parser
// Extracts cookies from the `Cookie` request header into `req.cookies`
app.use(cookieParser());

// 3. JSON Body Parser
app.use(express.json({ limit: '10kb' }));

// 4. HTTP Request Logger Middleware (ANSI Colored, No Icons)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(req.method, req.originalUrl, res.statusCode, duration);
  });
  next();
});

/**
 * API Routes
 */

// Health check endpoint for monitoring & DevOps
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount Authentication Routes
app.use('/api/auth', authRoutes);

/**
 * 404 Not Found Handler
 */
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

/**
 * Global Centralized Error Handling Middleware
 */
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;

  // Log error internally using ANSI color logger
  logger.error('error', `${req.method} ${req.url} -> ${statusCode}: ${err.message}`);
  if (statusCode === 500 && process.env.NODE_ENV !== 'production' && err.stack) {
    console.error(`${logger.colors.dim}${err.stack}${logger.colors.reset}`);
  }

  // Format consistent API error response
  res.status(statusCode).json({
    success: false,
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected internal server error occurred.',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;

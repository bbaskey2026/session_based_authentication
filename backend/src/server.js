const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from backend/.env regardless of starting directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
const http = require('http');
const app = require('./app');
const { pool } = require('./config/database');
const sql = require('./sql');

const PORT = process.env.PORT || 5000;

const logger = require('./utils/logger');
const { colors: c } = logger;

// Create HTTP server
const server = http.createServer(app);

// Verify database connection and launch server
const startServer = async () => {
  try {
    // Test PostgreSQL database connectivity on startup
    const client = await pool.connect();
    const res = await client.query('SELECT NOW() AS server_time, current_database() AS db_name');

    // Ensure required tables and indexes exist in the database using schema.sql
    await client.query(sql.schema);
    client.release();

    logger.divider(56);
    logger.title('JWT Authentication Backend Server');
    logger.divider(56);
    logger.database(`PostgreSQL Connected: Database '${c.bold}${res.rows[0].db_name}${c.reset}'`);
    logger.info('time', `PostgreSQL Server Time: ${c.dim}${res.rows[0].server_time}${c.reset}`);
    logger.security('Access Token: 15-minute in-memory JWT');
    logger.security('Refresh Token: HttpOnly Cookie + SHA-256 DB Rotation');
    logger.network(`Allowed Frontend Origin: ${c.dim}${process.env.FRONTEND_URL || 'http://localhost:3000'}${c.reset}`);

    server.listen(PORT, () => {
      logger.ready(`Server listening on ${c.bold}http://localhost:${PORT}${c.reset}`);
      logger.divider(56);
    });
  } catch (error) {
    logger.error('db', `Failed to connect to PostgreSQL database: ${error.message}`);
    logger.warn('hint', 'Please verify your DATABASE_URL in backend/.env');
    logger.warn('warn', 'Server is starting in disconnected mode...');
    server.listen(PORT, () => {
      logger.warn('ready', `Server listening on http://localhost:${PORT} (PostgreSQL disconnected)`);
    });
  }
};

startServer();

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.warn('system', `Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    logger.info('http', 'HTTP server closed.');
    try {
      await pool.end();
      logger.info('db', 'PostgreSQL connection pool closed.');
      process.exit(0);
    } catch (err) {
      logger.error('db', `Error during pool closure: ${err.message}`);
      process.exit(1);
    }
  });

  // Force shutdown if taking longer than 10s
  setTimeout(() => {
    logger.error('system', 'Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

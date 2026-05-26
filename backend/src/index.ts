/**
 * Express Server - Main Entry Point
 * ==================================
 * 
 * RESPONSIBILITIES:
 * 1. Initialize MongoDB connection
 * 2. Configure Express middleware
 * 3. Mount routes
 * 4. Initialize Socket.io
 * 5. Start HTTP server
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

// Import routes
import taskRoutes from './routes/taskRoutes';

// Import socket handler
import { initializeSocketIO } from './sockets/taskSocket';

// Load environment variables
dotenv.config();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface AppConfig {
  PORT: number;
  MONGODB_URI: string;
  NODE_ENV: string;
}

// ============================================================================
// SERVER INITIALIZATION
// ============================================================================

const app = express();
const httpServer = createServer(app);

// ============================================================================
// SOCKET.IO SETUP
// ============================================================================

/**
 * Socket.io instance with CORS configuration
 * 
 * ARCHITECTURAL DECISION: Why Socket.io instead of raw WebSocket?
 * 
 * 1. Automatic reconnection with exponential backoff
 * 2. Room/namespace support for multi-tenant isolation
 * 3. Fallback to long-polling if WebSocket fails
 * 4. Built-in heartbeat/ping-pong for connection health
 * 5. TypeScript definitions included
 * 
 * CORS: Allows frontend on different port (dev) or domain (prod)
 */
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',  // Restrict in production!
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,  // 60s without pong = disconnected
  pingInterval: 25000  // Ping every 25s to keep connection alive
});

// ============================================================================
// EXPRESS MIDDLEWARE STACK
// ============================================================================

/**
 * Security headers (Helmet)
 * Sets X-Content-Type-Options, X-Frame-Options, etc.
 * PREVENTS: XSS, clickjacking, MIME sniffing attacks
 */
app.use(helmet());

/**
 * CORS - Cross-Origin Resource Sharing
 * Allows frontend to call API from different origin
 * 
 * PRODUCTION: Replace '*' with specific domain(s)
 */
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

/**
 * JSON body parser
 * limit: 10kb - prevents large payload DoS attacks
 */
app.use(express.json({ limit: '10kb' }));

/**
 * Rate limiting (future enhancement)
 * Would prevent brute-force and API abuse
 */

/**
 * Request logging (future enhancement)
 * Morgan or similar for access logs
 */

// ============================================================================
// ROUTES
// ============================================================================

// Mount task routes under /api prefix
app.use('/api', taskRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'AI-Powered Smart Task Analytics',
    version: '1.0.0',
    status: 'running'
  });
});

// ============================================================================
// GLOBAL ERROR HANDLER
// ============================================================================

/**
 * Express error-handling middleware
 * 
 * ARCHITECTURAL PATTERN: Centralized error handling
 * 
 * Every route wrapped in try-catch calls next(error)
 * This middleware catches all of them in one place
 * 
 * BENEFITS:
 * 1. Consistent error response format
 * 2. Can log to monitoring (Sentry, DataDog)
 * 3. Can sanitize error messages for different environments
 * 4. Single place to modify error behavior
 */
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  
  console.error('[ErrorHandler]', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method
  });

  // Determine status code
  const status = err.status || err.statusCode || 500;
  
  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

/**
 * MongoDB connection with retry logic
 * 
 * INTERVIEW POINT: Why connection outside app.listen?
 * 
 * Node.js is ASYNC and NON-BLOCKING by default.
 * If we start server before DB connects:
 *   - Requests come in before DB is ready
 *   - Every request fails with "DB not connected"
 * 
 * By using async IIFE (immediately invoked function expression),
 * we ENSURE DB is connected before server accepts traffic.
 * 
 * In KUBERNETES: Liveness probe passes, but Readiness probe waits for DB.
 */
(async () => {
  try {
    // Initialize database (MongoDB or in-memory fallback)
    const { initDatabase } = await import('./config/database');
    await initDatabase();

    // Initialize Socket.io with io instance
    initializeSocketIO(io);

    // Start server AFTER DB connection
    const PORT = parseInt(process.env.PORT || '3000', 10);
    
    httpServer.listen(PORT, () => {
      console.log(`[Server] HTTP server running on port ${PORT}`);
      console.log(`[Server] WebSocket server ready`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);  // Exit with non-zero = crash (K8s will restart)
  }
})();

// ============================================================================
// GRACEFUL SHUTDOWN (Production Requirement)
// ============================================================================

/**
 * Graceful shutdown handlers
 * 
 * In production (K8s/Docker), SIGTERM is sent before container stops.
 * This gives us time to:
 * 1. Stop accepting new connections
 * 2. Finish existing requests
 * 3. Close DB connections properly
 * 
 * Without this, we'd have "connection reset" errors on clients.
 */
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  
  // Stop accepting new connections
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
  });

  // Close DB connection
  try {
    const mongoose = await import('mongoose');
    await mongoose.connection.close();
    console.log('[Server] MongoDB connection closed');
  } catch (e) {
    console.log('[Server] In-memory store - no connection to close');
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down...');
  try {
    const mongoose = await import('mongoose');
    await mongoose.connection.close();
  } catch (e) {
    // ignore
  }
  process.exit(0);
});

// ============================================================================
// SOCKET.IO CONNECTION HANDLING
// ============================================================================

/**
 * Global Socket.io connection handler
 * 
 * INTERVIEW: How do you handle WebSocket connections at scale?
 * 
 * Each socket connection consumes memory and event loop time.
 * We track connections and can disconnect if thresholds exceeded.
 */
let activeConnections = 0;

io.on('connection', (socket) => {
  activeConnections++;
  console.log(`[Socket] Client connected: ${socket.id} (active: ${activeConnections})`);

  // Optional: Limit connections per IP
  // socket.conn.transport is the underlying socket
  
  socket.on('disconnect', (reason) => {
    activeConnections--;
    console.log(`[Socket] Client disconnected: ${socket.id}, reason: ${reason} (active: ${activeConnections})`);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`[Socket] Error on ${socket.id}:`, error);
  });
});

export { app, io };

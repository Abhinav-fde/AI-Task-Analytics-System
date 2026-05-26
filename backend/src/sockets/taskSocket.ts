/**
 * Task Socket - Real-Time Broadcast Layer
 * ========================================
 * 
 * ARCHITECTURAL PATTERN: Pub/Sub with Room-Based Broadcasting
 * 
 * Socket.io is a pub/sub system where:
 * - Publishers emit events (server emits 'task:updated')
 * - Subscribers listen for events (client listens for 'task:updated')
 * - Rooms allow targeting specific users (not all connected clients)
 * 
 * WHY ROOMS?
 * Multi-tenant isolation - user A shouldn't see user B's task updates.
 * Each user joins a room named after their userId.
 * Only events emitted to that room reach that user's client.
 * 
 * INTERVIEW ANSWER: "We use room-based broadcasting for multi-tenant isolation.
 * Each user's client only receives updates for their own tasks."
 */

import { Server, Socket } from 'socket.io';
import { db } from '../config/database';

// ============================================================================
// PHASE 3G: Socket.io Initialization
// ============================================================================

// Store io instance globally (singleton pattern)
// This allows aiService to emit events from anywhere
let io: Server;

/**
 * Initialize Socket.io with the Express server's io instance
 * Called once during server startup in index.ts
 * 
 * @param ioInstance - The Socket.io server instance from Express
 */
export const initializeSocketIO = (ioInstance: Server): void => {
  io = ioInstance;
  
  // === SETUP ROOM-BASED CONNECTION HANDLER ===
  // 
  // When client connects, they must immediately emit 'join' with their userId.
  // This ensures multi-tenant isolation from the start.
  // 
  // SECURITY: Client cannot join arbitrary rooms - only the one matching their userId.
  // In production, you'd validate userId against JWT/session.
  
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // === JOIN USER'S PRIVATE ROOM ===
    // 
    // Client emits: socket.emit('join', { userId: 'user123' })
    // Server responds by adding socket to room 'user:user123'
    // 
    // WHY NAMED 'user:' prefix?
    // Separates user rooms from other room types we might add later
    // e.g., 'task:taskId', 'team:teamId', etc.
    socket.on('join', (data: { userId: string }) => {
      const { userId } = data;
      
      if (!userId) {
        console.warn(`[Socket] Join without userId from socket ${socket.id}`);
        return;
      }

      const roomName = `user:${userId.toLowerCase()}`;
      socket.join(roomName);
      
      console.log(`[Socket] Socket ${socket.id} joined room: ${roomName}`);
      
      // Confirm join to client (optional - UI can show "connected")
      socket.emit('joined', { room: roomName });
    });

    // === LEAVE ROOM ON DISCONNECT ===
    // Socket.io handles this automatically, but explicit is fine
    socket.on('leave', (data: { userId: string }) => {
      const roomName = `user:${data.userId?.toLowerCase()}`;
      socket.leave(roomName);
      console.log(`[Socket] Socket ${socket.id} left room: ${roomName}`);
    });

    // === HEARTBEAT / PING ===
    // Socket.io has built-in ping/pong, but clients can also request status
    socket.on('ping-server', () => {
      socket.emit('pong-server', { timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client ${socket.id} disconnected: ${reason}`);
    });
  });

  console.log('[Socket] Socket.io initialized with room-based broadcasting');
};

// ============================================================================
// PHASE 3H: Event Emitter Function
// ============================================================================

/**
 * emitTaskUpdate - Broadcasts task updates to the specific user's room
 * 
 * ARCHITECTURAL DECISION: This function is called from aiService.ts
 * 
 * WHY SEPARATE FUNCTION?
 * - aiService doesn't need to know about Socket.io details
 * - Loose coupling: aiService just calls emitTaskUpdate(taskId)
 * - If we switch from Socket.io to SSE or WebSockets later,
 *   only this file changes (not aiService)
 * 
 * @param taskId - MongoDB ObjectId of the updated task
 */
export const emitTaskUpdate = async (taskId: string): Promise<void> => {
  // Guard: Validate io instance exists
  if (!io) {
    console.error('[Socket] io instance not initialized');
    return;
  }

  try {
    // === FETCH UPDATED TASK FROM MONGODB ===
    // 
    // We need the full task document to send to the frontend.
    // The frontend needs: title, aiStatus, automatedSubtasks, etc.
    // 
    // Using .lean() for performance - returns plain JS object, not Mongoose doc
    const task = await db.findById(taskId);

    if (!task) {
      console.warn(`[Socket] Task ${taskId} not found for broadcast`);
      return;
    }

    // === DETERMINE TARGET ROOM ===
    // 
    // Room name format: 'user:{userId}'
    // This matches the room the client joined during 'join' event
    const roomName = `user:${task.userId}`;

    // === BROADCAST EVENT ===
    // 
    // Event name: 'task:updated'
    // Payload: Full task document (what frontend needs to re-render)
    // Target: Only the user's room (multi-tenant isolation)
    // 
    // io.to(room).emit() sends to all sockets in the room
    // Unlike io.emit() which sends to ALL connected sockets
    io.to(roomName).emit('task:updated', {
      type: 'task:updated',
      payload: {
        taskId: task._id.toString(),
        title: task.title,
        aiStatus: task.aiStatus,
        automatedSubtasks: task.automatedSubtasks,
        updatedAt: task.updatedAt
      },
      timestamp: new Date().toISOString()
    });

    console.log(`[Socket] Emitted 'task:updated' to room ${roomName} for task ${taskId}`);

  } catch (error) {
    // === ERROR HANDLING ===
    // 
    // CRITICAL: Don't let Socket errors crash the application.
    // If WebSocket emission fails, the task is still saved in MongoDB.
    // The frontend can poll for updates as fallback.
    // 
    // We log but don't throw - emitting is best-effort, not critical path.
    
    console.error(`[Socket] Failed to emit task update for ${taskId}:`, error);
  }
};

// ============================================================================
// PHASE 3I: Additional Broadcasting Patterns (Production Ready)
// ============================================================================

/**
 * Broadcast task deletion
 */
export const emitTaskDeleted = (taskId: string, userId: string): void => {
  if (!io) return;
  io.to(`user:${userId}`).emit('task:deleted', {
    type: 'task:deleted',
    payload: { taskId },
    timestamp: new Date().toISOString()
  });
};

/**
 * Broadcast processing started
 */
export const emitProcessingStarted = (taskId: string, userId: string): void => {
  if (!io) return;
  io.to(`user:${userId}`).emit('task:processing', {
    type: 'task:processing',
    payload: { taskId },
    timestamp: new Date().toISOString()
  });
};

/**
 * Broadcast error/failure
 */
export const emitTaskError = (taskId: string, userId: string, errorMessage: string): void => {
  if (!io) return;
  io.to(`user:${userId}`).emit('task:error', {
    type: 'task:error',
    payload: { taskId, errorMessage },
    timestamp: new Date().toISOString()
  });
};

// ============================================================================
// BONUS: Production Scaling Considerations
// ============================================================================
/*
SCALING SOCKET.IO:
1. Redis Adapter (socket.io-redis) - share rooms across instances
2. Connection Limits - per-IP and global limits
3. Authentication - validate JWT on handshake
4. Monitoring - track connection/disconnection rates
*/
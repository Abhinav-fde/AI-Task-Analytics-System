/**
 * Task Controller - Non-Blocking HTTP Pattern
 * =============================================
 * 
 * ARCHITECTURAL PATTERN: Fire-and-Forget with Background Processing
 * 
 * WHY THIS PATTERN MATTERS:
 * Traditional REST APIs are synchronous - client waits while server processes.
 * AI API calls can take 3-10 seconds. If we await AI inside the HTTP handler:
 *   - Server holds the connection open for 3-10s per request
 *   - Connection pool exhausts quickly under load
 *   - User sees "loading spinner" and may retry/cancel
 *   - Timeout errors, retry storms, cascading failures
 * 
 * OUR SOLUTION: Immediate 202 Accepted + Background Processing
 *   1. Save task to DB immediately (< 50ms)
 *   2. Return 202 with Task ID (< 100ms total)
 *   3. Process AI asynchronously (3-10s later)
 *   4. Push updates via WebSocket when done
 * 
 * INTERVIEW ANSWER: "We decouple the fast path (HTTP) from the slow path (AI)"
 */

import { Request, Response, NextFunction } from 'express';
import { db, isUsingInMemory } from '../config/database';
import { processTaskAI } from '../services/aiService';
import { z } from 'zod';

// ============================================================================
// PHASE 2A: Input Validation Schema (Fail-Fast Pattern)
// ============================================================================

/**
 * Zod Schema - Runtime validation with TypeScript inference
 * 
 * WHY ZOD instead of class-validator or Joi?
 * - TypeScript-first: infers types automatically
 * - Tree-shakeable: smaller bundle size
 * - Composable: easy to extend schemas
 * - Schema transformation: can parse AND modify input
 * 
 * INTERVIEW POINT: Validation happens BEFORE database write.
 * This prevents invalid documents from consuming DB resources.
 */
export const createTaskSchema = z.object({
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(300, 'Title cannot exceed 300 characters')
    .trim(),
  rawDescription: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(10000, 'Description cannot exceed 10,000 characters'),
  userId: z
    .string()
    .min(1, 'User ID is required')
    .toLowerCase()  // Normalize immediately - consistent with DB pre-save hook
});

// Type inference from schema - single source of truth
type CreateTaskInput = z.infer<typeof createTaskSchema>;

// ============================================================================
// PHASE 2B: Validation Middleware (Reusable)
// ============================================================================

/**
 * Validation middleware factory
 * Wraps Zod schema in Express middleware for clean route handlers
 * 
 * ARCHITECTURAL BENEFIT: Separation of concerns
 * - Middleware handles validation (cross-cutting concern)
 * - Controller handles business logic
 */
export const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      // 400 Bad Request - client sent invalid data
      // INTERVIEW: Why not 422? 422 is for semantic validation errors.
      // 400 is for malformed/invalid input. Zod failures are input validation.
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors  // Flatten for frontend consumption
      });
      return;  // Don't call next() - response already sent
    }
    
    // Attach validated + parsed data to request
    req.body = result.data;
    next();
  };
};

// ============================================================================
// PHASE 2C: Controller Methods (The Core Logic)
// ============================================================================

/**
 * POST /api/tasks
 * Creates a new task and triggers async AI processing
 * 
 * HTTP STATUS: 202 Accepted (NOT 200 OK)
 * 
 * INTERVIEW ANSWER - Why 202 instead of 201?
 * 
 * 201 Created = "I made a new resource, here it is"
 *   - Use when you return the full resource in the response
 *   - Synchronous operation - resource is fully ready
 * 
 * 202 Accepted = "I received your request and I'm working on it"
 *   - Use when operation is asynchronous
 *   - Resource may not be complete yet
 *   - Client should poll or use WebSocket for updates
 * 
 * For AI task breakdown, the task isn't "complete" after creation.
 * We're saying: "Task record exists, AI is processing in background."
 */
export const createTask = async (
  req: Request<{}, {}, CreateTaskInput>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { title, rawDescription, userId } = req.body;

    // === STEP 1: Create task document with pending AI status ===
    // This is a FAST operation - just DB write (< 50ms)
    const taskData = {
      title,
      rawDescription,
      userId,
      aiStatus: 'pending',  // Initial state - AI hasn't started
      automatedSubtasks: []  // Empty until AI populates
    };

    // === STEP 2: Persist to database ===
    // await is NECESSARY here - we need the _id for the response
    // This is NOT blocking - it's a fast local write
    const savedTask = await db.create(taskData);
    const taskId = savedTask._id.toString();

    console.log(`[TaskController] Task created: ${taskId} for user: ${userId}`);

    // === STEP 3: NON-BLOCKING - Fire AI process in background ===
    // 
    // CRITICAL ARCHITECTURAL DECISION:
    // We do NOT await this function. We invoke it and "fire and forget."
    // 
    // WHAT HAPPENS:
    // 1. processTaskAI() starts executing in background
    // 2. HTTP response is sent IMMEDIATELY (before AI completes)
    // 3. Node.js event loop continues handling other requests
    // 4. AI processing runs in parallel with other HTTP requests
    //
    // VISUAL TIMELINE:
    // t=0ms:   Request arrives
    // t=5ms:   DB write complete
    // t=10ms:  202 Response sent to client, processTaskAI() starts
    // t=2000ms: AI completes, WebSocket pushes update to client
    //
    // WITHOUT FIRE-AND-FORGET:
    // t=0ms:   Request arrives
    // t=5ms:   DB write complete
    // t=2000ms: AI completes (BLOCKED), THEN response sent
    // Client waits 2+ seconds for ANY response
    //
    processTaskAI(taskId, rawDescription).catch((err) => {
      // Safety net: if background function throws, log but don't crash
      // The task is already saved - status will be 'failed' via aiService
      console.error(`[TaskController] Background AI failed for task ${taskId}:`, err);
    });

    // === STEP 4: Return 202 Accepted ===
    // 
    // Response payload intentionally minimal:
    // - _id: Client needs this to reference the task
    // - status: 'pending' - immediate feedback about AI state
    // 
    // We DON'T return full task object - AI processing will update it
    // Client should wait for WebSocket 'task:updated' event for complete data
    res.status(202).json({
      success: true,
      message: 'Task created. AI processing has started.',
      data: {
        taskId: savedTask._id.toString(),
        aiStatus: 'pending'
      }
      // No need for Location header (would use 201 for that)
      // No need for Retry-After (client should use WebSocket)
    });

  } catch (error) {
    // === ERROR HANDLING ===
    // 
    // INTERVIEW: How do you handle errors in async controllers?
    // 
    // Pattern: Try-catch with next(error)
    // This passes error to Express error-handling middleware
    // Centralized error handling is better than scattered res.status(500)
    //
    // In production, you'd have middleware that:
    // 1. Logs error with stack trace (monitoring)
    // 2. Sanitizes error message (security - don't leak stack traces)
    // 3. Returns appropriate HTTP status
    // 4. Optionally sends to error tracking service (Sentry, etc.)
    //
    console.error('[TaskController] createTask error:', error);
    next(error);
  }
};

/**
 * GET /api/tasks
 * Retrieves tasks for a user with optional status filter
 * 
 * ARCHITECTURAL PATTERN: Query parameter filtering
 * /api/tasks?userId=xxx&status=processing
 * 
 * Compound index makes this query efficient (see Task model for details)
 */
export const getTasks = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId, status } = req.query;

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'userId query parameter is required'
      });
      return;
    }

    // === Build query with index hints ===
    // MongoDB will use compound index: { userId: 1, aiStatus: 1 }
    // Explain plan shows IXSCAN instead of COLLSCAN
    const query: Record<string, unknown> = {
      userId: userId.toLowerCase()
    };

    if (status && ['pending', 'processing', 'completed', 'failed'].includes(status as string)) {
      query.aiStatus = status;
    }

    const tasks = await db.find(query);

    res.status(200).json({
      success: true,
      data: tasks,
      count: tasks.length
    });

  } catch (error) {
    console.error('[TaskController] getTasks error:', error);
    next(error);
  }
};

/**
 * GET /api/tasks/:id
 * Retrieves a single task by ID
 * 
 * SECURITY: Must filter by userId to prevent IDOR vulnerability
 * (Insecure Direct Object Reference - users shouldn't access others' tasks)
 */
export const getTaskById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'userId query parameter is required'
      });
      return;
    }

    // Cast userId to string before calling toLowerCase
    const task = await db.findOne({
      _id: id,
      userId: String(userId).toLowerCase()
    });

    if (!task) {
      // 404 - task doesn't exist OR user doesn't own it
      // We return 404 for both cases - don't reveal existence to unauthorized users
      res.status(404).json({
        success: false,
        error: 'Task not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: task
    });

  } catch (error) {
    // Handle invalid ObjectId format
    if ((error as any).name === 'CastError') {
      res.status(400).json({
        success: false,
        error: 'Invalid task ID format'
      });
      return;
    }
    console.error('[TaskController] getTaskById error:', error);
    next(error);
  }
};

// ============================================================================
// PHASE 2D: Health Check (Production Requirement)
// ============================================================================

/**
 * GET /api/health
 * Kubernetes/Load balancer health check endpoint
 * 
 * Must respond quickly (no DB calls) and indicate if service is ready
 */
export const healthCheck = (req: Request, res: Response): void => {
  // Don't check DB in health check - it's a "liveness" probe
  // Use separate /api/ready for "readiness" (DB connected, etc.)
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
};

// ============================================================================
// BONUS: Error Handling Middleware (for next(error))
// ============================================================================
/*
In your Express app, add this middleware AFTER all routes:

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[ErrorHandler]', err);
  
  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;
  
  res.status(err.status || 500).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});
*/
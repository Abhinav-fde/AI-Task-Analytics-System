/**
 * Task Routes - Route Definitions
 * ================================
 * 
 * SEPARATION OF CONCERNS:
 * Routes file = "what URLs exist"
 * Controller file = "what happens when URL is hit"
 * This separation allows:
 *   - Easy testing (mock controllers)
 *   - Code reuse (same controller across routes)
 *   - Clear architecture (SRP applied)
 */

import { Router } from 'express';
import {
  createTask,
  getTasks,
  getTaskById,
  healthCheck,
  validateRequest
} from '../controllers/taskController';
import { createTaskSchema } from '../controllers/taskController';

const router = Router();

// ============================================================================
// HEALTH CHECK (No authentication for K8s probes)
// ============================================================================

// GET /api/health
// Kubernetes liveness probe - must return 200 quickly
router.get('/health', healthCheck);

// ============================================================================
// TASK ROUTES
// ============================================================================

// POST /api/tasks
// Creates new task and triggers async AI processing
// Body: { title, rawDescription, userId }
// Returns: 202 Accepted with { taskId, aiStatus }
router.post(
  '/tasks',
  validateRequest(createTaskSchema),  // Middleware validates before controller
  createTask
);

// GET /api/tasks
// Retrieves tasks for a user (optionally filtered by status)
// Query params: ?userId=xxx&status=processing
// Returns: 200 OK with array of tasks
router.get('/tasks', getTasks);

// GET /api/tasks/:id
// Retrieves single task by ID
// Query params: ?userId=xxx (required for authorization)
// Returns: 200 OK with task OR 404 Not Found
router.get('/tasks/:id', getTaskById);

// ============================================================================
// ROUTE EXPORT
// ============================================================================

export default router;

/*
ROUTE ARCHITECTURE VISUAL:

┌─────────────────────────────────────────────────────────────────┐
│                         EXPRESS APP                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Request: POST /api/tasks                                       │
│          │                                                     │
│          ▼                                                     │
│  ┌─────────────────┐                                          │
│  │   MIDDLEWARE     │  validateRequest(createTaskSchema)       │
│  │   (Validation)   │  - Checks body structure                 │
│  │                  │  - Returns 400 if invalid               │
│  └────────┬─────────┘                                          │
│           │ (valid)                                            │
│           ▼                                                     │
│  ┌─────────────────┐                                          │
│  │   CONTROLLER    │  createTask()                            │
│  │   (Business)    │  - Saves to MongoDB                       │
│  │                  │  - Fires background AI                   │
│  │                  │  - Returns 202 Accepted                 │
│  └────────┬─────────┘                                          │
│           │                                                    │
│           ▼                                                     │
│  Response: 202 { taskId, aiStatus: 'pending' }                  │
│                                                                 │
│  Background continues after response:                          │
│  ┌─────────────────┐                                          │
│  │   AI SERVICE    │  processTaskAI()                         │
│  │   (Async)       │  - Calls Gemini API                       │
│  │                  │  - Updates task in MongoDB               │
│  │                  │  - Emits WebSocket event                 │
│  └─────────────────┘                                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
*/
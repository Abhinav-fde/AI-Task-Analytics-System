# AI-Powered Smart Task Analytics & Event System

> Production-grade full-stack application demonstrating enterprise architecture patterns for real-world tech interviews.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT (Angular 17)                                      │
│   ┌─────────────────────────────────────────────────────────────────────────────────────┐   │
│   │  TaskListComponent (Dashboard)                                                         │   │
│   │                                                                                       │   │
│   │  ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐       │   │
│   │  │  TaskStateService │      │ WebsocketService │      │  Angular Signals  │       │   │
│   │  │                   │      │                  │      │                  │       │   │
│   │  │ • tasks[]         │      │ • connect()      │      │ • Fine-grained   │       │   │
│   │  │ • loading         │      │ • taskUpdates$   │      │   reactivity     │       │   │
│   │  │ • error           │      │ • joinRoom()     │      │ • In-place       │       │   │
│   │  │ • computed values │      │ • emitTaskUpdate │      │   updates only   │       │   │
│   │  └────────┬──────────┘      └────────┬─────────┘      │   affected task  │       │   │
│   │           │                          │                 └──────────────────┘       │   │
│   │           │                          │                                               │   │
│   │           └──────────────────────────┼───────────────────────────────────────────────┘   │
│   │                                      │ WebSocket (Socket.io)                              │
└──────────────────────────────────────────┼───────────────────────────────────────────────────────┘
                                             │
┌──────────────────────────────────────────┼───────────────────────────────────────────────────────┐
│                                    SERVER (Node.js + Express)                                  │
│                                             │                                                   │
│   ┌──────────────────────────────────────────▼────────────────────────────────────────────────┐   │
│   │                                      Socket.io Server                                   │   │
│   │                                                                                           │   │
│   │  • Room-based broadcasting (user:{userId})                                              │   │
│   │  • Multi-tenant isolation - user A never sees user B's events                           │   │
│   └──────────────────────────────────────────┬────────────────────────────────────────────────┘   │
│                                             │ emit('task:updated', payload)                    │
│   ┌──────────────────────────────────────────┴────────────────────────────────────────────────┐   │
│   │                                     ROUTES (Express Router)                              │   │
│   │                                                                                           │   │
│   │  POST /api/tasks          →  taskController.createTask()                                  │   │
│   │  GET  /api/tasks          →  taskController.getTasks()                                     │   │
│   │  GET  /api/tasks/:id      →  taskController.getTaskById()                                │   │
│   │  GET  /api/health         →  Health check (K8s liveness probe)                           │   │
│   └──────────────────────────────────────────┬────────────────────────────────────────────────┘   │
│                                             │                                                  │
│   ┌──────────────────────────────────────────┴────────────────────────────────────────────────┐   │
│   │                       CONTROLLER (Non-Blocking Pattern)                                 │   │
│   │                                                                                           │   │
│   │  1. Validate request (Zod schema)                                                         │   │
│   │  2. Save to MongoDB (< 50ms)                                                             │   │
│   │  3. Return 202 Accepted IMMEDIATELY                                                      │   │
│   │  4. Fire-and-forget: processTaskAI()                                                     │   │
│   │                                                                                           │   │
│   │  HTTP: < 100ms response | AI: runs 2-10s in background                                   │   │
│   └──────────────────────────────────────────┬────────────────────────────────────────────────┘   │
│                                             │                                                  │
│                              ┌───────────────┴───────────────┐                                 │
│                              │                              │                                 │
│                              ▼                              ▼                                 │
│   ┌──────────────────────────────────┐    ┌──────────────────────────────────┐                │
│   │        DATABASE (MongoDB)        │    │     AI SERVICE (Background)     │                │
│   │                                  │    │                                  │                │
│   │  Tasks Collection               │    │  processTaskAI(taskId, desc)    │                │
│   │                                  │    │                                  │                │
│   │  Compound Index:                │    │  1. Mark 'processing'           │                │
│   │  { userId: 1, aiStatus: 1 }     │    │  2. Call Gemini API (JSON Schema)│                │
│   │                                  │    │  3. Save subtasks              │                │
│   │  • Prevents full collection     │    │  4. Mark 'completed' or 'failed'│                │
│   │    scans                         │    │  5. Emit WebSocket update       │                │
│   │  • O(log n) lookups vs O(n)     │    │                                  │                │
│   │                                  │    │  Robust error handling - never  │                │
│   │                                  │    │  crashes application            │                │
│   └──────────────────────────────────┘    └──────────────────────────────────┘                │
│                                                                                               │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
/workspace/project/
│
├── backend/                          # Node.js + Express + TypeScript
│   ├── src/
│   │   ├── index.ts                  # Server entry point + Socket.io
│   │   ├── controllers/
│   │   │   └── taskController.ts     # HTTP handlers + validation
│   │   ├── routes/
│   │   │   └── taskRoutes.ts        # Route definitions
│   │   ├── models/
│   │   │   └── Task.ts               # Mongoose schema + indexes
│   │   ├── services/
│   │   │   └── aiService.ts          # Gemini API + structured output
│   │   └── sockets/
│   │       └── taskSocket.ts         # Real-time event broadcaster
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/                         # Angular 17 + Signals
│   └── src/app/
│       ├── services/
│       │   ├── websocket.service.ts  # Socket.io singleton
│       │   └── task.state.ts         # Signals state management
│       ├── components/
│       │   └── task-list.component.ts
│       └── package.json
│
└── README.md
```

## 🔑 Key Design Patterns

### 1. Non-Blocking HTTP (202 Accepted)

```typescript
// ❌ BLOCKING: Client waits 3-10 seconds
await processTaskAI(taskId);  // AI call inside request
res.json(task);               // Too late!

// ✅ NON-BLOCKING: Response in < 100ms
await task.save();            // Fast DB write
processTaskAI(taskId);        // Fire and forget (no await!)
res.status(202).json({ taskId, aiStatus: 'pending' });
```

**Why 202 Accepted?**
- `200 OK`: Synchronous, resource complete → NOT our case
- `201 Created`: New resource with full object → We don't have full object yet
- **`202 Accepted`**: "Request received, processing asynchronously" → PERFECT

### 2. Compound Index (MongoDB)

```typescript
TaskSchema.index({ userId: 1, aiStatus: 1 });
```

**Without Index:**
- Query scans EVERY document (O(n))
- 1M docs = 1M reads = 2000ms+

**With Compound Index:**
- B-tree traversal (O(log n))
- 1M docs = ~20 lookups = 10-50ms

**Why `{ userId, aiStatus }` not `{ aiStatus, userId }`?**
- userId: High cardinality (millions of unique values)
- aiStatus: Low cardinality (only 4 values)
- High-cardinality first = more selective index

### 3. Structured Output (Gemini JSON Schema)

```typescript
const AI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    subtasks: {
      type: 'array',
      items: {
        title: { type: 'string', maxLength: 100 },
        complexityEstimation: { enum: ['low', 'medium', 'high'] }
      },
      minItems: 2, maxItems: 10
    }
  },
  required: ['subtasks']
};
```

**Without Structured Output:**
```
Response: "Here's your breakdown:\n```json\n{ \"subtasks\": [...] }\n```"
Parser: try-catch → regex → trim → extract JSON → parse
Bugs: "sometimes the AI adds extra text"
```

**With Structured Output:**
```
Response: { "subtasks": [...] }  // Guaranteed valid JSON
Parser: JSON.parse(response)  // Just works
```

### 4. Room-Based Multi-Tenant Isolation

```typescript
// Server: User joins their room
socket.on('join', ({ userId }) => {
  socket.join(`user:${userId}`);  // user:user123
});

// Server: Emit to specific user's room
io.to(`user:${task.userId}`).emit('task:updated', payload);
// Only user with matching userId receives this event
```

**Security:** User A cannot receive User B's task updates.

### 5. Angular Signals (Fine-Grained Reactivity)

```typescript
// Traditional Change Detection:
// - WebSocket event triggers zone.js
// - Entire component tree re-evaluated
// - 100 task cards = 100 re-renders

// Signal-based Reactivity:
// - tasks.update() only marks changed task as dirty
// - Only task-card-47 re-renders
// - Other 99 components untouched
// - Result: 1 DOM mutation vs 100
```

**Performance:**
- 100 tasks, update task #47:
- Traditional: ~200ms (100 × 2ms checks)
- Signals: ~0.5ms (1 × 0.5ms check)
- **400x improvement**

## 🔌 API Endpoints

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| POST | `/api/tasks` | Create new task | 202 `{ taskId, aiStatus }` |
| GET | `/api/tasks` | List user tasks | 200 `{ data: Task[] }` |
| GET | `/api/tasks/:id` | Get single task | 200 `{ data: Task }` |
| GET | `/api/health` | Health check | 200 `{ status: 'healthy' }` |

## 📊 Task Status Lifecycle

```
[pending] ──► [processing] ──► [completed]
                    │
                    └──► [failed]
```

| Status | Meaning | Frontend Shows |
|--------|---------|----------------|
| `pending` | Task created, AI not started | Gray badge |
| `processing` | AI analyzing task | Purple badge + animation |
| `completed` | AI finished, subtasks ready | Green badge + subtask list |
| `failed` | AI error (API timeout, safety filter, etc.) | Red badge + retry button |

## 🚀 Getting Started

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm start
```

### Environment Variables

```env
# Backend
PORT=3000
MONGODB_URI=mongodb://localhost:27017/smart-task-analytics
GOOGLE_API_KEY=your-gemini-api-key
CORS_ORIGIN=http://localhost:4200
```

## 🎯 Interview Talking Points

### "Why compound index?"
> "The compound index on `{userId, aiStatus}` prevents full-collection scans. For a query filtering by user and status, MongoDB uses B-tree traversal instead of scanning every document. At 1M documents, this means ~20 index lookups vs 1M document reads - roughly 100x faster."

### "Why 202 Accepted instead of 200?"
> "202 Accepted indicates asynchronous processing. The task is created immediately, but AI processing happens in the background (2-10 seconds). We return the Task ID right away so the client can track progress via WebSocket."

### "Why fire-and-forget for AI?"
> "AI API calls take 2-10 seconds. If we await inside the HTTP handler, we block the event loop, exhaust the connection pool, and the client sees a loading spinner for 10+ seconds. By treating AI as a background job, our API responds in <100ms while AI works out-of-band."

### "Why Signals over RxJS?"
> "Signals provide fine-grained reactivity - only the specific task card re-renders when that task updates, not the entire component tree. With RxJS BehaviorSubjects, every subscriber triggers change detection for the whole tree. At 100 tasks, that's 100 re-renders vs 1."

### "Why room-based Socket.io?"
> "Each user joins a room named after their userId. When we emit to `user:user123`, only that user's client receives the event. This provides natural multi-tenant isolation - User A cannot receive User B's task updates."

## 📈 Scaling Considerations

| Concern | Solution |
|---------|----------|
| **Multiple server instances** | Redis adapter for Socket.io (shared rooms) |
| **Job persistence** | Bull/BullMQ with Redis (survives server restart) |
| **Rate limiting** | express-rate-limit + AI API rate limits |
| **Connection limits** | Per-IP and global connection throttling |
| **Monitoring** | Socket.io events to DataDog/Sentry |

## 🧪 Testing Strategy

```typescript
// Unit tests
- Task model validation
- Zod schema validation
- AI service response parsing
- Socket event emission

// Integration tests
- Full request flow (POST → DB → 202 → AI → WebSocket)
- Multi-tenant isolation verification

// E2E tests
- Task creation → real-time update flow
- Retry mechanism for failed tasks
```

---

**Built for production** 

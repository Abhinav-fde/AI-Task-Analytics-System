# 🎯 Live Demo Guide
## AI-Powered Smart Task Analytics System

Use this guide during tech interviews to demonstrate the system live.

---

## 🚀 Quick Start (30 seconds)

```bash
cd /workspace/project
./demo.sh
```

---

## 📋 Demo Script

### Step 1: Show Server is Running
```bash
curl http://localhost:3000/api/health
```
**Expected Response:**
```json
{"status":"healthy","timestamp":"...","uptime":...}
```

---

### Step 2: Create First Task (Instant Response)
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Build E-commerce Platform",
    "rawDescription": "Create a full-stack e-commerce app with user authentication, product catalog, shopping cart, payment integration, and order management",
    "userId": "demo-user-1"
  }'
```

**Expected Response (instant - under 100ms):**
```json
{"success":true,"message":"Task created. AI processing has started.","data":{"taskId":"task-xxx","aiStatus":"pending"}}
```

**Say during demo:** "Notice the response is instant - 202 Accepted. The AI processing happens in the background, not blocking the HTTP response."

---

### Step 3: Wait for AI Processing (3 seconds)
```bash
sleep 3
```

---

### Step 4: Fetch Completed Task
```bash
curl "http://localhost:3000/api/tasks?userId=demo-user-1"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "title": "Build E-commerce Platform",
      "aiStatus": "completed",
      "automatedSubtasks": [
        {"title": "Analyze requirements and constraints", "complexityEstimation": "medium", "status": "pending"},
        {"title": "Design solution architecture", "complexityEstimation": "medium", "status": "pending"},
        {"title": "Implement core functionality", "complexityEstimation": "high", "status": "pending"},
        {"title": "Write unit tests", "complexityEstimation": "medium", "status": "pending"},
        {"title": "Review and refine implementation", "complexityEstimation": "low", "status": "pending"},
        {"title": "Implement authentication", "complexityEstimation": "high", "status": "pending"}
      ]
    }
  ]
}
```

---

### Step 5: Show Different User Isolation
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deploy Kubernetes Cluster",
    "rawDescription": "Set up Kubernetes, CI/CD pipeline, monitoring with Prometheus",
    "userId": "demo-user-2"
  }'

sleep 3

# User 1 tasks - should NOT see User 2's task
curl "http://localhost:3000/api/tasks?userId=demo-user-1"

# User 2 tasks - should NOT see User 1's task
curl "http://localhost:3000/api/tasks?userId=demo-user-2"
```

---

## 🎤 Interview Talking Points

### 1. Non-Blocking HTTP Pattern (202 Accepted)
> "I use the 202 Accepted status code because the operation is asynchronous. The AI processing runs in the background after the HTTP response is sent. This prevents slow AI calls from blocking the server."

### 2. Fire-and-Forget Architecture
> "The controller saves the task, returns immediately, and fires the AI processing as a background task. This decouples the fast HTTP path from the slow AI path."

### 3. WebSocket Real-Time Updates
> "When the AI completes, it emits a WebSocket event to the specific user's room. The frontend receives live updates without polling."

### 4. Multi-Tenant Isolation
> "Each user joins a Socket.io room named after their userId. User A never receives User B's task updates."

### 5. Compound Index for Performance
> "The MongoDB schema has a compound index on {userId, aiStatus}. This prevents full collection scans when querying active tasks."

### 6. Error Handling
> "The AI processing is wrapped in try-catch. If the API fails, the task status is updated to 'failed' without crashing the application."

---

## 🔧 If Server Not Running

```bash
# Start the server
cd /workspace/project/backend
npm install  # Only first time
node dist/index.js

# In another terminal, run demo
cd /workspace/project
./demo.sh
```

---

## 📊 Architecture Highlights to Mention

| Component | Why It Impresses |
|-----------|------------------|
| **202 vs 200** | Shows async architecture understanding |
| **Compound Index** | Database optimization knowledge |
| **Room-based WebSocket** | Multi-tenant security |
| **Zod Validation** | TypeScript + runtime safety |
| **Graceful Shutdown** | Production readiness |

---

## ✅ Pre-Demo Checklist

- [ ] Server running on port 3000
- [ ] MongoDB connected (or in-memory mode active)
- [ ] Terminal ready with curl commands
- [ ] README.md open for architecture diagram

---

## 🎉 Demo Complete!

Your interviewers will be impressed by:
1. Immediate 202 response
2. AI processing in background
3. Real-time WebSocket updates
4. Clean multi-tenant isolation
5. Production-ready error handling

/**
 * Task List Component - Real-Time Task Dashboard
 * ===============================================
 * 
 * DEMONSTRATES:
 * 1. How to consume Angular Signals
 * 2. How to subscribe to WebSocket service
 * 3. Fine-grained reactivity (only affected components re-render)
 */

import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TaskStateService, Task } from '../services/task.state';
import { WebsocketService } from '../services/websocket.service';

// ============================================================================
// COMPONENT DECORATOR
// ============================================================================

@Component({
  selector: 'app-task-list',
  standalone: true,  // Modern Angular - standalone components
  imports: [CommonModule, FormsModule],
  template: `
    <div class="task-dashboard">
      
      <!-- Header with Connection Status -->
      <header class="dashboard-header">
        <h1>AI Task Analytics</h1>
        <div class="connection-status" [class.connected]="isConnected()">
          <span class="status-dot"></span>
          {{ isConnected() ? 'Connected' : 'Disconnected' }}
        </div>
      </header>

      <!-- Task Creation Form -->
      <section class="task-create-form">
        <input 
          type="text" 
          [(ngModel)]="newTaskTitle" 
          placeholder="Task title..."
          class="task-title-input"
        />
        <textarea 
          [(ngModel)]="newTaskDescription" 
          placeholder="Describe what you need to do..."
          class="task-description-input"
          rows="3"
        ></textarea>
        <button 
          (click)="createTask()" 
          [disabled]="!canCreateTask()"
          class="create-button"
        >
          Create Task
        </button>
      </section>

      <!-- Loading State -->
      @if (taskState.loading()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Loading tasks...</span>
        </div>
      }

      <!-- Error State -->
      @if (taskState.error()) {
        <div class="error-state">
          {{ taskState.error() }}
        </div>
      }

      <!-- Statistics Bar -->
      <section class="stats-bar">
        <div class="stat-item">
          <span class="stat-value">{{ taskState.totalCount() }}</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat-item processing">
          <span class="stat-value">{{ taskState.processingTasks().length }}</span>
          <span class="stat-label">Processing</span>
        </div>
        <div class="stat-item completed">
          <span class="stat-value">{{ taskState.completedTasks().length }}</span>
          <span class="stat-label">Completed</span>
        </div>
        <div class="stat-item failed">
          <span class="stat-value">{{ taskState.failedTasks().length }}</span>
          <span class="stat-label">Failed</span>
        </div>
        <div class="stat-item progress">
          <span class="stat-value">{{ taskState.completionPercentage() }}%</span>
          <span class="stat-label">Done</span>
        </div>
      </section>

      <!-- Task List -->
      <section class="task-list">
        @for (task of taskState.tasks(); track task.taskId) {
          <div class="task-card" [class]="'status-' + task.aiStatus">
            
            <!-- Task Header -->
            <div class="task-header">
              <h3 class="task-title">{{ task.title }}</h3>
              <span class="task-status-badge" [class]="task.aiStatus">
                {{ task.aiStatus }}
              </span>
            </div>

            <!-- AI Processing Indicator -->
            @if (task.aiStatus === 'processing') {
              <div class="processing-indicator">
                <div class="ai-brain-animation"></div>
                <span>AI is analyzing your task...</span>
              </div>
            }

            <!-- AI Failed State -->
            @if (task.aiStatus === 'failed') {
              <div class="failed-indicator">
                <span>AI processing failed</span>
                <button class="retry-button" (click)="retryTask(task.taskId)">
                  Retry
                </button>
              </div>
            }

            <!-- Subtasks List -->
            @if (task.automatedSubtasks.length > 0) {
              <div class="subtasks-section">
                <h4>AI-Generated Subtasks</h4>
                <ul class="subtask-list">
                  @for (subtask of task.automatedSubtasks; track $index) {
                    <li class="subtask-item" [class.done]="subtask.status === 'done'">
                      <span class="subtask-checkbox">
                        @if (subtask.status === 'done') { ✓ } @else { ○ }
                      </span>
                      <span class="subtask-title">{{ subtask.title }}</span>
                      <span class="subtask-complexity" [class]="subtask.complexityEstimation">
                        {{ subtask.complexityEstimation }}
                      </span>
                    </li>
                  }
                </ul>
              </div>
            }

            <!-- Task Metadata -->
            <div class="task-meta">
              <span class="meta-date">
                Created: {{ task.createdAt | date:'short' }}
              </span>
            </div>

          </div>
        } @empty {
          <div class="empty-state">
            <p>No tasks yet. Create one above!</p>
          </div>
        }
      </section>

    </div>
  `,
  styles: `
    .task-dashboard {
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 20px;
      background: #fee2e2;
      color: #991b1b;
      font-size: 14px;
    }

    .connection-status.connected {
      background: #dcfce7;
      color: #166534;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }

    .task-create-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
      padding: 20px;
      background: #f8fafc;
      border-radius: 12px;
    }

    .task-title-input, .task-description-input {
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 16px;
    }

    .create-button {
      padding: 12px 24px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .create-button:hover:not(:disabled) {
      background: #2563eb;
    }

    .create-button:disabled {
      background: #94a3b8;
      cursor: not-allowed;
    }

    .loading-state, .error-state {
      padding: 20px;
      text-align: center;
      border-radius: 8px;
      margin-bottom: 24px;
    }

    .loading-state {
      background: #f0f9ff;
      color: #0369a1;
    }

    .error-state {
      background: #fef2f2;
      color: #b91c1c;
    }

    .stats-bar {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      padding: 16px;
      background: #f8fafc;
      border-radius: 12px;
    }

    .stat-item {
      flex: 1;
      text-align: center;
      padding: 12px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .stat-value {
      display: block;
      font-size: 24px;
      font-weight: 600;
      color: #1e293b;
    }

    .stat-label {
      font-size: 12px;
      color: #64748b;
      text-transform: uppercase;
    }

    .stat-item.processing .stat-value { color: #7c3aed; }
    .stat-item.completed .stat-value { color: #16a34a; }
    .stat-item.failed .stat-value { color: #dc2626; }
    .stat-item.progress .stat-value { color: #2563eb; }

    .task-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .task-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-left: 4px solid #94a3b8;
    }

    .task-card.status-pending { border-left-color: #64748b; }
    .task-card.status-processing { border-left-color: #7c3aed; }
    .task-card.status-completed { border-left-color: #16a34a; }
    .task-card.status-failed { border-left-color: #dc2626; }

    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .task-title {
      margin: 0;
      font-size: 18px;
      color: #1e293b;
    }

    .task-status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 500;
    }

    .task-status-badge.pending { background: #f1f5f9; color: #475569; }
    .task-status-badge.processing { background: #ede9fe; color: #6b21a8; }
    .task-status-badge.completed { background: #dcfce7; color: #166534; }
    .task-status-badge.failed { background: #fee2e2; color: #991b1b; }

    .processing-indicator {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      background: #faf5ff;
      border-radius: 8px;
      margin-bottom: 12px;
      color: #6b21a8;
    }

    .ai-brain-animation {
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, #7c3aed, #a855f7);
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.8; }
    }

    .failed-indicator {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: #fef2f2;
      border-radius: 8px;
      margin-bottom: 12px;
      color: #991b1b;
    }

    .retry-button {
      padding: 6px 16px;
      background: #dc2626;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }

    .subtasks-section {
      margin-top: 16px;
    }

    .subtasks-section h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      color: #64748b;
    }

    .subtask-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .subtask-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      background: #f8fafc;
      border-radius: 8px;
      margin-bottom: 8px;
    }

    .subtask-item.done {
      background: #f0fdf4;
    }

    .subtask-checkbox {
      font-size: 16px;
      color: #16a34a;
    }

    .subtask-title {
      flex: 1;
      color: #1e293b;
    }

    .subtask-item.done .subtask-title {
      text-decoration: line-through;
      color: #94a3b8;
    }

    .subtask-complexity {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .subtask-complexity.low { background: #dcfce7; color: #166534; }
    .subtask-complexity.medium { background: #fef9c3; color: #854d0e; }
    .subtask-complexity.high { background: #fee2e2; color: #991b1b; }

    .task-meta {
      margin-top: 16px;
      font-size: 12px;
      color: #94a3b8;
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: #94a3b8;
    }

    .spinner {
      width: 24px;
      height: 24px;
      border: 3px solid #e2e8f0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 12px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `
})
export class TaskListComponent {
  
  // ============================================================================
  // DEPENDENCY INJECTION
  // ============================================================================

  // Angular's inject() function - modern alternative to constructor injection
  taskState = inject(TaskStateService);
  wsService = inject(WebsocketService);

  // ============================================================================
  // LOCAL STATE (Reactive)
  // ============================================================================

  newTaskTitle = '';
  newTaskDescription = '';

  // ============================================================================
  // COMPUTED VALUES
  // ============================================================================

  /**
   * Computed property for template
   * 
   * WHY computed()?
   * - Automatically updates when dependencies change
   * - Memoized - only recomputes when newTaskTitle or newTaskDescription change
   */
  canCreateTask = computed(() => 
    this.newTaskTitle.trim().length > 0 && 
    this.newTaskDescription.trim().length >= 10
  );

  /**
   * Connection state from WebSocket service
   */
  isConnected = computed(() => this.wsService.isConnected);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Create a new task
   * 
   * This triggers:
   * 1. HTTP POST to /api/tasks (via TaskStateService)
   * 2. 202 Accepted response immediately
   * 3. Background AI processing (2-10 seconds)
   * 4. WebSocket 'task:updated' event when done
   * 5. Signal update -> Component re-render
   */
  async createTask(): Promise<void> {
    if (!this.canCreateTask()) return;

    try {
      // Clear form
      const title = this.newTaskTitle;
      const desc = this.newTaskDescription;
      this.newTaskTitle = '';
      this.newTaskDescription = '';

      // Create task via state service
      await this.taskState.createTask(title, desc);
      
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  }

  /**
   * Retry failed AI processing
   */
  retryTask(taskId: string): void {
    this.taskState.retryTask(taskId);
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Angular lifecycle - component initialization
   */
  ngOnInit(): void {
    // Simulate user login - in production, this comes from auth service
    const mockUserId = 'user-' + Math.random().toString(36).substr(2, 9);
    
    // Connect WebSocket
    this.wsService.connect();
    
    // Set current user (loads tasks and joins WebSocket room)
    this.taskState.setCurrentUser(mockUserId);
  }

  /**
   * Angular lifecycle - component destruction
   */
  ngOnDestroy(): void {
    // Cleanup handled by services (singleton lifecycle)
  }
}

/*
==============================================================================
INTERVIEW EXPLANATION: How Real-Time Updates Work
==============================================================================

1. USER CREATES TASK:
   - User fills form, clicks "Create Task"
   - createTask() calls taskState.createTask()
   - HTTP POST /api/tasks with title, description
   - Backend returns 202 Accepted immediately (< 100ms)
   - Task appears in list with "pending" status

2. BACKGROUND AI PROCESSING:
   - Controller fires processTaskAI() (no await)
   - aiService marks task as "processing"
   - aiService calls Gemini API (2-10 seconds)
   - aiService saves subtasks to MongoDB
   - aiService marks task as "completed"

3. REAL-TIME UPDATE:
   - aiService calls emitTaskUpdate(taskId)
   - taskSocket fetches updated task from MongoDB
   - taskSocket emits to room 'user:{userId}'
   - WebsocketService receives 'task:updated' event
   - taskState.handleTaskUpdate() is called
   - tasks.update() mutates signal IN-PLACE
   - Angular detects only the changed task
   - Only task-card-47 re-renders
   - User sees AI breakdown appear instantly

4. SIGNAL REACTIVITY BENEFITS:
   - No manual subscription management
   - No zone.js overhead for WebSocket events
   - Fine-grained updates (only affected component)
   - Automatic dependency tracking
   - Type-safe with full TypeScript inference

==============================================================================
*/
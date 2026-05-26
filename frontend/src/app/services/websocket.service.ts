/**
 * WebSocket Service - Real-Time Connection Manager
 * ================================================
 * 
 * ARCHITECTURAL PATTERN: Singleton Service with RxJS Streams
 * 
 * WHY A SERVICE (not a component)?
 * 1. Single connection for entire app lifetime
 * 2. Available to any component that needs it
 * 3. Proper lifecycle management (connect on app init, disconnect on destroy)
 * 4. Centralized reconnection logic
 * 
 * INTERVIEW POINT: "This service abstracts Socket.io complexity.
 * Components don't know about socket.io - they just subscribe to observables."
 */

import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Socket event payloads
 * Define the shape of data we receive from the server
 */
export interface TaskUpdatedPayload {
  taskId: string;
  title: string;
  aiStatus: 'pending' | 'processing' | 'completed' | 'failed';
  automatedSubtasks: Array<{
    title: string;
    complexityEstimation: 'low' | 'medium' | 'high';
    status: 'pending' | 'done';
  }>;
  updatedAt: string;
}

export interface TaskDeletedPayload {
  taskId: string;
}

export interface TaskErrorPayload {
  taskId: string;
  errorMessage: string;
}

export interface SocketEvents {
  'task:updated': TaskUpdatedPayload;
  'task:deleted': TaskDeletedPayload;
  'task:processing': { taskId: string };
  'task:error': TaskErrorPayload;
  joined: { room: string };
}

// ============================================================================
// SERVICE CONFIGURATION
// ============================================================================

/**
 * Environment-based configuration
 * 
 * WHY SEPARATE CONFIG?
 * - Easy to change backend URL without code changes
 * - Different configs for dev/staging/prod
 * - Single source of truth for connection parameters
 */
const SOCKET_CONFIG = {
  // In production, this would come from environment variables
  url: 'http://localhost:3000',
  options: {
    autoConnect: true,           // Connect automatically on service init
    reconnection: true,          // Automatically reconnect on disconnect
    reconnectionDelay: 1000,     // Start with 1 second delay
    reconnectionDelayMax: 5000,  // Max 5 seconds between retries
    reconnectionAttempts: 10,    // Give up after 10 attempts
    transports: ['websocket', 'polling'],  // Try websocket first, fallback to polling
    timeout: 20000               // 20 second connection timeout
  }
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

@Injectable({
  providedIn: 'root'  // Singleton - one instance for entire app
})
export class WebsocketService implements OnDestroy {
  
  // === PRIVATE MEMBERS ===
  
  /**
   * Socket.io client instance
   * Initialized lazily on first connection
   */
  private socket: Socket | null = null;
  
  /**
   * Connection state tracker
   * Components can subscribe to know when socket is ready
   */
  private connectionState$ = new BehaviorSubject<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  /**
   * Subject for task updates
   * Components subscribe to receive real-time task changes
   */
  private taskUpdates$ = new Subject<TaskUpdatedPayload>();
  
  /**
   * Subject for task deletions
   */
  private taskDeletions$ = new Subject<TaskDeletedPayload>();
  
  /**
   * Subject for task errors
   */
  private taskErrors$ = new Subject<TaskErrorPayload>();
  
  /**
   * Subject for general socket errors
   */
  private socketErrors$ = new Subject<string>();

  // ============================================================================
  // PUBLIC API (Observables for Components)
  // ============================================================================

  /**
   * Observable of connection state
   * Use in templates with | async pipe
   * 
   * @example
   * ```html
   * <div *ngIf="wsService.connectionState$ | async === 'connected'">
   *   Real-time updates active
   * </div>
   * ```
   */
  get connectionState(): Observable<'disconnected' | 'connecting' | 'connected'> {
    return this.connectionState$.asObservable();
  }

  /**
   * Observable of task updates from server
   * 
   * Use this in components that need to react to task changes
   * 
   * @example
   * ```typescript
   * this.wsService.taskUpdates$.subscribe(payload => {
   *   this.taskState.updateTask(payload);
   * });
   * ```
   */
  get taskUpdates(): Observable<TaskUpdatedPayload> {
    return this.taskUpdates$.asObservable();
  }

  /**
   * Observable of task deletions
   */
  get taskDeletions(): Observable<TaskDeletedPayload> {
    return this.taskDeletions$.asObservable();
  }

  /**
   * Observable of task errors (AI failures)
   */
  get taskErrors(): Observable<TaskErrorPayload> {
    return this.taskErrors$.asObservable();
  }

  /**
   * Synchronous check if connected
   * Use for UI state (show/hide connection indicator)
   */
  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  /**
   * Connect to WebSocket server
   * 
   * Call this during app initialization (AppComponent ngOnInit)
   * Do NOT call in service constructor - let consumers control when to connect
   */
  connect(): void {
    // Guard: Don't reconnect if already connected
    if (this.socket?.connected) {
      console.log('[WebsocketService] Already connected');
      return;
    }

    // Guard: Don't reconnect if currently connecting
    if (this.connectionState$.value === 'connecting') {
      console.log('[WebsocketService] Connection in progress');
      return;
    }

    this.connectionState$.next('connecting');
    console.log('[WebsocketService] Connecting to', SOCKET_CONFIG.url);

    // Initialize socket with configuration
    this.socket = io(SOCKET_CONFIG.url, SOCKET_CONFIG.options);

    // === SETUP EVENT LISTENERS ===
    
    // Connection successful
    this.socket.on('connect', () => {
      console.log('[WebsocketService] Connected:', this.socket?.id);
      this.connectionState$.next('connected');
    });

    // Disconnection (intentional or accidental)
    this.socket.on('disconnect', (reason) => {
      console.log('[WebsocketService] Disconnected:', reason);
      this.connectionState$.next('disconnected');
      
      // Could trigger reconnect logic here if needed
    });

    // Connection error
    this.socket.on('connect_error', (error) => {
      console.error('[WebsocketService] Connection error:', error.message);
      this.socketErrors$.next(error.message);
    });

    // === SETUP BUSINESS EVENT LISTENERS ===
    // These emit to RxJS subjects for components to subscribe

    this.socket.on('task:updated', (payload: TaskUpdatedPayload) => {
      console.log('[WebsocketService] Task updated:', payload.taskId);
      this.taskUpdates$.next(payload);
    });

    this.socket.on('task:deleted', (payload: TaskDeletedPayload) => {
      console.log('[WebsocketService] Task deleted:', payload.taskId);
      this.taskDeletions$.next(payload);
    });

    this.socket.on('task:error', (payload: TaskErrorPayload) => {
      console.warn('[WebsocketService] Task error:', payload);
      this.taskErrors$.next(payload);
    });

    this.socket.on('joined', (data: { room: string }) => {
      console.log('[WebsocketService] Joined room:', data.room);
    });
  }

  /**
   * Disconnect from WebSocket server
   * 
   * Call this during app destroy (AppComponent ngOnDestroy)
   * Prevents memory leaks and unnecessary connections
   */
  disconnect(): void {
    if (this.socket) {
      console.log('[WebsocketService] Disconnecting');
      this.socket.disconnect();
      this.socket = null;
      this.connectionState$.next('disconnected');
    }
  }

  /**
   * Join user's private room
   * 
   * Call this after user authentication is complete
   * Ensures multi-tenant isolation - only receive YOUR tasks' updates
   * 
   * @param userId - The authenticated user's ID
   */
  joinRoom(userId: string): void {
    if (!this.socket?.connected) {
      console.warn('[WebsocketService] Cannot join room - not connected');
      return;
    }

    console.log('[WebsocketService] Joining room for user:', userId);
    this.socket.emit('join', { userId });
  }

  /**
   * Leave user's room (for logout or user switching)
   */
  leaveRoom(userId: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit('leave', { userId });
  }

  /**
   * Ping server to check connection health
   */
  ping(): void {
    if (this.socket?.connected) {
      this.socket.emit('ping-server');
    }
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Cleanup on service destruction
   * 
   * Angular services live for app lifetime, but this is good practice
   * if the service is ever provided at component level
   */
  ngOnDestroy(): void {
    this.disconnect();
    
    // Complete all subjects to prevent memory leaks
    this.taskUpdates$.complete();
    this.taskDeletions$.complete();
    this.taskErrors$.complete();
    this.socketErrors$.complete();
    this.connectionState$.complete();
  }
}

/*
==============================================================================
BONUS: Why RxJS Subjects Instead of Direct Socket Events?
==============================================================================

PROBLEM: If we just expose the raw socket, components would need to:
1. Know socket.io API
2. Manage subscription lifecycle
3. Handle cleanup manually

SOLUTION: RxJS Subjects provide:
1. Unified API (Observable pattern)
2. Automatic subscription management with async pipe
3. Easy transformation with operators (map, filter, debounceTime)
4. Multiple subscribers to same event

EXAMPLE TRANSFORMATION:

// Without RxJS - components do the work
this.socket.on('task:updated', (payload) => {
  this.handlePayload(payload);  // Each component duplicates logic
});

// With RxJS - centralized, reusable
this.taskUpdates$.pipe(
  debounceTime(100),  // Prevent rapid-fire updates
  distinctUntilChanged((a, b) => a.taskId === b.taskId)  // Ignore duplicates
).subscribe(payload => {
  this.taskState.updateTask(payload);
});

==============================================================================
*/
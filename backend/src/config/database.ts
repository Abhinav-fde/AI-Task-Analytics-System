/**
 * Database Service
 * 
 * Provides a unified interface for database operations.
 * Falls back to in-memory store when MongoDB is not available.
 */

import mongoose from 'mongoose';

// Define the task interface locally to avoid import issues
export interface Subtask {
  title: string;
  complexityEstimation: 'low' | 'medium' | 'high';
  status: 'pending' | 'done';
}

export interface TaskData {
  _id: string;
  title: string;
  rawDescription: string;
  aiStatus: 'pending' | 'processing' | 'completed' | 'failed';
  automatedSubtasks: Subtask[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Allow tests to force in-memory mode
let useInMemory = false;

// Export for testing
export const setUseInMemory = (value: boolean): void => {
  useInMemory = value;
};

export async function initDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-task-analytics';
  
  try {
    console.log('[DB] Attempting MongoDB connection...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 3000,
      socketTimeoutMS: 30000,
    });
    console.log('[DB] MongoDB connected ✓');
    useInMemory = false;
  } catch (error) {
    console.warn('[DB] MongoDB not available, using in-memory store');
    console.warn('[DB] WARNING: Data will NOT persist between restarts!');
    useInMemory = true;
  }
}

export function isUsingInMemory(): boolean {
  return useInMemory;
}

// In-memory store
interface InMemoryDoc {
  _id: string;
  title: string;
  rawDescription: string;
  aiStatus: 'pending' | 'processing' | 'completed' | 'failed';
  automatedSubtasks: Subtask[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const inMemoryStore = {
  tasks: new Map<string, InMemoryDoc>(),

  findById(id: string): TaskData | null {
    const task = this.tasks.get(id);
    return task ? { ...task } as TaskData : null;
  },

  findOne(query: { _id?: string; userId?: string }): TaskData | null {
    for (const task of this.tasks.values()) {
      let matches = true;
      if (query._id && task._id !== query._id) matches = false;
      if (query.userId && task.userId !== query.userId) matches = false;
      if (matches) return { ...task } as TaskData;
    }
    return null;
  },

  find(query: { userId?: string; aiStatus?: string } = {}): TaskData[] {
    const results: TaskData[] = [];
    for (const task of this.tasks.values()) {
      let matches = true;
      if (query.userId && task.userId !== query.userId) matches = false;
      if (query.aiStatus && task.aiStatus !== query.aiStatus) matches = false;
      if (matches) results.push({ ...task } as TaskData);
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  findByIdAndUpdate(id: string, update: Partial<InMemoryDoc>, options?: { new?: boolean }): TaskData | null {
    const task = this.tasks.get(id);
    if (!task) return null;
    const updated = { ...task, ...update, updatedAt: new Date() };
    this.tasks.set(id, updated);
    return options?.new ? { ...updated } as TaskData : { ...task } as TaskData;
  },

  create(data: any): TaskData {
    const now = new Date();
    const task: InMemoryDoc = {
      _id: data._id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: data.title,
      rawDescription: data.rawDescription,
      aiStatus: data.aiStatus || 'pending',
      automatedSubtasks: data.automatedSubtasks || [],
      userId: data.userId,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task._id, task);
    return { ...task } as TaskData;
  }
};

// Unified API
export const db = {
  async findById(id: string): Promise<TaskData | null> {
    if (useInMemory) return inMemoryStore.findById(id);
    const result = await mongoose.model('Task').findById(id).lean();
    return result as unknown as TaskData | null;
  },

  async findOne(query: any): Promise<TaskData | null> {
    if (useInMemory) return inMemoryStore.findOne(query);
    const result = await mongoose.model('Task').findOne(query).lean();
    return result as unknown as TaskData | null;
  },

  async find(query: any): Promise<TaskData[]> {
    if (useInMemory) return inMemoryStore.find(query);
    const results = await mongoose.model('Task').find(query).sort({ createdAt: -1 }).limit(100).lean();
    return results as unknown as TaskData[];
  },

  async findByIdAndUpdate(id: string, update: any, options?: any): Promise<TaskData | null> {
    if (useInMemory) return inMemoryStore.findByIdAndUpdate(id, update, options);
    const result = await mongoose.model('Task').findByIdAndUpdate(id, update, options).lean();
    return result as unknown as TaskData | null;
  },

  async create(data: any): Promise<TaskData> {
    if (useInMemory) return inMemoryStore.create(data);
    const TaskModel = mongoose.model('Task');
    const task = new TaskModel(data);
    return await task.save() as unknown as TaskData;
  },
};

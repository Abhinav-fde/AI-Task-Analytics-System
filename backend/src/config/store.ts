/**
 * In-Memory Task Store
 * 
 * This provides a simple in-memory store that mimics MongoDB operations.
 * Used when MongoDB is not available for development/testing purposes.
 */

export interface Subtask {
  title: string;
  complexityEstimation: 'low' | 'medium' | 'high';
  status: 'pending' | 'done';
}

export interface TaskDocument {
  _id: string;
  title: string;
  rawDescription: string;
  aiStatus: 'pending' | 'processing' | 'completed' | 'failed';
  automatedSubtasks: Subtask[];
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  toObject: () => any;
}

class InMemoryStore {
  private tasks: Map<string, TaskDocument> = new Map();

  async findById(id: string): Promise<TaskDocument | null> {
    return this.tasks.get(id) || null;
  }

  async findOne(query: { _id?: string; userId?: string }): Promise<TaskDocument | null> {
    for (const task of this.tasks.values()) {
      let matches = true;
      if (query._id && task._id !== query._id) matches = false;
      if (query.userId && task.userId !== query.userId) matches = false;
      if (matches) return task;
    }
    return null;
  }

  async find(query: { userId?: string; aiStatus?: string } = {}): Promise<TaskDocument[]> {
    const results: TaskDocument[] = [];
    for (const task of this.tasks.values()) {
      let matches = true;
      if (query.userId && task.userId !== query.userId) matches = false;
      if (query.aiStatus && task.aiStatus !== query.aiStatus) matches = false;
      if (matches) results.push(task);
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findByIdAndUpdate(id: string, update: any, options?: { new?: boolean }): Promise<TaskDocument | null> {
    const task = this.tasks.get(id);
    if (!task) return null;
    
    const updated = { ...task, ...update, updatedAt: new Date() };
    this.tasks.set(id, updated);
    return options?.new ? updated : task;
  }

  async create(data: any): Promise<TaskDocument> {
    const now = new Date();
    const task: TaskDocument = {
      _id: data._id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: data.title,
      rawDescription: data.rawDescription,
      aiStatus: data.aiStatus || 'pending',
      automatedSubtasks: data.automatedSubtasks || [],
      userId: data.userId,
      createdAt: now,
      updatedAt: now,
      toObject: function() { return { ...this }; }
    };
    this.tasks.set(task._id, task);
    return task;
  }

  clear(): void {
    this.tasks.clear();
  }

  get count(): number {
    return this.tasks.size;
  }
}

export const inMemoryStore = new InMemoryStore();
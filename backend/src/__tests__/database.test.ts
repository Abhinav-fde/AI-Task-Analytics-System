/**
 * Tests for In-Memory Database Store
 * 
 * These tests verify the in-memory store functionality
 * that serves as a fallback when MongoDB is not available.
 */

import { db, setUseInMemory } from '../config/database';

describe('In-Memory Database Store', () => {
  beforeEach(() => {
    // Force in-memory mode for all tests
    setUseInMemory(true);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a task with all required fields', async () => {
      const taskData = {
        title: 'Test Task',
        rawDescription: 'This is a test task description',
        userId: 'user123'
      };

      const result = await db.create(taskData);

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Task');
      expect(result.rawDescription).toBe('This is a test task description');
      expect(result.userId).toBe('user123');
      expect(result.aiStatus).toBe('pending');
      expect(result.automatedSubtasks).toEqual([]);
      expect(result._id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a task with default aiStatus if not provided', async () => {
      const taskData = {
        title: 'Test Task',
        rawDescription: 'This is a test task description',
        userId: 'user123'
      };

      const result = await db.create(taskData);

      expect(result.aiStatus).toBe('pending');
    });

    it('should create a task with provided aiStatus', async () => {
      const taskData = {
        title: 'Test Task',
        rawDescription: 'This is a test task description',
        userId: 'user123',
        aiStatus: 'completed' as const
      };

      const result = await db.create(taskData);

      expect(result.aiStatus).toBe('completed');
    });

    it('should generate a unique _id for each task', async () => {
      const taskData1 = {
        title: 'Task 1',
        rawDescription: 'Description 1',
        userId: 'user123'
      };
      const taskData2 = {
        title: 'Task 2',
        rawDescription: 'Description 2',
        userId: 'user123'
      };

      const result1 = await db.create(taskData1);
      const result2 = await db.create(taskData2);

      expect(result1._id).not.toBe(result2._id);
    });
  });

  describe('findById', () => {
    it('should find a task by its _id', async () => {
      const taskData = {
        title: 'Test Task',
        rawDescription: 'This is a test task description',
        userId: 'user123'
      };

      const created = await db.create(taskData);
      const found = await db.findById(created._id);

      expect(found).toBeDefined();
      expect(found?._id).toBe(created._id);
      expect(found?.title).toBe('Test Task');
    });

    it('should return null for non-existent task', async () => {
      const found = await db.findById('non-existent-id');

      expect(found).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should find a task by userId', async () => {
      const taskData = {
        title: 'Test Task',
        rawDescription: 'This is a test task description',
        userId: 'user456'
      };

      await db.create(taskData);
      const found = await db.findOne({ userId: 'user456' });

      expect(found).toBeDefined();
      expect(found?.userId).toBe('user456');
    });

    it('should find a task by both _id and userId', async () => {
      const taskData = {
        title: 'Test Task',
        rawDescription: 'This is a test task description',
        userId: 'user789'
      };

      const created = await db.create(taskData);
      const found = await db.findOne({ _id: created._id, userId: 'user789' });

      expect(found).toBeDefined();
      expect(found?._id).toBe(created._id);
      expect(found?.userId).toBe('user789');
    });

    it('should return null when no match found', async () => {
      const found = await db.findOne({ userId: 'non-existent-user' });

      expect(found).toBeNull();
    });
  });

  describe('find', () => {
    it('should find all tasks for a user', async () => {
      await db.create({
        title: 'Task 1',
        rawDescription: 'Description 1',
        userId: 'user-find'
      });
      await db.create({
        title: 'Task 2',
        rawDescription: 'Description 2',
        userId: 'user-find'
      });
      await db.create({
        title: 'Task 3',
        rawDescription: 'Description 3',
        userId: 'other-user'
      });

      const results = await db.find({ userId: 'user-find' });

      expect(results.length).toBe(2);
      expect(results.every(t => t.userId === 'user-find')).toBe(true);
    });

    it('should find tasks filtered by aiStatus', async () => {
      await db.create({
        title: 'Task 1',
        rawDescription: 'Description 1',
        userId: 'user-status',
        aiStatus: 'pending' as const
      });
      await db.create({
        title: 'Task 2',
        rawDescription: 'Description 2',
        userId: 'user-status',
        aiStatus: 'completed' as const
      });
      await db.create({
        title: 'Task 3',
        rawDescription: 'Description 3',
        userId: 'user-status',
        aiStatus: 'pending' as const
      });

      const results = await db.find({ userId: 'user-status', aiStatus: 'pending' });

      expect(results.length).toBe(2);
      expect(results.every(t => t.aiStatus === 'pending')).toBe(true);
    });

    it('should return empty array when no tasks found', async () => {
      const results = await db.find({ userId: 'non-existent-user' });

      expect(results).toEqual([]);
    });

    it('should return empty array when no tasks match status filter', async () => {
      await db.create({
        title: 'Task 1',
        rawDescription: 'Description 1',
        userId: 'user-no-match',
        aiStatus: 'pending' as const
      });

      const results = await db.find({ userId: 'user-no-match', aiStatus: 'completed' });

      expect(results).toEqual([]);
    });

    it('should return all tasks when called with empty query', async () => {
      await db.create({
        title: 'Task 1',
        rawDescription: 'Description 1',
        userId: 'user1'
      });
      await db.create({
        title: 'Task 2',
        rawDescription: 'Description 2',
        userId: 'user2'
      });

      const results = await db.find({});

      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('findByIdAndUpdate', () => {
    it('should update an existing task', async () => {
      const created = await db.create({
        title: 'Original Title',
        rawDescription: 'Original description',
        userId: 'user-update'
      });

      const updated = await db.findByIdAndUpdate(
        created._id,
        { title: 'Updated Title', aiStatus: 'completed' as const },
        { new: true }
      );

      expect(updated).toBeDefined();
      expect(updated?.title).toBe('Updated Title');
      expect(updated?.aiStatus).toBe('completed');
      expect(updated?.rawDescription).toBe('Original description');
    });

    it('should return old document when new: false (default)', async () => {
      const created = await db.create({
        title: 'Original Title',
        rawDescription: 'Original description',
        userId: 'user-update'
      });

      const updated = await db.findByIdAndUpdate(
        created._id,
        { title: 'Updated Title' }
      );

      expect(updated?.title).toBe('Original Title');
    });

    it('should update the updatedAt timestamp', async () => {
      const created = await db.create({
        title: 'Task to update',
        rawDescription: 'Description',
        userId: 'user-time'
      });
      const originalUpdatedAt = created.updatedAt;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await db.findByIdAndUpdate(
        created._id,
        { title: 'Updated Title' },
        { new: true }
      );

      expect(updated?.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should return null for non-existent task', async () => {
      const updated = await db.findByIdAndUpdate(
        'non-existent-id',
        { title: 'Updated Title' },
        { new: true }
      );

      expect(updated).toBeNull();
    });

    it('should update automatedSubtasks array', async () => {
      const created = await db.create({
        title: 'Task with subtasks',
        rawDescription: 'Description',
        userId: 'user-subtasks'
      });

      const subtasks = [
        { title: 'Subtask 1', complexityEstimation: 'low' as const, status: 'pending' as const },
        { title: 'Subtask 2', complexityEstimation: 'high' as const, status: 'done' as const }
      ];

      const updated = await db.findByIdAndUpdate(
        created._id,
        { automatedSubtasks: subtasks },
        { new: true }
      );

      expect(updated?.automatedSubtasks).toEqual(subtasks);
    });
  });
});

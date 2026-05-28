import { createTaskSchema, validateRequest } from '../controllers/taskController';
import { Request, Response, NextFunction } from 'express';

describe('Task Controller - Zod Schema Validation', () => {
  describe('createTaskSchema', () => {
    describe('valid inputs', () => {
      it('should accept a valid task with all required fields', () => {
        const validInput = {
          title: 'Build a web application',
          rawDescription: 'Create a full-stack web application with React and Node.js',
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(validInput);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.title).toBe('Build a web application');
          expect(result.data.rawDescription).toBe('Create a full-stack web application with React and Node.js');
          expect(result.data.userId).toBe('user123');
        }
      });

      it('should trim whitespace from title', () => {
        const input = {
          title: '  Build a web application  ',
          rawDescription: 'Create a full-stack web application with React and Node.js',
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.title).toBe('Build a web application');
        }
      });

      it('should convert userId to lowercase', () => {
        const input = {
          title: 'Build a web application',
          rawDescription: 'Create a full-stack web application with React and Node.js',
          userId: 'USER123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.userId).toBe('user123');
        }
      });

      it('should accept title with maximum allowed length (300 chars)', () => {
        const input = {
          title: 'A'.repeat(300),
          rawDescription: 'Create a full-stack web application with React and Node.js',
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(true);
      });

      it('should accept description with minimum allowed length (10 chars)', () => {
        const input = {
          title: 'Build a web app',
          rawDescription: '1234567890',
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(true);
      });
    });

    describe('invalid inputs', () => {
      it('should reject empty title', () => {
        const input = {
          title: '',
          rawDescription: 'Create a full-stack web application with React and Node.js',
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('title');
        }
      });

      it('should reject title exceeding 300 characters', () => {
        const input = {
          title: 'A'.repeat(301),
          rawDescription: 'Create a full-stack web application with React and Node.js',
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('title');
        }
      });

      it('should reject description shorter than 10 characters', () => {
        const input = {
          title: 'Build a web app',
          rawDescription: 'short',
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('rawDescription');
        }
      });

      it('should reject description exceeding 10,000 characters', () => {
        const input = {
          title: 'Build a web app',
          rawDescription: 'A'.repeat(10001),
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('rawDescription');
        }
      });

      it('should reject empty userId', () => {
        const input = {
          title: 'Build a web application',
          rawDescription: 'Create a full-stack web application with React and Node.js',
          userId: ''
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].path).toContain('userId');
        }
      });

      it('should reject missing title field', () => {
        const input = {
          rawDescription: 'Create a full-stack web application with React and Node.js',
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(false);
      });

      it('should reject missing rawDescription field', () => {
        const input = {
          title: 'Build a web application',
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(false);
      });

      it('should reject missing userId field', () => {
        const input = {
          title: 'Build a web application',
          rawDescription: 'Create a full-stack web application with React and Node.js'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(false);
      });

      it('should reject non-string title', () => {
        const input = {
          title: 123,
          rawDescription: 'Create a full-stack web application with React and Node.js',
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(false);
      });

      it('should reject non-string rawDescription', () => {
        const input = {
          title: 'Build a web application',
          rawDescription: ['array', 'not', 'string'],
          userId: 'user123'
        };
        
        const result = createTaskSchema.safeParse(input);
        
        expect(result.success).toBe(false);
      });
    });
  });

  describe('validateRequest middleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: NextFunction;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;

    beforeEach(() => {
      jsonMock = jest.fn();
      statusMock = jest.fn().mockReturnValue({ json: jsonMock });
      
      mockRequest = {
        body: {}
      };
      mockResponse = {
        status: statusMock,
        json: jsonMock
      };
      mockNext = jest.fn();
    });

    it('should call next() when validation passes', () => {
      mockRequest.body = {
        title: 'Build a web application',
        rawDescription: 'Create a full-stack web application with React and Node.js',
        userId: 'user123'
      };

      const middleware = validateRequest(createTaskSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should replace req.body with parsed data when validation passes', () => {
      mockRequest.body = {
        title: '  Build a web application  ',
        rawDescription: 'Create a full-stack web application with React and Node.js',
        userId: 'USER123'
      };

      const middleware = validateRequest(createTaskSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.body).toEqual({
        title: 'Build a web application',
        rawDescription: 'Create a full-stack web application with React and Node.js',
        userId: 'user123'
      });
    });

    it('should return 400 when validation fails', () => {
      mockRequest.body = {
        title: '',
        rawDescription: 'short',
        userId: ''
      };

      const middleware = validateRequest(createTaskSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return validation errors in response', () => {
      mockRequest.body = {
        title: '',
        rawDescription: 'short',
        userId: ''
      };

      const middleware = validateRequest(createTaskSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Validation failed'
        })
      );
    });

    it('should not call next when validation fails', () => {
      mockRequest.body = {
        title: '',
        rawDescription: 'short',
        userId: ''
      };

      const middleware = validateRequest(createTaskSchema);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

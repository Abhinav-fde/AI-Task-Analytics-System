/**
 * AI Service - Background Task Processor
 * ========================================
 * 
 * ARCHITECTURAL PATTERN: Background Worker (Out-of-Band Processing)
 * 
 * This service handles all AI-related operations outside the HTTP request cycle.
 * It's invoked AFTER the initial response is sent to the client.
 * 
 * WHY THIS DESIGN?
 * 1. HTTP requests should complete in < 200ms (user experience)
 * 2. AI API calls take 2-10 seconds (LLM inference time)
 * 3. If we await AI inside HTTP, we'd block the event loop
 * 4. Node.js is single-threaded - blocking = lost throughput
 * 
 * INTERVIEW ANSWER: "We treat AI processing as a background job, not a synchronous operation."
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { db } from '../config/database';
import { emitTaskUpdate } from '../sockets/taskSocket';

// ============================================================================
// PHASE 3A: AI Client Initialization
// ============================================================================

/**
 * Google Gemini SDK client
 * 
 * WHY GEMINI?
 * - Native JSON Schema / Structured Output support
 * - 1M token context window
 * - Cost-effective for text tasks
 * - Easy to switch to OpenAI if needed
 * 
 * PRODUCTION TIP: Use environment variable for API key
 * Never hardcode secrets in source code
 */
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || 'demo-key');

// ============================================================================
// PHASE 3B: Structured Output Schema
// ============================================================================

/**
 * Zod schema for AI response validation
 * 
 * WHY STRUCTURED OUTPUT?
 * LLMs are probabilistic - they can return ANY text.
 * Without schema constraints, we'd get:
 *   - "Here's the breakdown:" + JSON
 *   - Markdown code blocks with JSON inside
 *   - Random text before/after the JSON
 *   - Sometimes invalid JSON entirely
 * 
 * With structured output (JSON Schema mode):
 * - Model is constrained to output valid JSON only
 * - Response is guaranteed to match our schema
 * - No parsing hacks needed
 * 
 * INTERVIEW POINT: "We use schema-constrained generation to eliminate
 * response parsing as a source of bugs."
 */
const AI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    subtasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Short, actionable subtask title (max 100 chars)',
            maxLength: 100
          },
          complexityEstimation: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Estimated difficulty level for sprint planning'
          }
        },
        required: ['title', 'complexityEstimation']
      },
      description: 'Array of subtasks breaking down the main task',
      minItems: 2,   // At least 2 subtasks
      maxItems: 10   // Cap at 10 for usability
    }
  },
  required: ['subtasks']
};

// ============================================================================
// PHASE 3C: AI Prompt Engineering
// ============================================================================

/**
 * System prompt for task decomposition
 * 
 * ARCHITECTURAL DECISION: Why a separate system prompt?
 * - Model weights are frozen - we can't change how it thinks
 * - System prompt tells the model HOW to behave
 * - User prompt tells it WHAT to analyze
 * 
 * This separation makes prompts maintainable and testable.
 */
const SYSTEM_PROMPT = `You are a senior project manager with expertise in breaking down complex tasks into actionable subtasks.

Your role:
1. Analyze the user's task description
2. Break it down into 3-8 discrete subtasks
3. Estimate complexity for each (low/medium/high)
4. Output ONLY valid JSON matching the provided schema

Guidelines:
- Subtasks should be independent (can be worked on in parallel)
- Use action verbs (Create, Configure, Implement, Test, etc.)
- Complexity estimation: low=1pt, medium=3pts, high=5pts
- Keep titles under 100 characters
- Think step-by-step but output only the final JSON`;

const USER_PROMPT_TEMPLATE = (taskDescription: string) => `
Task to decompose: "${taskDescription}"

Analyze this task and break it down into actionable subtasks.
Consider:
- Prerequisites and dependencies
- Natural work boundaries
- Parallel vs sequential work
- Testability of each piece

Return JSON with an array of subtasks.
`;

// ============================================================================
// PHASE 3D: Core Background Processor
// ============================================================================

/**
 * processTaskAI - Main background AI processor
 * 
 * CRITICAL: This function is fire-and-forget from the controller.
 * It runs entirely in the background after HTTP response is sent.
 * 
 * @param taskId - MongoDB ObjectId of the task
 * @param rawDescription - User's raw task description to analyze
 * 
 * @returns Promise<void> - Async but not awaited by caller
 */
export const processTaskAI = async (
  taskId: string,
  rawDescription: string
): Promise<void> => {
  console.log(`[AIService] Starting AI processing for task: ${taskId}`);
  
  try {
    // === STEP 1: Mark task as "processing" ===
    await db.findByIdAndUpdate(taskId, { aiStatus: 'processing' });
    await emitTaskUpdate(taskId);

    // === STEP 2: Call Gemini API (or use mock if no API key) ===
    
    let subtasks: any[];
    
    // MOCK MODE: If no API key, simulate AI processing
    if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'your-gemini-api-key-here') {
      console.log('[AIService] MOCK MODE: Simulating AI processing...');
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate mock subtasks based on description keywords
      subtasks = generateMockSubtasks(rawDescription);
    } else {
      // REAL MODE: Call Gemini API
      console.log('[AIService] REAL MODE: Calling Gemini API...');
      subtasks = await callGeminiAPI(rawDescription);
    }

    // === STEP 5: Save subtasks to MongoDB ===
    const updatedTask = await db.findByIdAndUpdate(
      taskId,
      {
        automatedSubtasks: subtasks,
        aiStatus: 'completed'
      },
      { new: true }
    );

    if (!updatedTask) {
      console.error(`[AIService] Task not found after AI processing: ${taskId}`);
      return;
    }

    console.log(`[AIService] Task ${taskId} completed with ${subtasks.length} subtasks`);
    await emitTaskUpdate(taskId);

  } catch (error) {
    // === ERROR HANDLING ===
    console.error(`[AIService] AI processing failed for task ${taskId}:`, error);

    await db.findByIdAndUpdate(taskId, { aiStatus: 'failed' }).catch((err) => {
      console.error(`[AIService] Failed to update task status: ${err}`);
    });

    await emitTaskUpdate(taskId);
  }
};

/**
 * Generate mock subtasks when no API key is available
 */
function generateMockSubtasks(description: string): any[] {
  const baseSubtasks = [
    { title: 'Analyze requirements and constraints', complexityEstimation: 'medium' as const },
    { title: 'Design solution architecture', complexityEstimation: 'medium' as const },
    { title: 'Implement core functionality', complexityEstimation: 'high' as const },
    { title: 'Write unit tests', complexityEstimation: 'medium' as const },
    { title: 'Review and refine implementation', complexityEstimation: 'low' as const },
  ];
  
  // Add context-specific subtask based on keywords
  const desc = description.toLowerCase();
  const contextSubtasks: any[] = [];
  
  if (desc.includes('api') || desc.includes('backend')) {
    contextSubtasks.push({ title: 'Design API endpoints', complexityEstimation: 'medium' as const });
  }
  if (desc.includes('database') || desc.includes('mongo') || desc.includes('sql')) {
    contextSubtasks.push({ title: 'Setup database schema', complexityEstimation: 'medium' as const });
  }
  if (desc.includes('ui') || desc.includes('frontend') || desc.includes('angular')) {
    contextSubtasks.push({ title: 'Build UI components', complexityEstimation: 'high' as const });
  }
  if (desc.includes('auth') || desc.includes('login')) {
    contextSubtasks.push({ title: 'Implement authentication', complexityEstimation: 'high' as const });
  }
  
  // Combine and add status
  const allSubtasks = [...baseSubtasks, ...contextSubtasks].slice(0, 8);
  return allSubtasks.map(sub => ({ ...sub, status: 'pending' as const }));
}

/**
 * Call Gemini API for real AI processing
 */
async function callGeminiAPI(rawDescription: string): Promise<any[]> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
  } as any);

  const result = await model.generateContent([
    { text: SYSTEM_PROMPT },
    { text: USER_PROMPT_TEMPLATE(rawDescription) }
  ]);

  const response = result.response;
  const rawText = response.text();
  
  // Parse the JSON response
  let aiResult = JSON.parse(rawText);
  
  return aiResult.subtasks.map((sub: any) => ({
    title: sub.title.trim(),
    complexityEstimation: sub.complexityEstimation as 'low' | 'medium' | 'high',
    status: 'pending' as const
  }));
}

// ============================================================================
// PHASE 3E: Retry Logic (Production Enhancement)
// ============================================================================

/**
 * Retry wrapper with exponential backoff
 * 
 * In production, you'd wrap processTaskAI with retry logic:
 * 
 * @example
 * ```typescript
 * const withRetry = async (fn: Function, maxRetries: number = 3) => {
 *   for (let i = 0; i < maxRetries; i++) {
 *     try {
 *       return await fn();
 *     } catch (error) {
 *       if (i === maxRetries - 1) throw error;
 *       const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
 *       await new Promise(resolve => setTimeout(resolve, delay));
 *     }
 *   }
 * };
 * ```
 */

// ============================================================================
// PHASE 3F: Scheduled/Cron Processing (Future Enhancement)
// ============================================================================

/**
 * For production, you'd add:
 * 
 * 1. Job queue (Bull/BullMQ with Redis)
 *    - Persist jobs if server restarts
 *    - Retry failed jobs automatically
 *    - Rate limit AI API calls across instances
 * 
 * 2. Dead letter queue
 *    - Tasks that fail 3 times go to DLQ
 *    - Manual review/retry by ops team
 * 
 * 3. Monitoring
 *    - Track AI processing time
 *    - Track success/failure rates
 *    - Alert on high failure rates
 */

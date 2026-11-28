import { GoogleGenAI } from '@google/genai';

// Constructed once at startup, like the Anthropic client. A missing key is
// detected here rather than by a failed request.
export const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

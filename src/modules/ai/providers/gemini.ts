import { GoogleGenAI } from '@google/genai';
import {
  AIProvider,
  GenerateStructuredRequest,
  GenerateStructuredResult,
} from '../types';
import { formatPromptContent } from '../domain/sanitizer';
import { AppError } from '../../../shared/errors';
import { logger } from '../../../shared/logger';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (key) {
      this.client = new GoogleGenAI({ apiKey: key });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client || process.env.GEMINI_API_KEY);
  }

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const key = process.env.GEMINI_API_KEY;
      if (!key) {
        throw new AppError(
          'EXTERNAL_UNAVAILABLE',
          'GEMINI_API_KEY environment variable is not set'
        );
      }
      this.client = new GoogleGenAI({ apiKey: key });
    }
    return this.client;
  }

  async generateStructured<T>(
    req: GenerateStructuredRequest<T>
  ): Promise<GenerateStructuredResult> {
    const client = this.getClient();
    const formattedPrompt = formatPromptContent(req.userContent);

    try {
      const response = await client.models.generateContent({
        model: req.model,
        contents: formattedPrompt,
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseJsonSchema: req.jsonSchema,
          temperature: req.temperature ?? 0.1,
          abortSignal: req.signal,
        },
      });

      const raw = response.text || '';
      if (!raw) {
        throw new AppError('EXTERNAL_UNAVAILABLE', 'Gemini API returned an empty response');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (jsonErr) {
        logger.warn({ raw, err: jsonErr }, 'Failed to parse JSON response from Gemini');
        throw new AppError(
          'EXTERNAL_UNAVAILABLE',
          `Gemini response was not valid JSON: ${(jsonErr as Error).message}`
        );
      }

      const inTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const outTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

      return {
        data: parsed,
        usage: {
          inTokens,
          outTokens,
        },
        raw,
      };
    } catch (err: unknown) {
      const error = err as Error & { status?: number; code?: number; details?: unknown };
      const errorMessage = error.message || String(err);

      // Detect Rate Limiting (429 / RESOURCE_EXHAUSTED)
      if (
        error.status === 429 ||
        error.code === 429 ||
        errorMessage.includes('429') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('quota')
      ) {
        logger.warn({ error: errorMessage }, 'Gemini rate limit or quota exceeded');
        throw new AppError(
          'RATE_LIMITED',
          `Gemini rate limit exceeded: ${errorMessage}`
        );
      }

      if (errorMessage.includes('API key not valid') || errorMessage.includes('API_KEY_INVALID')) {
        throw new AppError(
          'EXTERNAL_UNAVAILABLE',
          'Invalid Gemini API key provided'
        );
      }

      logger.error({ error: errorMessage }, 'Gemini generateStructured failed');
      throw new AppError(
        'EXTERNAL_UNAVAILABLE',
        `Gemini API error: ${errorMessage}`
      );
    }
  }

  async generateText(req: {
    system: string;
    prompt: string;
    model: string;
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<{ text: string; usage?: { inTokens: number; outTokens: number } }> {
    const client = this.getClient();
    const response = await client.models.generateContent({
      model: req.model,
      contents: req.prompt,
      config: {
        systemInstruction: req.system,
        temperature: req.temperature ?? 0.3,
        abortSignal: req.signal,
      },
    });

    return {
      text: response.text || '',
      usage: {
        inTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}

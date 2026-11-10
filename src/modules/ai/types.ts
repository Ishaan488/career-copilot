import { type ZodType, type ZodTypeDef } from 'zod';

export type AITask =
  | 'jd_analysis'
  | 'role_match'
  | 'company_synthesis'
  | 'comp_estimate'
  | 'form_answer_draft'
  | 'ambiguity_detect'
  | 'email_classify';

export type AIStatus =
  | 'available'
  | 'no_key'
  | 'quota_exhausted'
  | 'rate_limited'
  | 'outage';

export interface PromptPart {
  type: 'text' | 'untrusted_text';
  text: string;
  source?: string;
  id?: string;
}

export interface GenerateStructuredRequest<T> {
  task: AITask;
  model: string;
  system: string;
  userContent: PromptPart[];
  schema: ZodType<T, ZodTypeDef, unknown>;
  jsonSchema: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface GenerateStructuredResult {
  data: unknown;
  usage?: {
    inTokens: number;
    outTokens: number;
  };
  raw: string;
}

export interface AIProvider {
  readonly name: string;
  generateStructured<T>(req: GenerateStructuredRequest<T>): Promise<GenerateStructuredResult>;
  generateText?(req: {
    system: string;
    prompt: string;
    model: string;
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<{ text: string; usage?: { inTokens: number; outTokens: number } }>;
}

export interface AIPipelineResult<T> {
  data: T;
  cached: boolean;
  corrected: boolean;
  tokens?: {
    inTokens: number;
    outTokens: number;
  };
  latencyMs: number;
  model: string;
  provider: string;
  requestId: string;
}

export interface EntityReference {
  entityType?: 'job' | 'company' | 'application';
  entityId?: string;
  outputRef?: string;
}

export interface AIStatusInfo {
  status: AIStatus;
  reason?: string;
  provider: string;
  defaultModel: string;
  dailyRequestsUsed: number;
  dailyRequestsLimit: number;
  dailyTokensUsed: number;
  dailyTokensLimit: number;
}

export interface AIUsageMetrics {
  date: string;
  totalRequests: number;
  totalTokensIn: number;
  totalTokensOut: number;
  cachedRequests: number;
  failedRequests: number;
  estimatedCostUsd: number;
  taskBreakdown: Record<string, { requests: number; tokens: number }>;
  modelBreakdown: Record<string, { requests: number; tokens: number }>;
}

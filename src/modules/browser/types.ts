import type { Page, Locator } from 'playwright';

export type BlockType = 'captcha' | 'login_required' | 'access_denied' | 'rate_limited';

export type FieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'multiselect'
  | 'file'
  | 'textarea'
  | 'unknown';

export interface SelectorStrategy {
  kind: 'role' | 'label' | 'css';
  sel: string;
  name?: string;
}

export interface ExtractedFieldOption {
  label: string;
  value: string;
}

export interface ExtractedField {
  fieldKey: string; // sha256(normalizedLabel|type|sortedOptions)
  label: string;
  type: FieldType;
  required: boolean;
  options: ExtractedFieldOption[];
  selectorStrategy: SelectorStrategy[];
  category: string;
  pageIndex: number;
  isHoneypot: boolean;
}

export interface ExtractedForm {
  portal: 'greenhouse' | 'lever' | 'ashby' | 'generic';
  pages: number;
  fields: ExtractedField[];
  hasSubmit: boolean;
}

export interface PrepareResult {
  ready: boolean;
  blocked: BlockType | null;
  dismissedBanner: boolean;
}

export interface FillPlanField {
  fieldKey: string;
  value: unknown;
  decision?: 'answered' | 'declined' | 'left_blank';
  type: string;
}

export interface FillPlan {
  fields: FillPlanField[];
  resumeFilePath?: string;
  resumeFileName?: string;
}

export interface FillReportItem {
  fieldKey: string;
  success: boolean;
  valueAttempted?: unknown;
  error?: string;
}

export interface FillReport {
  filled: FillReportItem[];
  skipped: string[];
  errors: Array<{ fieldKey: string; error: string }>;
}

export interface SubmissionVerificationResult {
  status: 'confirmed' | 'already_applied' | 'not_confirmed' | 'unknown';
  evidence?: Record<string, unknown>;
}

declare const SubmitTokenBrand: unique symbol;

export interface SubmitToken {
  readonly [SubmitTokenBrand]?: true;
  applicationId: string;
  submissionId: string;
  summaryHash: string;
  issuedAt: number;
}

export interface PortalDriverCapabilities {
  extract: true;
  fill: boolean;
  submit: boolean; // true for supported drivers in M12; false for generic
  verify: boolean;
}

export interface PortalDriver {
  id: 'greenhouse' | 'lever' | 'ashby' | 'generic';
  matches(url: URL): boolean;
  capabilities: PortalDriverCapabilities;
  prepare(page: Page): Promise<PrepareResult>;
  detectBlock(page: Page): Promise<BlockType | null>;
  extractForm(page: Page): Promise<ExtractedForm>;
  fill(page: Page, plan: FillPlan): Promise<FillReport>;
  readBack(page: Page, fields: ExtractedField[]): Promise<Record<string, unknown>>;
  uploadFile(page: Page, fieldKey: string, filePath: string): Promise<void>;
  findSubmitControl(page: Page): Promise<Locator | null>;
  submit(page: Page, token: SubmitToken): Promise<{ submitted: boolean }>;
  verifySubmission(page: Page): Promise<SubmissionVerificationResult>;
}

export interface BrowserSessionOptions {
  workflowId: string;
  applicationId: string;
  headless?: boolean;
  locale?: string;
  timezone?: string;
}

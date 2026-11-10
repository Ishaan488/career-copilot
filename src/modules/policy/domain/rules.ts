export type PolicyDecisionResult = 'allow' | 'require_review' | 'deny';
export type PolicyScope = 'job' | 'application' | 'form_field' | 'submission';

export interface EvaluatedRuleOutcome {
  ruleId: string;
  type: string;
  matched: boolean;
  result: PolicyDecisionResult;
  reason: string;
}

export interface PolicyRuleDefinition {
  id: string;
  type: string;
  params: Record<string, unknown>;
  enabled: boolean;
  priority: number;
  version: number;
  description: string;
  isCore?: boolean;
}

export interface PolicyEvaluationContext {
  scope: PolicyScope;
  subjectId: string;
  companyName?: string;
  title?: string;
  workMode?: string | null;
  suitabilityScore?: number | null;
  recommendation?: string | null;
  riskLevel?: string | null;
  disclosedSalary?: number | null;
  category?: string | null;
  submissionCountToday?: number;
}

/**
 * Non-removable core guardrail rules (Doc 07 §75, User decisions Q4, Q12).
 * Sensitive legal/consent/bond/work-auth/salary/notice/relocation/background/EEO
 * questions ALWAYS evaluate to 'require_review' and can never be bypassed.
 */
export const CORE_GUARDRAIL_RULES: PolicyRuleDefinition[] = [
  {
    id: 'core_sensitive_categories_review',
    type: 'require_review_if_category',
    params: {
      categories: [
        'legal',
        'consent',
        'bond',
        'work_auth',
        'salary',
        'notice',
        'relocation',
        'background',
        'eeo',
        'sensitive',
      ],
    },
    enabled: true,
    priority: 1,
    version: 1,
    description: 'Core non-removable rule: sensitive and legal fields always require human review.',
    isCore: true,
  },
  {
    id: 'core_max_risk_deny',
    type: 'max_risk_level',
    params: {
      maxRisk: 'medium', // 'high' risk is denied
    },
    enabled: true,
    priority: 5,
    version: 1,
    description: 'Core non-removable rule: high risk jobs are denied automated advancement.',
    isCore: true,
  },
];

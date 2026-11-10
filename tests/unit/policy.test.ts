import { describe, it, expect } from 'vitest';
import {
  evaluatePolicy,
  PolicyRuleDefinition,
  PolicyEvaluationContext,
} from '@/modules/policy';
import { policyService } from '@/modules/policy/service';
import { AppError } from '@/shared/errors';

describe('Policy Engine & Guardrails (T-POL)', () => {
  it('enforces precedence deny > require_review > allow', () => {
    const rules: PolicyRuleDefinition[] = [
      {
        id: 'rule_allow',
        type: 'require_work_mode',
        params: { allowedModes: ['remote'] },
        enabled: true,
        priority: 10,
        version: 1,
        description: 'Allow remote',
      },
      {
        id: 'rule_review',
        type: 'min_suitability_to_shortlist',
        params: { minScore: 80 },
        enabled: true,
        priority: 20,
        version: 1,
        description: 'Review below 80',
      },
      {
        id: 'rule_deny',
        type: 'exclude_company',
        params: { companies: ['Blacklisted Corp'] },
        enabled: true,
        priority: 30,
        version: 1,
        description: 'Deny blacklisted company',
      },
    ];

    const context: PolicyEvaluationContext = {
      scope: 'job',
      subjectId: 'job_123',
      companyName: 'Blacklisted Corp',
      workMode: 'remote',
      suitabilityScore: 75,
    };

    const res = evaluatePolicy(rules, context);
    // Even though suitability score triggered review and work mode allowed, deny wins!
    expect(res.decision).toBe('deny');
    expect(res.explanation).toContain('Policy check failed');
  });

  it('evaluates to require_review when no deny but review rule matched', () => {
    const rules: PolicyRuleDefinition[] = [
      {
        id: 'rule_review',
        type: 'min_suitability_to_shortlist',
        params: { minScore: 80 },
        enabled: true,
        priority: 20,
        version: 1,
        description: 'Review below 80',
      },
    ];

    const context: PolicyEvaluationContext = {
      scope: 'job',
      subjectId: 'job_123',
      companyName: 'Good Corp',
      suitabilityScore: 72,
    };

    const res = evaluatePolicy(rules, context);
    expect(res.decision).toBe('require_review');
    expect(res.explanation).toContain('Human review required');
  });

  it('CORE GUARDRAIL: Sensitive & EEO categories ALWAYS evaluate to require_review', () => {
    const sensitiveCategories = ['legal', 'consent', 'eeo', 'salary', 'work_auth', 'background'];

    for (const cat of sensitiveCategories) {
      const context: PolicyEvaluationContext = {
        scope: 'form_field',
        subjectId: `field_${cat}`,
        category: cat,
      };

      // Even with empty user rules, core rules are automatically merged
      const res = evaluatePolicy([], context);
      expect(res.decision).toBe('require_review');
      expect(res.explanation).toContain('flagged as sensitive and requires human review');
    }
  });

  it('CORE GUARDRAIL: High risk jobs are denied automated advancement', () => {
    const context: PolicyEvaluationContext = {
      scope: 'job',
      subjectId: 'job_high_risk',
      riskLevel: 'high',
    };

    const res = evaluatePolicy([], context);
    expect(res.decision).toBe('deny');
    expect(res.explanation).toContain('exceeds maximum allowed risk');
  });

  it('prevents modifying or deleting core guardrails', async () => {
    await expect(
      policyService.updateRule('core_sensitive_categories_review', { enabled: false })
    ).rejects.toThrow(AppError);

    await expect(
      policyService.deleteRule('core_sensitive_categories_review')
    ).rejects.toThrow(AppError);
  });
});

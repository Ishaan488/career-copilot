import {
  CORE_GUARDRAIL_RULES,
  EvaluatedRuleOutcome,
  PolicyDecisionResult,
  PolicyEvaluationContext,
  PolicyRuleDefinition,
} from './rules';

export interface PolicyEvaluationResult {
  decision: PolicyDecisionResult;
  rulesEvaluated: EvaluatedRuleOutcome[];
  explanation: string;
}

/**
 * Pure evaluation of a single rule against a context.
 */
export function evaluateSingleRule(
  rule: PolicyRuleDefinition,
  context: PolicyEvaluationContext
): EvaluatedRuleOutcome {
  if (!rule.enabled) {
    return {
      ruleId: rule.id,
      type: rule.type,
      matched: false,
      result: 'allow',
      reason: 'Rule is disabled.',
    };
  }

  switch (rule.type) {
    case 'require_review_if_category': {
      const categories = (rule.params.categories as string[]) || [];
      const currentCat = context.category?.toLowerCase().trim();
      if (currentCat && categories.some((c) => c.toLowerCase() === currentCat)) {
        return {
          ruleId: rule.id,
          type: rule.type,
          matched: true,
          result: 'require_review',
          reason: `Category '${context.category}' is flagged as sensitive and requires human review.`,
        };
      }
      return {
        ruleId: rule.id,
        type: rule.type,
        matched: false,
        result: 'allow',
        reason: 'Category does not require mandatory review.',
      };
    }

    case 'max_risk_level': {
      const maxRisk = ((rule.params.maxRisk as string) || 'medium').toLowerCase();
      const currentRisk = (context.riskLevel || 'low').toLowerCase();

      const riskRank: Record<string, number> = {
        low: 1,
        medium: 2,
        high: 3,
        unknown: 2,
      };

      const currentScore = riskRank[currentRisk] ?? 2;
      const maxScore = riskRank[maxRisk] ?? 2;

      if (currentScore > maxScore) {
        return {
          ruleId: rule.id,
          type: rule.type,
          matched: true,
          result: 'deny',
          reason: `Job risk level (${context.riskLevel}) exceeds maximum allowed risk (${maxRisk}).`,
        };
      }
      return {
        ruleId: rule.id,
        type: rule.type,
        matched: false,
        result: 'allow',
        reason: `Risk level (${context.riskLevel ?? 'low'}) is within allowed threshold.`,
      };
    }

    case 'exclude_company': {
      const companies = ((rule.params.companies as string[]) || []).map((c) =>
        c.toLowerCase().trim()
      );
      const companyName = context.companyName?.toLowerCase().trim();
      if (companyName && companies.some((c) => companyName.includes(c) || c.includes(companyName))) {
        return {
          ruleId: rule.id,
          type: rule.type,
          matched: true,
          result: 'deny',
          reason: `Company '${context.companyName}' is in the exclusion list.`,
        };
      }
      return {
        ruleId: rule.id,
        type: rule.type,
        matched: false,
        result: 'allow',
        reason: 'Company is not excluded.',
      };
    }

    case 'exclude_title_keyword': {
      const keywords = ((rule.params.keywords as string[]) || []).map((k) =>
        k.toLowerCase().trim()
      );
      const title = context.title?.toLowerCase().trim();
      if (title && keywords.some((k) => title.includes(k))) {
        return {
          ruleId: rule.id,
          type: rule.type,
          matched: true,
          result: 'deny',
          reason: `Job title '${context.title}' contains excluded keyword.`,
        };
      }
      return {
        ruleId: rule.id,
        type: rule.type,
        matched: false,
        result: 'allow',
        reason: 'Job title contains no excluded keywords.',
      };
    }

    case 'require_work_mode': {
      const allowedModes = ((rule.params.allowedModes as string[]) || []).map((m) =>
        m.toLowerCase().trim()
      );
      const currentMode = context.workMode?.toLowerCase().trim();
      if (currentMode && allowedModes.length > 0 && !allowedModes.includes(currentMode)) {
        return {
          ruleId: rule.id,
          type: rule.type,
          matched: true,
          result: 'deny',
          reason: `Work mode '${context.workMode}' is not among allowed modes: [${allowedModes.join(', ')}].`,
        };
      }
      return {
        ruleId: rule.id,
        type: rule.type,
        matched: false,
        result: 'allow',
        reason: 'Work mode satisfies policy.',
      };
    }

    case 'min_compensation': {
      const minSalary = Number(rule.params.minSalary ?? 0);
      if (minSalary > 0 && context.disclosedSalary !== null && context.disclosedSalary !== undefined) {
        if (context.disclosedSalary < minSalary) {
          return {
            ruleId: rule.id,
            type: rule.type,
            matched: true,
            result: 'deny',
            reason: `Disclosed compensation (${context.disclosedSalary}) is below minimum requirement (${minSalary}).`,
          };
        }
      }
      return {
        ruleId: rule.id,
        type: rule.type,
        matched: false,
        result: 'allow',
        reason: 'Compensation requirement satisfied or not disclosed.',
      };
    }

    case 'min_suitability_to_shortlist': {
      const minScore = Number(rule.params.minScore ?? 70);
      if (
        context.suitabilityScore !== null &&
        context.suitabilityScore !== undefined &&
        context.suitabilityScore < minScore
      ) {
        return {
          ruleId: rule.id,
          type: rule.type,
          matched: true,
          result: 'require_review',
          reason: `Suitability score (${context.suitabilityScore}) is below auto-shortlist threshold (${minScore}).`,
        };
      }
      return {
        ruleId: rule.id,
        type: rule.type,
        matched: false,
        result: 'allow',
        reason: 'Suitability score satisfies threshold.',
      };
    }

    case 'max_submissions_per_day': {
      const maxSubmissions = Number(rule.params.max ?? 10);
      const count = Number(context.submissionCountToday ?? 0);
      if (count >= maxSubmissions) {
        return {
          ruleId: rule.id,
          type: rule.type,
          matched: true,
          result: 'deny',
          reason: `Daily application submission limit reached (${count}/${maxSubmissions}).`,
        };
      }
      return {
        ruleId: rule.id,
        type: rule.type,
        matched: false,
        result: 'allow',
        reason: `Submission count (${count}/${maxSubmissions}) is within limit.`,
      };
    }

    default:
      return {
        ruleId: rule.id,
        type: rule.type,
        matched: false,
        result: 'allow',
        reason: `Unrecognized rule type '${rule.type}'; defaulting to allow.`,
      };
  }
}

/**
 * Pure Policy Evaluation Engine with Precedence Resolution:
 * deny > require_review > allow
 *
 * Core guardrails are always merged and cannot be overridden.
 */
export function evaluatePolicy(
  rules: PolicyRuleDefinition[],
  context: PolicyEvaluationContext
): PolicyEvaluationResult {
  // Merge core guardrails if not already present
  const allRulesMap = new Map<string, PolicyRuleDefinition>();
  for (const coreRule of CORE_GUARDRAIL_RULES) {
    allRulesMap.set(coreRule.id, coreRule);
  }
  for (const r of rules) {
    // Cannot override core rules
    if (!allRulesMap.has(r.id) || !allRulesMap.get(r.id)?.isCore) {
      allRulesMap.set(r.id, r);
    }
  }

  // Sort rules by priority ascending (lower number = higher priority)
  const sortedRules = Array.from(allRulesMap.values()).sort(
    (a, b) => a.priority - b.priority
  );

  const outcomes: EvaluatedRuleOutcome[] = [];
  let decision: PolicyDecisionResult = 'allow';
  const reasons: string[] = [];

  for (const rule of sortedRules) {
    const outcome = evaluateSingleRule(rule, context);
    outcomes.push(outcome);

    if (outcome.matched) {
      if (outcome.result === 'deny') {
        decision = 'deny';
        reasons.push(outcome.reason);
      } else if (outcome.result === 'require_review' && decision !== 'deny') {
        decision = 'require_review';
        reasons.push(outcome.reason);
      }
    }
  }

  let explanation: string;
  if (decision === 'deny') {
    explanation = `Policy check failed: ${reasons.join('; ')}`;
  } else if (decision === 'require_review') {
    explanation = `Human review required: ${reasons.join('; ')}`;
  } else {
    explanation = 'All policy checks passed successfully.';
  }

  return {
    decision,
    rulesEvaluated: outcomes,
    explanation,
  };
}

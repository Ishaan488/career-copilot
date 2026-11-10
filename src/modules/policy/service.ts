import { getDb } from '../../shared/db';
import { policyRules, policyDecisions } from '../../db/schema/policy';
import { eq, desc } from 'drizzle-orm';
import { AppError } from '../../shared/errors';
import {
  CORE_GUARDRAIL_RULES,
  PolicyEvaluationContext,
  PolicyRuleDefinition,
  PolicyScope,
} from './domain/rules';
import {
  evaluatePolicy as evaluatePolicyDomain,
  PolicyEvaluationResult,
} from './domain/engine';

export class PolicyService {
  /**
   * Evaluates active policy rules and core guardrails against the given context,
   * optionally logging the decision audit entry.
   */
  async evaluatePolicy(
    scope: PolicyScope,
    subjectId: string,
    context: Omit<PolicyEvaluationContext, 'scope' | 'subjectId'>,
    options?: { persist?: boolean }
  ): Promise<PolicyEvaluationResult> {
    const db = getDb();

    // 1. Fetch enabled DB rules
    const dbRows = await db
      .select()
      .from(policyRules)
      .where(eq(policyRules.enabled, true));

    const dbRules: PolicyRuleDefinition[] = dbRows.map((r) => ({
      id: r.id,
      type: r.type,
      params: r.params as Record<string, unknown>,
      enabled: r.enabled,
      priority: r.priority,
      version: r.version,
      description: r.description,
      isCore: false,
    }));

    const fullContext: PolicyEvaluationContext = {
      scope,
      subjectId,
      ...context,
    };

    // 2. Evaluate through pure engine with deny > require_review > allow precedence
    const result = evaluatePolicyDomain(dbRules, fullContext);

    // 3. Persist decision audit unless explicitly disabled
    if (options?.persist !== false) {
      await db.insert(policyDecisions).values({
        scope,
        subjectId,
        inputs: fullContext as unknown as Record<string, unknown>,
        rulesEvaluated: result.rulesEvaluated as unknown as Record<string, unknown>[],
        decision: result.decision,
        explanation: result.explanation,
        rulesetVersion: 1,
      });
    }

    return result;
  }

  /**
   * List all rules (core guardrails + database-persisted rules).
   */
  async listRules(): Promise<PolicyRuleDefinition[]> {
    const db = getDb();
    const dbRows = await db
      .select()
      .from(policyRules)
      .orderBy(policyRules.priority);

    const dbRules: PolicyRuleDefinition[] = dbRows.map((r) => ({
      id: r.id,
      type: r.type,
      params: r.params as Record<string, unknown>,
      enabled: r.enabled,
      priority: r.priority,
      version: r.version,
      description: r.description,
      isCore: false,
    }));

    // Merge core rules (at top by priority)
    return [...CORE_GUARDRAIL_RULES, ...dbRules];
  }

  /**
   * Create a user-defined policy rule.
   */
  async createRule(input: {
    type: string;
    params?: Record<string, unknown>;
    enabled?: boolean;
    priority?: number;
    description: string;
  }): Promise<PolicyRuleDefinition> {
    const db = getDb();
    const [inserted] = await db
      .insert(policyRules)
      .values({
        type: input.type,
        params: input.params || {},
        enabled: input.enabled ?? true,
        priority: input.priority ?? 100,
        description: input.description,
        version: 1,
        updatedBy: 'user',
      })
      .returning();

    if (!inserted) {
      throw new AppError('INTERNAL', 'Failed to insert policy rule');
    }

    return {
      id: inserted.id,
      type: inserted.type,
      params: inserted.params as Record<string, unknown>,
      enabled: inserted.enabled,
      priority: inserted.priority,
      version: inserted.version,
      description: inserted.description,
      isCore: false,
    };
  }

  /**
   * Update a policy rule. Core guardrails cannot be updated or disabled.
   */
  async updateRule(
    id: string,
    updates: {
      type?: string;
      params?: Record<string, unknown>;
      enabled?: boolean;
      priority?: number;
      description?: string;
    }
  ): Promise<PolicyRuleDefinition> {
    if (CORE_GUARDRAIL_RULES.some((r) => r.id === id)) {
      throw new AppError(
        'VALIDATION',
        'Cannot modify core guardrail rule. Core rules are immutable.'
      );
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(policyRules)
      .where(eq(policyRules.id, id))
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Policy rule with id '${id}' not found.`);
    }

    const [updated] = await db
      .update(policyRules)
      .set({
        ...updates,
        version: existing.version + 1,
        updatedAt: new Date(),
        updatedBy: 'user',
      })
      .where(eq(policyRules.id, id))
      .returning();

    if (!updated) {
      throw new AppError('INTERNAL', 'Failed to update policy rule');
    }

    return {
      id: updated.id,
      type: updated.type,
      params: updated.params as Record<string, unknown>,
      enabled: updated.enabled,
      priority: updated.priority,
      version: updated.version,
      description: updated.description,
      isCore: false,
    };
  }

  /**
   * Delete a policy rule. Core guardrails cannot be deleted.
   */
  async deleteRule(id: string): Promise<void> {
    if (CORE_GUARDRAIL_RULES.some((r) => r.id === id)) {
      throw new AppError(
        'VALIDATION',
        'Cannot delete core guardrail rule. Core rules are immutable.'
      );
    }

    const db = getDb();
    const [existing] = await db
      .select()
      .from(policyRules)
      .where(eq(policyRules.id, id))
      .limit(1);

    if (!existing) {
      throw new AppError('NOT_FOUND', `Policy rule with id '${id}' not found.`);
    }

    await db.delete(policyRules).where(eq(policyRules.id, id));
  }

  /**
   * Retrieve recent policy decisions for audit or review.
   */
  async listDecisions(limit = 50) {
    const db = getDb();
    return db
      .select()
      .from(policyDecisions)
      .orderBy(desc(policyDecisions.at))
      .limit(limit);
  }

  /**
   * Simulate a policy rule set against a context without writing to database.
   */
  simulatePolicy(
    rules: PolicyRuleDefinition[],
    context: PolicyEvaluationContext
  ): PolicyEvaluationResult {
    return evaluatePolicyDomain(rules, context);
  }
}

export const policyService = new PolicyService();

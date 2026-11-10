import { getDb } from '@/shared/db';
import { auditLogs, agentExecutionLogs } from '@/db/schema/infra';
import { redactObject } from '@/shared/redact';
import { AuditRecordInput, ExecutionLogInput } from './schemas';

export async function recordAudit(input: AuditRecordInput): Promise<string> {
  const db = getDb();
  const redactedDetails = input.details ? redactObject(input.details) : undefined;

  const [row] = await db
    .insert(auditLogs)
    .values({
      actor: input.actor,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      details: redactedDetails,
    })
    .returning({ id: auditLogs.id });

  return row ? row.id : '';
}

export async function recordExecutionLog(input: ExecutionLogInput): Promise<string> {
  const db = getDb();
  const redactedData = input.data ? redactObject(input.data) : undefined;

  const [row] = await db
    .insert(agentExecutionLogs)
    .values({
      correlationId: input.correlationId,
      workflowId: input.workflowId,
      jobId: input.jobId,
      applicationId: input.applicationId,
      kind: input.kind,
      step: input.step,
      level: input.level,
      message: input.message,
      data: redactedData,
      durationMs: input.durationMs,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      errorClass: input.errorClass,
    })
    .returning({ id: agentExecutionLogs.id });

  return row ? row.id : '';
}

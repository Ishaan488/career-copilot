import { NextResponse } from 'next/server';
import { getDb } from '@/shared/db';
import { applications, jobs, companies } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPipelineStage } from '@/modules/tracking';

export async function GET() {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: applications.id,
        jobId: applications.jobId,
        jobTitle: jobs.title,
        companyName: companies.name,
        status: applications.status,
        platform: applications.platform,
        applicationUrl: applications.applicationUrl,
        submissionSource: applications.submissionSource,
        appliedAt: applications.appliedAt,
        lastActivityAt: applications.lastActivityAt,
        notes: applications.notes,
        updatedAt: applications.updatedAt,
      })
      .from(applications)
      .innerJoin(jobs, eq(applications.jobId, jobs.id))
      .leftJoin(companies, eq(jobs.companyId, companies.id))
      .orderBy(desc(applications.lastActivityAt));

    const enriched = rows.map((r) => ({
      ...r,
      pipelineStage: getPipelineStage(r.status),
    }));

    return NextResponse.json(enriched);
  } catch (err: unknown) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: (err as Error).message } }, { status: 500 });
  }
}

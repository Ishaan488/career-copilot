import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '@/shared/db';
import { applications } from '@/db/schema/applications';
import { jobs } from '@/db/schema/jobs';
import { companies } from '@/db/schema/companies';
import { notifications } from '@/db/schema/infra';
import { GET as getDashboard } from '@/app/api/tracking/dashboard/route';
import { PATCH as updateStatus } from '@/app/api/applications/[id]/status/route';
import { GET as getContacts, POST as createContact } from '@/app/api/applications/[id]/contacts/route';
import { GET as getInterviews, POST as createInterview } from '@/app/api/applications/[id]/interviews/route';
import { GET as getNotes, POST as createNote } from '@/app/api/applications/[id]/notes/route';
import { GET as getNotifications } from '@/app/api/notifications/route';
import { PATCH as readNotification } from '@/app/api/notifications/[id]/read/route';
import { NextRequest } from 'next/server';

describe('Tracking & Notification REST API Endpoints (Doc 09 §api, Doc 14 §3)', () => {
  const db = getDb();
  let testAppId: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    const domain = `test-api-${timestamp}.com`;

    const [comp] = await db
      .insert(companies)
      .values({
        name: `API Test Corp ${timestamp}`,
        normalizedName: `api test corp ${timestamp}`,
        primaryDomain: domain,
      })
      .returning();

    const [jb] = await db
      .insert(jobs)
      .values({
        companyId: comp!.id,
        title: 'Backend Platform Engineer',
        normalizedTitle: 'backend platform engineer',
        descriptionText: 'Designing scalable services and queues',
        descriptionHash: `hash-${timestamp}`,
        applicationUrl: `https://boards.greenhouse.io/apitest/jobs/${timestamp}`,
        canonicalUrl: `https://boards.greenhouse.io/apitest/jobs/${timestamp}`,
        status: 'shortlisted',
        recommendation: 'strong_match',
      })
      .returning();

    const [app] = await db
      .insert(applications)
      .values({
        jobId: jb!.id,
        dedupeKey: `apitest:${timestamp}`,
        status: 'submitted',
        platform: 'greenhouse',
        applicationUrl: jb!.applicationUrl!,
      })
      .returning();
    testAppId = app!.id;
  });

  it('GET /api/tracking/dashboard returns stats and attention items from real DB', async () => {
    const response = await getDashboard();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.stats).toBeDefined();
    expect(typeof data.stats.newToday).toBe('number');
    expect(typeof data.stats.inProgress).toBe('number');
    expect(data.stats.worker).toBeDefined();
    expect(data.attention).toBeDefined();
    expect(data.deadlines).toBeDefined();
    expect(data.recentActivity).toBeDefined();
  });

  it('PATCH /api/applications/[id]/status transitions status and rejects invalid jumps', async () => {
    // Valid transition: submitted -> under_review
    const validReq = new NextRequest(`http://localhost:3000/api/applications/${testAppId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toStatus: 'under_review',
        actor: 'user',
      }),
    });

    const validRes = await updateStatus(validReq, { params: Promise.resolve({ id: testAppId }) });
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.status).toBe('under_review');

    // Invalid transition: under_review -> preparing (cannot jump backward)
    const invalidReq = new NextRequest(`http://localhost:3000/api/applications/${testAppId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toStatus: 'preparing',
        actor: 'user',
      }),
    });

    const invalidRes = await updateStatus(invalidReq, { params: Promise.resolve({ id: testAppId }) });
    expect(invalidRes.status).toBe(400);
    const invalidData = await invalidRes.json();
    expect(invalidData.error?.code).toBe('VALIDATION');
  });

  it('POST & GET /api/applications/[id]/contacts manages contacts', async () => {
    const createReq = new NextRequest(`http://localhost:3000/api/applications/${testAppId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sarah Connor',
        email: 'sarah@test.com',
        role: 'Recruiter',
      }),
    });

    const createRes = await createContact(createReq, { params: Promise.resolve({ id: testAppId }) });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.name).toBe('Sarah Connor');

    const getReq = new NextRequest(`http://localhost:3000/api/applications/${testAppId}/contacts`);
    const getRes = await getContacts(getReq, { params: Promise.resolve({ id: testAppId }) });
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.contacts.some((c: { name: string }) => c.name === 'Sarah Connor')).toBe(true);
  });

  it('POST & GET /api/applications/[id]/interviews schedules and lists interviews', async () => {
    const interviewDate = new Date(Date.now() + 86400000).toISOString();

    const createReq = new NextRequest(`http://localhost:3000/api/applications/${testAppId}/interviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: 'technical',
        title: 'System Design Interview',
        scheduledAt: interviewDate,
        durationMinutes: 60,
      }),
    });

    const createRes = await createInterview(createReq, { params: Promise.resolve({ id: testAppId }) });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.title).toBe('System Design Interview');

    const getReq = new NextRequest(`http://localhost:3000/api/applications/${testAppId}/interviews`);
    const getRes = await getInterviews(getReq, { params: Promise.resolve({ id: testAppId }) });
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.interviews.some((i: { title: string }) => i.title === 'System Design Interview')).toBe(true);
  });

  it('POST & GET /api/applications/[id]/notes manages notes', async () => {
    const createReq = new NextRequest(`http://localhost:3000/api/applications/${testAppId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Candidate has strong background in distributed transactions',
      }),
    });

    const createRes = await createNote(createReq, { params: Promise.resolve({ id: testAppId }) });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.content).toContain('distributed transactions');

    const getReq = new NextRequest(`http://localhost:3000/api/applications/${testAppId}/notes`);
    const getRes = await getNotes(getReq, { params: Promise.resolve({ id: testAppId }) });
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.notes.some((n: { id: string }) => n.id === created.id)).toBe(true);
  });

  it('GET /api/notifications & PATCH /api/notifications/[id]/read manages notifications', async () => {
    const [notif] = await db
      .insert(notifications)
      .values({
        type: 'interview_upcoming',
        severity: 'info',
        title: 'Upcoming Interview',
        body: 'Interview tomorrow at 10 AM',
      })
      .returning();

    const getReq = new NextRequest('http://localhost:3000/api/notifications');
    const getRes = await getNotifications(getReq);
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.notifications.some((n: { id: string }) => n.id === notif!.id)).toBe(true);

    const readReq = new NextRequest(`http://localhost:3000/api/notifications/${notif!.id}/read`, {
      method: 'PATCH',
    });
    const readRes = await readNotification(readReq, { params: Promise.resolve({ id: notif!.id }) });
    expect(readRes.status).toBe(200);
    const readData = await readRes.json();
    expect(readData.success).toBe(true);
  });
});

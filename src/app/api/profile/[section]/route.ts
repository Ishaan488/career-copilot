import { NextRequest, NextResponse } from 'next/server';
import {
  addEmail,
  addPhone,
  addWorkAuth,
  addEducation,
  addExperience,
  addSkill,
  addProject,
  addLink,
} from '@/modules/profile';
import { AppError } from '@/shared/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ section: string }> }
) {
  try {
    const { section } = await params;
    const body = await req.json();

    let created: unknown;
    switch (section) {
      case 'emails':
        created = await addEmail(body.email, body.isPrimary);
        break;
      case 'phones':
        created = await addPhone(body.e164, body.isPrimary);
        break;
      case 'work_authorizations':
        created = await addWorkAuth(body.country, body.status, body.details);
        break;
      case 'education':
        created = await addEducation(body);
        break;
      case 'experience':
        created = await addExperience(body);
        break;
      case 'skills':
        created = await addSkill(body);
        break;
      case 'projects':
        created = await addProject(body);
        break;
      case 'links':
        created = await addLink(body.kind, body.url);
        break;
      default:
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: `Unknown profile section: ${section}` } }, { status: 404 });
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to add section item' } }, { status: 500 });
  }
}

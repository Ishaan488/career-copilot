import { NextRequest, NextResponse } from 'next/server';
import {
  deleteEmail,
  deletePhone,
  deleteWorkAuth,
  updateEducation,
  deleteEducation,
  updateExperience,
  deleteExperience,
  deleteSkill,
  deleteProject,
  deleteLink,
} from '@/modules/profile';
import { AppError } from '@/shared/errors';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ section: string; id: string }> }
) {
  try {
    const { section, id } = await params;
    const body = await req.json();

    let updated: unknown;
    switch (section) {
      case 'education':
        updated = await updateEducation(id, body);
        break;
      case 'experience':
        updated = await updateExperience(id, body);
        break;
      default:
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: `Update not supported for section: ${section}` } }, { status: 400 });
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to update section item' } }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ section: string; id: string }> }
) {
  try {
    const { section, id } = await params;

    switch (section) {
      case 'emails':
        await deleteEmail(id);
        break;
      case 'phones':
        await deletePhone(id);
        break;
      case 'work_authorizations':
        await deleteWorkAuth(id);
        break;
      case 'education':
        await deleteEducation(id);
        break;
      case 'experience':
        await deleteExperience(id);
        break;
      case 'skills':
        await deleteSkill(id);
        break;
      case 'projects':
        await deleteProject(id);
        break;
      case 'links':
        await deleteLink(id);
        break;
      default:
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: `Unknown section: ${section}` } }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: `Deleted ${section} item` });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 400 });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Failed to delete section item' } }, { status: 500 });
  }
}

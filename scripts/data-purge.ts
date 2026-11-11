import { purgeUserData } from '../src/modules/maintenance';
import { closeDbPool } from '../src/shared/db';

async function main() {
  const args = process.argv.slice(2);
  const confirmIndex = args.indexOf('--confirm');
  const confirmValue = confirmIndex !== -1 ? args[confirmIndex + 1] : undefined;

  if (confirmValue !== 'PURGE_PERSONAL_DATA') {
    console.error('⚠️  CRITICAL WARNING: This script permanently purges all candidate personal data!');
    console.error('   (Profiles, resumes, applications, interviews, contacts, answers, and reviews will be destroyed.)');
    console.error('');
    console.error('To proceed, specify the exact confirmation string:');
    console.error('   npm run data:purge -- --confirm PURGE_PERSONAL_DATA');
    process.exit(1);
  }

  console.info('=== Career Copilot Personal Data Purge ===');
  try {
    const summary = await purgeUserData({ confirmation: confirmValue });
    console.info(`✅ Data purge completed successfully:`);
    console.info(`   Profiles deleted:        ${summary.deleted.profiles}`);
    console.info(`   Resumes deleted:         ${summary.deleted.resumes} (${summary.deleted.resumeFilesDeleted} PDF files deleted from disk)`);
    console.info(`   Applications deleted:    ${summary.deleted.applications}`);
    console.info(`   Events deleted:          ${summary.deleted.applicationEvents}`);
    console.info(`   Interviews deleted:      ${summary.deleted.interviews}`);
    console.info(`   Contacts deleted:        ${summary.deleted.contacts}`);
    console.info(`   Reusable answers:        ${summary.deleted.reusableAnswers}`);
    console.info(`   Review requests deleted: ${summary.deleted.reviewRequests}`);
    await closeDbPool();
  } catch (err) {
    console.error('❌ Data purge failed:', (err as Error).message);
    await closeDbPool();
    process.exit(1);
  }
}

main();

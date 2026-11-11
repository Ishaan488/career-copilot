import { exportUserData } from '../src/modules/maintenance';
import { closeDbPool } from '../src/shared/db';

async function main() {
  console.info('=== Career Copilot Personal Data Export ===');
  try {
    const summary = await exportUserData();
    console.info(`✅ Data export successful!`);
    console.info(`   Export location: ${summary.exportDir}`);
    console.info(`   Profiles:        ${summary.counts.profiles}`);
    console.info(`   Resumes:         ${summary.counts.resumes} (${summary.counts.resumeFilesCopied} PDF files copied)`);
    console.info(`   Applications:    ${summary.counts.applications}`);
    console.info(`   Events:          ${summary.counts.applicationEvents}`);
    console.info(`   Interviews:      ${summary.counts.interviews}`);
    console.info(`   Contacts:        ${summary.counts.contacts}`);
    console.info(`   Reusable answers:${summary.counts.reusableAnswers}`);
    console.info(`   Review requests: ${summary.counts.reviewRequests}`);
    await closeDbPool();
  } catch (err) {
    console.error('❌ Data export failed:', (err as Error).message);
    await closeDbPool();
    process.exit(1);
  }
}

main();

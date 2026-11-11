import { runRetentionPruning } from '../src/modules/maintenance';
import { closeDbPool } from '../src/shared/db';

async function main() {
  console.info('=== Career Copilot Data Retention & Pruning ===');
  try {
    const summary = await runRetentionPruning();
    console.info('✅ Retention pruning completed:');
    console.info(`   Job snapshots pruned:      ${summary.jobSnapshotsPruned}`);
    console.info(`   Company evidence archived: ${summary.evidenceArchived}`);
    console.info(`   Company evidence pruned:   ${summary.evidencePruned}`);
    console.info(`   Screenshots pruned:        ${summary.screenshotsPruned}`);
    console.info(`   AI logs pruned:            ${summary.aiLogsPruned}`);
    console.info(`   AI cache pruned:           ${summary.aiCachePruned}`);
    console.info(`   Execution logs pruned:     ${summary.execLogsPruned}`);
    console.info(`   Heartbeats pruned:         ${summary.heartbeatsPruned}`);
    console.info(`   Temporary files cleaned:   ${summary.tempFilesCleaned}`);
    await closeDbPool();
  } catch (err) {
    console.error('❌ Retention pruning failed:', (err as Error).message);
    await closeDbPool();
    process.exit(1);
  }
}

main();

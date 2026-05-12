/**
 * Runs `prisma migrate deploy`, then `next build`.
 * If deploy fails with P3009 for the historical PendingReview migration (failed row in _prisma_migrations),
 * runs `migrate resolve --rolled-back` once and retries deploy — avoids blocking Vercel until manual CLI fix.
 *
 * Scoped strictly to that migration id so other failures surface normally.
 */
const { spawnSync } = require('child_process');

const FAILED_MIGRATION = '20260512190000_pending_review_intent_fields';

function runCapture(command) {
    const r = spawnSync(command, {
        encoding: 'utf8',
        shell: true,
        stdio: ['inherit', 'pipe', 'pipe'],
    });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    return { status: r.status ?? 1, out };
}

function runInherit(command) {
    const r = spawnSync(command, { encoding: 'utf8', shell: true, stdio: 'inherit' });
    return r.status ?? 1;
}

const first = runCapture('npx prisma migrate deploy');
if (first.status === 0) {
    process.exit(runInherit('npx next build --webpack'));
}

console.error(first.out);

const recover =
    first.out.includes('P3009') &&
    first.out.includes(FAILED_MIGRATION);
if (!recover) {
    process.exit(first.status);
}

console.error(`[migrate-deploy-or-recover] P3009 for ${FAILED_MIGRATION}: resolving rolled-back and retrying deploy`);

const resolve = runCapture(`npx prisma migrate resolve --rolled-back "${FAILED_MIGRATION}"`);
if (resolve.status !== 0) {
    console.error(resolve.out);
    process.exit(resolve.status);
}

const second = runCapture('npx prisma migrate deploy');
if (second.status !== 0) {
    console.error(second.out);
    process.exit(second.status);
}

process.exit(runInherit('npx next build --webpack'));

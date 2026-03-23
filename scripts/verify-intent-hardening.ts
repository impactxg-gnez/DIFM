import { runExtractionPipeline } from '../lib/pricing/extractionEngine';

interface VerificationCase {
    input: string;
    expectedJob: string;
    expectedQuantity?: number;
}

const CASES: VerificationCase[] = [
    { input: 'cabinet hang fix', expectedJob: 'handyman_small_repair', expectedQuantity: 1 },
    { input: 'tighten hinge', expectedJob: 'handyman_small_repair', expectedQuantity: 1 },
    { input: 'replace five sockets', expectedJob: 'replace_socket_faceplate', expectedQuantity: 5 },
    { input: 'replace 2 sockets', expectedJob: 'replace_socket_faceplate', expectedQuantity: 2 },
    { input: 'mount 55 inch tv', expectedJob: 'tv_mount_standard', expectedQuantity: 1 },
    { input: 'hang 2 mirrors', expectedJob: 'mirror_hang', expectedQuantity: 2 },
    { input: 'install 10 shelves', expectedJob: 'shelf_install_single', expectedQuantity: 10 },
    { input: 'hang mirror', expectedJob: 'mirror_hang', expectedQuantity: 1 },
];

async function verifyMappedCases() {
    for (const testCase of CASES) {
        const result = await runExtractionPipeline(testCase.input);
        const hasJob = result.jobs.includes(testCase.expectedJob);
        const quantity = result.quantities[testCase.expectedJob] || 0;
        const quantityPass = testCase.expectedQuantity === undefined || quantity === testCase.expectedQuantity;
        console.log('[IntentHardeningCase]', {
            input: testCase.input,
            expectedJob: testCase.expectedJob,
            expectedQuantity: testCase.expectedQuantity,
            actualJobs: result.jobs,
            actualQuantity: quantity,
            pass: hasJob && quantityPass
        });
        if (!hasJob || !quantityPass) {
            throw new Error(`Failed for "${testCase.input}"`);
        }
    }
}

async function verifyClarifyCase() {
    const result = await runExtractionPipeline('full house handyman');
    const isClarify = result.jobs.length === 0 && !!result.message;
    console.log('[IntentHardeningClarify]', {
        input: 'full house handyman',
        jobs: result.jobs,
        message: result.message,
        pass: isClarify
    });
    if (!isClarify) {
        throw new Error('Expected CLARIFY behavior for vague input');
    }
}

async function verifyMultiJobCase() {
    const result = await runExtractionPipeline('hang 2 mirrors and a shelf');
    const mirrorOk = result.jobs.includes('mirror_hang') && (result.quantities.mirror_hang || 0) === 2;
    const shelfOk = result.jobs.includes('shelf_install_single') && (result.quantities.shelf_install_single || 0) === 1;
    console.log('[IntentHardeningMultiJob]', {
        input: 'hang 2 mirrors and a shelf',
        jobs: result.jobs,
        quantities: result.quantities,
        pass: mirrorOk && shelfOk
    });
    if (!mirrorOk || !shelfOk) {
        throw new Error('Expected mirror_hang x2 and shelf_install_single x1');
    }
}

async function main() {
    // Keep deterministic behavior while verifying mapping hardening.
    delete process.env.OPENAI_API_KEY;
    await verifyMappedCases();
    await verifyMultiJobCase();
    await verifyClarifyCase();
    console.log('SUCCESS: Intent hardening verification checks passed.');
}

main().catch((error) => {
    console.error('Intent hardening verification failed:', error);
    process.exit(1);
});

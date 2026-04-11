import { runExtractionPipeline } from '../lib/pricing/extractionEngine';

interface RegressionCase {
    input: string;
    expectedJob: string;
}

const CASES: RegressionCase[] = [
    { input: 'hang mirror', expectedJob: 'mirror_hang_single' },
    { input: 'mount mirror', expectedJob: 'mirror_hang_single' },
    { input: 'install mirror', expectedJob: 'mirror_hang_single' },
    { input: 'hang picture', expectedJob: 'pic_hang_single' },
    { input: 'install shelf', expectedJob: 'shelf_install_single' },
];

async function main() {
    // Keep this deterministic for regression checks.
    delete process.env.OPENAI_API_KEY;

    for (const testCase of CASES) {
        const result = await runExtractionPipeline(testCase.input);
        const matched = result.jobs.includes(testCase.expectedJob);
        console.log('[IntentPriorityRegression]', {
            input: testCase.input,
            expected: testCase.expectedJob,
            actual: result.jobs,
            pass: matched
        });
        if (!matched) {
            throw new Error(`Expected ${testCase.expectedJob} for "${testCase.input}" but got ${result.jobs.join(',') || 'none'}`);
        }
    }

    console.log('SUCCESS: Specific intent priority regression checks passed.');
}

main().catch((error) => {
    console.error('Intent priority verification failed:', error);
    process.exit(1);
});

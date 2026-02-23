
import { tokenize, matchJobItemRules } from './lib/pricing/jobParser';
import { excelSource } from './lib/pricing/excelLoader';
import { calculateV1Pricing } from './lib/pricing/v1Pricing';

async function finalAudit() {
    excelSource.ensureLoaded();
    const rules = excelSource.jobItemRules;

    const auditCases = [
        { desc: "Fix a shelf", expectedTier: "H1", expectedPrice: 59 },
        { desc: "Hang a mirror", expectedTier: "H1", expectedPrice: 59 },
        { desc: "Mount the TV", expectedTier: "H1", expectedPrice: 59 },
        { desc: "Fix a leaky tap", expectedTier: "P1", expectedPrice: 85 },
        { desc: "Replace a light switch", expectedTier: "E1", expectedPrice: 85 },
        { desc: "Tidy up the cables", expectedTier: "H1", expectedPrice: 59 },
        { desc: "Fill a hole in the wall", expectedTier: "H1", expectedPrice: 59 }
    ];

    console.log('--- FINAL COMPLIANCE AUDIT ---');
    for (const test of auditCases) {
        const pricing = await calculateV1Pricing(test.desc);
        const visit = pricing.visits[0];

        if (!visit) {
            console.log(`❌ "${test.desc}" -> No detection!`);
            continue;
        }

        const pass = visit.tier === test.expectedTier && visit.price === test.expectedPrice;
        console.log(`${pass ? '✅' : '❌'} "${test.desc}" -> ${visit.tier} (£${visit.price}) [Expected: ${test.expectedTier} (£${test.expectedPrice})]`);
    }
}

finalAudit().catch(console.error);

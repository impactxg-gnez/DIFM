
const { excelSource } = require('./lib/pricing/excelLoader.js');

async function inspectIngestedRules() {
    excelSource.ensureLoaded();
    const rules = excelSource.jobItemRules;

    console.log('--- INGESTED RULES INSPECTION ---');
    for (const [id, rule] of rules.entries()) {
        console.log(`\nID: ${id}`);
        console.log(`Include: [${rule.include.join(', ')}]`);
        console.log(`Optional: [${rule.optional.join(', ')}]`);
    }
}

inspectIngestedRules().catch(console.error);


const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(process.cwd(), 'DIFM_Pilot_Matrix_v1_Baseline.xlsx');

try {
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    console.log('--- Job Item Details: shelf_install_single ---');
    const jobItemsSheet = workbook.Sheets['Job_Items'];
    const jobItems = XLSX.utils.sheet_to_json(jobItemsSheet);
    const shelfItem = jobItems.find(i => i.job_item_id === 'shelf_install_single');
    console.log(JSON.stringify(shelfItem, null, 2));

    console.log('\n--- Pricing Tiers: HANDYMAN ---');
    const pricingSheet = workbook.Sheets['Pricing_Tiers'];
    const pricingTiers = XLSX.utils.sheet_to_json(pricingSheet);
    const handymanTiers = pricingTiers.filter(t => t.ladder === 'HANDYMAN');
    console.log(JSON.stringify(handymanTiers, null, 2));

} catch (e) {
    console.error('Error:', e.message);
}

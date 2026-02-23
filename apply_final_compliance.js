
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(process.cwd(), 'DIFM_Pilot_Matrix_v1_Baseline.xlsx');

try {
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // 1. Fix Tiers in Pricing_Tiers (E1 should be 85, P1 should be 85)
    const tierSheet = workbook.Sheets['Pricing_Tiers'];
    const tierData = XLSX.utils.sheet_to_json(tierSheet);
    tierData.forEach(row => {
        if (row.tier === 'P1' && row.ladder === 'PLUMBING') row.max_minutes = 60, row.price_gbp = 85;
        if (row.tier === 'E1' && row.ladder === 'ELECTRICAL') row.max_minutes = 60, row.price_gbp = 85;
    });
    workbook.Sheets['Pricing_Tiers'] = XLSX.utils.json_to_sheet(tierData);

    // 2. Fix Weights in Job_Items (tap_leak_fix should be 60m)
    const jobSheet = workbook.Sheets['Job_Items'];
    const jobData = XLSX.utils.sheet_to_json(jobSheet);
    jobData.forEach(row => {
        if (row.job_item_id === 'tap_leak_fix') row.default_time_weight_minutes = 60;
        if (row.job_item_id === 'socket_replace') row.default_time_weight_minutes = 60;
    });
    workbook.Sheets['Job_Items'] = XLSX.utils.json_to_sheet(jobData);

    // 3. Fix Rule Detection (Missing keywords in audit)
    const rulesSheet = workbook.Sheets['Job_Item_Rules'];
    const rulesData = XLSX.utils.sheet_to_json(rulesSheet);

    // Fix Cable Concealment: include should be single keywords if we want "Tidy up the cables" to work
    const cableRule = rulesData.find(r => r.canonical_job_item_id === 'cable_concealment');
    if (cableRule) {
        cableRule.include = 'cable'; // Just one keyword is safer for "Tidy the cables"
        cableRule.optional = 'hide,conceal,cover,tidy,run,trunking,up,wires';
    }

    // Fix Wall Hole: make "wall" optional so "Fill a hole" works
    const holeRule = rulesData.find(r => r.canonical_job_item_id === 'wall_hole_fill');
    if (holeRule) {
        holeRule.include = 'hole';
        holeRule.optional = 'fill,patch,repair,wall,in';
    }

    workbook.Sheets['Job_Item_Rules'] = XLSX.utils.json_to_sheet(rulesData);

    XLSX.writeFile(workbook, filePath);
    console.log('Successfully applied FINAL compliance fixes.');

} catch (e) {
    console.error('Error:', e.message);
}

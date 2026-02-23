
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(process.cwd(), 'DIFM_Pilot_Matrix_v1_Baseline.xlsx');

try {
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const rulesSheet = workbook.Sheets['Job_Item_Rules'];
    const rulesData = XLSX.utils.sheet_to_json(rulesSheet);

    // 1. Tidy up the cables
    const cableRule = rulesData.find(r => r.canonical_job_item_id === 'cable_concealment');
    if (cableRule) {
        cableRule.include = 'cable';
        cableRule.optional = 'hide,conceal,cover,tidy,run,trunking,up,the,wires,some';
    }

    // 2. Fill a hole in the wall
    const holeRule = rulesData.find(r => r.canonical_job_item_id === 'wall_hole_fill');
    if (holeRule) {
        holeRule.include = 'hole';
        holeRule.optional = 'fill,patch,repair,wall,in,the,a';
    }

    workbook.Sheets['Job_Item_Rules'] = XLSX.utils.json_to_sheet(rulesData);

    XLSX.writeFile(workbook, filePath);
    console.log('Successfully refined Excel keywords.');

} catch (e) {
    console.error('Error:', e.message);
}

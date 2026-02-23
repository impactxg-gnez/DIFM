
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(process.cwd(), 'DIFM_Pilot_Matrix_v1_Baseline.xlsx');

try {
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const rulesSheet = workbook.Sheets['Job_Item_Rules'];
    const rulesData = XLSX.utils.sheet_to_json(rulesSheet);

    rulesData.forEach(r => {
        if (r.canonical_job_item_id === 'cable_concealment') {
            r.include = 'cable';
            r.optional = 'tidy,up,the,cables,hide,conceal,cover,some,wires';
        }
        if (r.canonical_job_item_id === 'wall_hole_fill') {
            r.include = 'hole';
            r.optional = 'fill,a,in,the,wall,holes,patch';
        }
    });

    workbook.Sheets['Job_Item_Rules'] = XLSX.utils.json_to_sheet(rulesData);

    XLSX.writeFile(workbook, filePath);
    console.log('Successfully normalized Excel rules.');

} catch (e) {
    console.error('Error:', e.message);
}

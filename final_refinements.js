
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
        if (r.canonical_job_item_id === 'socket_replace') {
            r.include = 'switch';
            r.optional = 'replace,fix,change,install,light,sockets,socket,a';
        }
        if (r.canonical_job_item_id === 'cable_concealment') {
            r.include = 'cable';
            r.optional = 'hide,conceal,cover,tidy,run,trunking,up,the,wires,some,cables,a';
        }
        if (r.canonical_job_item_id === 'wall_hole_fill') {
            r.include = 'hole';
            r.optional = 'fill,patch,repair,wall,in,the,a,holes';
        }
    });

    workbook.Sheets['Job_Item_Rules'] = XLSX.utils.json_to_sheet(rulesData);

    XLSX.writeFile(workbook, filePath);
    console.log('Successfully applied FINAL rule refinements.');

} catch (e) {
    console.error('Error:', e.message);
}

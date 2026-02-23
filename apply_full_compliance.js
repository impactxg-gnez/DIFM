
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const filePath = path.join(process.cwd(), 'DIFM_Pilot_Matrix_v1_Baseline.xlsx');

try {
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // 1. Fix Time Weights in Job_Items
    const jobSheet = workbook.Sheets['Job_Items'];
    const jobData = XLSX.utils.sheet_to_json(jobSheet);
    const targets = ['mirror_hang', 'tv_mount_standard', 'picture_hang', 'cable_concealment', 'wall_hole_fill'];

    jobData.forEach(row => {
        if (targets.includes(row.job_item_id)) {
            console.log(`Setting ${row.job_item_id}: ${row.default_time_weight_minutes}m -> 60m`);
            row.default_time_weight_minutes = 60;
        }
    });
    workbook.Sheets['Job_Items'] = XLSX.utils.json_to_sheet(jobData);

    // 2. Expand Rules in Job_Item_Rules
    const rulesSheet = workbook.Sheets['Job_Item_Rules'];
    let rulesData = XLSX.utils.sheet_to_json(rulesSheet);

    const extraRules = [
        {
            canonical_job_item_id: 'tap_leak_fix',
            include: 'tap,leak',
            optional: 'fix,repair,drip',
            exclude: ''
        },
        {
            canonical_job_item_id: 'socket_replace',
            include: 'socket,switch',
            optional: 'replace,fix,change,install',
            exclude: ''
        }
    ];

    extraRules.forEach(nr => {
        const existing = rulesData.find(r => r.canonical_job_item_id === nr.canonical_job_item_id);
        if (existing) {
            Object.assign(existing, nr);
        } else {
            rulesData.push(nr);
        }
    });

    workbook.Sheets['Job_Item_Rules'] = XLSX.utils.json_to_sheet(rulesData);

    XLSX.writeFile(workbook, filePath);
    console.log('Successfully applied comprehensive compliance fixes.');

} catch (e) {
    console.error('Error:', e.message);
}

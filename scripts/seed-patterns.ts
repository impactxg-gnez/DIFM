import { prisma } from '../lib/prisma';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

async function seedPatterns() {
    try {
        const csvPath = path.join(process.cwd(), 'pattern_matching_reference.csv');
        
        if (!fs.existsSync(csvPath)) {
            console.error(`CSV file not found at: ${csvPath}`);
            process.exit(1);
        }
        
        const csvContent = fs.readFileSync(csvPath, 'utf-8');
        const records = parse(csvContent, { 
            columns: true, 
            skip_empty_lines: true,
            trim: true
        });

        console.log(`Found ${records.length} patterns to seed...`);

        let imported = 0;
        let skipped = 0;
        let errors = 0;

        for (const record of records) {
            try {
                const category = record.Category?.trim();
                const keywordsStr = record['Keywords (comma-separated)']?.trim() || '';
                const catalogueItemId = record['Catalogue Item ID']?.trim();
                const description = record.Description?.trim();
                const examplePhrases = record['Example Phrases']?.trim() || '';

                if (!category || !keywordsStr || !catalogueItemId || !description) {
                    console.warn(`Skipping incomplete record: ${JSON.stringify(record)}`);
                    skipped++;
                    continue;
                }

                // Parse keywords
                const keywords = keywordsStr
                    .split(',')
                    .map((k: string) => k.trim())
                    .filter(Boolean);

                if (keywords.length === 0) {
                    console.warn(`Skipping record with no keywords: ${description}`);
                    skipped++;
                    continue;
                }

                // Check if pattern already exists
                const existing = await prisma.jobPattern.findFirst({
                    where: {
                        category,
                        catalogueItemId,
                        description
                    }
                });

                if (existing) {
                    console.log(`Pattern already exists: ${description} - skipping`);
                    skipped++;
                    continue;
                }

                // Create pattern
                await prisma.jobPattern.create({
                    data: {
                        category,
                        keywords: JSON.stringify(keywords),
                        catalogueItemId,
                        description,
                        examplePhrases: examplePhrases || null,
                        isActive: true,
                        priority: 0
                    }
                });

                imported++;
            } catch (error: any) {
                console.error(`Error importing pattern: ${record.Description}`, error.message);
                errors++;
            }
        }

        console.log(`\n✅ Seed complete!`);
        console.log(`   Imported: ${imported}`);
        console.log(`   Skipped: ${skipped}`);
        console.log(`   Errors: ${errors}`);
    } catch (error) {
        console.error('Failed to seed patterns:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

seedPatterns();

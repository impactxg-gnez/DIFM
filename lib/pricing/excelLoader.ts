import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

export interface PhraseMappingExcel {
    phrase: string;
    positive_keywords: string[];
    negative_keywords: string[];
    canonical_job_item_id: string;
    priority: number;
}

export interface JobItemExcel {
    job_item_id: string;
    display_name: string;
    capability_tag: string;
    default_time_weight_minutes: number;
    pricing_ladder: string;
    clarifier_ids: string[];
    uncertainty_prone: boolean;
    uncertainty_handling: 'IGNORE' | 'BUFFER' | 'FORCE_H3';
    risk_buffer_minutes: number;
}

export interface PricingTierExcel {
    tier: string;
    ladder: string;
    max_minutes: number;
    price_gbp: number;
}

export interface ClarifierExcel {
    clarifier_id: string;
    question: string;
}

class ExcelSource {
    private static instance: ExcelSource;
    private filePath: string;

    private _phraseMappings: PhraseMappingExcel[] = [];
    private _jobItems: Map<string, JobItemExcel> = new Map();
    private _pricingTiers: Map<string, PricingTierExcel[]> = new Map(); // ladder -> tiers
    private _clarifierLibrary: Map<string, string> = new Map(); // id -> question

    private loaded = false;

    private constructor() {
        this.filePath = path.join(process.cwd(), 'DIFM_Pilot_Matrix_v1_Baseline.xlsx');
    }

    public static getInstance(): ExcelSource {
        if (!ExcelSource.instance) {
            ExcelSource.instance = new ExcelSource();
        }
        return ExcelSource.instance;
    }

    // Getters with lazy loading
    public get phraseMappings() {
        this.ensureLoaded();
        return this._phraseMappings;
    }

    public get jobItems() {
        this.ensureLoaded();
        return this._jobItems;
    }

    public get pricingTiers() {
        this.ensureLoaded();
        return this._pricingTiers;
    }

    public get clarifierLibrary() {
        this.ensureLoaded();
        return this._clarifierLibrary;
    }

    public ensureLoaded() {
        if (!this.loaded) {
            this.load();
        }
    }

    public reload() {
        this.loaded = false;
        this.load();
    }

    private load() {
        if (this.loaded) return;

        if (!fs.existsSync(this.filePath)) {
            console.warn(`[ExcelSource] File not found: ${this.filePath}. Proceeding with empty data.`);
            this.loaded = true;
            return;
        }

        try {
            const workbook = XLSX.readFile(this.filePath);

            // 1. Phrase_Mapping
            const phraseSheet = workbook.Sheets['Phrase_Mapping'];
            if (phraseSheet) {
                const data = XLSX.utils.sheet_to_json(phraseSheet);
                this._phraseMappings = data.map((row: any) => ({
                    phrase: row.phrase || '',
                    positive_keywords: (row.positive_keywords || '').split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean),
                    negative_keywords: (row.negative_keywords || '').split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean),
                    canonical_job_item_id: row.canonical_job_item_id || '',
                    priority: row.priority || 0
                }));
                console.log(`[ExcelSource] Loaded ${this._phraseMappings.length} phrase mappings`);
            }

            // 2. Job_Items
            const jobItemsSheet = workbook.Sheets['Job_Items'];
            if (jobItemsSheet) {
                const data = XLSX.utils.sheet_to_json(jobItemsSheet);
                this._jobItems.clear();
                data.forEach((row: any) => {
                    this._jobItems.set(row.job_item_id, {
                        job_item_id: row.job_item_id,
                        display_name: row.display_name,
                        capability_tag: row.capability_tag,
                        default_time_weight_minutes: row.default_time_weight_minutes || 0,
                        pricing_ladder: row.pricing_ladder,
                        clarifier_ids: (row.clarifier_ids || '').split(',').map((id: string) => id.trim()).filter(Boolean),
                        uncertainty_prone: !!row.uncertainty_prone || false,
                        uncertainty_handling: row.uncertainty_handling || 'IGNORE',
                        risk_buffer_minutes: row.risk_buffer_minutes || 0
                    });
                });
                console.log(`[ExcelSource] Loaded ${this._jobItems.size} job items`);
            }

            // 3. Pricing_Tiers
            const pricingSheet = workbook.Sheets['Pricing_Tiers'];
            if (pricingSheet) {
                const data = XLSX.utils.sheet_to_json(pricingSheet);
                this._pricingTiers.clear();
                data.forEach((row: any) => {
                    const ladder = row.ladder;
                    if (!this._pricingTiers.has(ladder)) this._pricingTiers.set(ladder, []);
                    this._pricingTiers.get(ladder)!.push({
                        tier: row.tier,
                        ladder: row.ladder,
                        max_minutes: row.max_minutes || 0,
                        price_gbp: row.price_gbp || 0
                    });
                });
                this._pricingTiers.forEach(tiers => tiers.sort((a, b) => a.max_minutes - b.max_minutes));
                console.log(`[ExcelSource] Loaded pricing ladders: ${Array.from(this._pricingTiers.keys()).join(', ')}`);
            }

            // 4. Clarifier_Library
            const clarifierSheet = workbook.Sheets['Clarifier_Library'];
            if (clarifierSheet) {
                const data = XLSX.utils.sheet_to_json(clarifierSheet);
                this._clarifierLibrary.clear();
                data.forEach((row: any) => {
                    this._clarifierLibrary.set(row.clarifier_id, row.question);
                });
                console.log(`[ExcelSource] Loaded ${this._clarifierLibrary.size} clarifiers`);
            }

            this.loaded = true;
        } catch (error) {
            console.error(`[ExcelSource] Failed to load excel file:`, error);
            // Don't set loaded=true so it can retry later if it was a lock issue
        }
    }
}

export const excelSource = ExcelSource.getInstance();

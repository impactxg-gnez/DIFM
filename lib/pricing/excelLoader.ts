import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import type { MatrixV2Model } from './matrixV2/types';
import { parseMatrixV2Workbook } from './matrixV2/loadFromWorkbook';

export interface PhraseMappingExcel {
    pattern_id?: number;
    phrase: string;
    positive_keywords: string[];
    negative_keywords: string[];
    canonical_job_item_id: string;
    priority: number;
    status?: string;
    auto_match_allowed?: boolean;
    auto_match_min_tokens?: number;
    confidence_threshold?: number;
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
    ai_extractable: boolean;
}

export interface PricingTierExcel {
    tier: string;
    ladder: string;
    max_minutes: number;
    price_gbp: number;
}

export interface CapabilityGuardrailExcel {
    capability: string;
    max_ladder: string;
    ladder_max_time: number;
    overflow_action: 'REVIEW';
}

export interface ClarifierExcel {
    clarifier_id: string;
    question: string;
    input_type?: string;
    required_YN?: string;
    trigger_keywords?: string;
    impacts?: string;
    notes?: string;
    show_mode?: string;
    type?: string;
    options_json?: string;
    options?: string[];
}

export interface JobItemRuleExcel {
    job_item_id: string;
    include: string[];
    optional: string[];
    exclude: string[];
}

class ExcelSource {
    private static instance: ExcelSource;
    private filePath: string;

    private _phraseMappings: PhraseMappingExcel[] = [];
    private _jobItems: Map<string, JobItemExcel> = new Map();
    private _pricingTiers: Map<string, PricingTierExcel[]> = new Map(); // ladder -> tiers
    private _capabilityGuardrails: Map<string, CapabilityGuardrailExcel> = new Map(); // capability -> guardrail
    private _clarifierLibrary: Map<string, string> = new Map(); // id -> question
    private _clarifierDefinitions: Map<string, ClarifierExcel> = new Map(); // id -> full schema
    private _jobItemRules: Map<string, JobItemRuleExcel> = new Map();
    private _matrixV2Model: MatrixV2Model | null = null;

    private loaded = false;

    private resolveMatrixFilePath(): string {
        const candidates = [
            'DIFM_PRICING_MATRIX_V2-30042026.xlsx',
            'DIFM_COMPLETE_FIXED_MATRIX.xlsx',
            'DIFM_Pilot_Matrix_v2_Layered.xlsx',
            'DIFM_Pilot_Matrix_v1_Baseline.xlsx',
        ];

        for (const filename of candidates) {
            const absolutePath = path.join(process.cwd(), filename);
            if (fs.existsSync(absolutePath)) {
                return absolutePath;
            }
        }

        // Keep first candidate as default path for error reporting.
        return path.join(process.cwd(), candidates[0]);
    }

    private constructor() {
        this.filePath = this.resolveMatrixFilePath();
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

    public get capabilityGuardrails() {
        this.ensureLoaded();
        return this._capabilityGuardrails;
    }

    public get clarifierDefinitions() {
        this.ensureLoaded();
        return this._clarifierDefinitions;
    }

    public get jobItemRules() {
        this.ensureLoaded();
        return this._jobItemRules;
    }

    public isMatrixV2(): boolean {
        this.ensureLoaded();
        return this._matrixV2Model !== null;
    }

    public getMatrixV2Model(): MatrixV2Model | null {
        this.ensureLoaded();
        return this._matrixV2Model;
    }

    public getCapabilityGuardrail(capability: string, ladderHint?: string): CapabilityGuardrailExcel | null {
        this.ensureLoaded();
        const normalizedCapability = String(capability || '').trim().toUpperCase();
        const explicit = this._capabilityGuardrails.get(normalizedCapability);
        if (explicit) return explicit;

        const ladder = String(ladderHint || normalizedCapability || 'HANDYMAN').trim().toUpperCase();
        const tiers = this._pricingTiers.get(ladder) || [];
        if (tiers.length === 0) {
            return null;
        }

        const highest = tiers.reduce((acc, tier) => {
            if (!acc) return tier;
            return tier.max_minutes >= acc.max_minutes ? tier : acc;
        }, tiers[0]);

        return {
            capability: normalizedCapability || ladder,
            max_ladder: highest.tier,
            ladder_max_time: highest.max_minutes,
            overflow_action: 'REVIEW',
        };
    }

    public ensureLoaded() {
        if (!this.loaded) {
            this.load();
        }
    }

    public reload() {
        this.loaded = false;
        this._matrixV2Model = null;
        this.load();
    }

    private populateLegacyCachesFromV2(): void {
        if (!this._matrixV2Model) return;
        this._phraseMappings = [];
        this._jobItemRules.clear();
        this._jobItems.clear();
        this._capabilityGuardrails.clear();
        this._pricingTiers.clear();

        for (const [id, row] of this._matrixV2Model.jobs) {
            const cap = row.category === 'CLEANING' ? 'CLEANING' : 'HANDYMAN';
            this._jobItems.set(id, {
                job_item_id: id,
                display_name: id.replace(/_/g, ' '),
                capability_tag: cap,
                default_time_weight_minutes: row.max_minutes,
                pricing_ladder: 'MATRIX_V2_HANDYMAN',
                clarifier_ids: row.clarifierIds,
                uncertainty_prone: false,
                uncertainty_handling: 'IGNORE',
                risk_buffer_minutes: 0,
                ai_extractable: true,
            });
        }

        const ladder = 'MATRIX_V2_HANDYMAN';
        const handymanTierRows = this._matrixV2Model.handymanTiers.map((t) => ({
            tier: t.tier,
            ladder,
            max_minutes: t.max_minutes,
            price_gbp: t.price_gbp,
        }));
        handymanTierRows.sort((a, b) => a.max_minutes - b.max_minutes);
        this._pricingTiers.set(ladder, handymanTierRows);

        this._clarifierLibrary.clear();
        this._clarifierDefinitions.clear();
        for (const [id, c] of this._matrixV2Model.clarifiers) {
            this._clarifierLibrary.set(id, c.question);
            this._clarifierDefinitions.set(id, {
                clarifier_id: id,
                question: c.question,
                input_type: c.type,
                type: c.type,
                options: [],
            });
        }
    }

    private load() {
        if (this.loaded) return;

        if (!fs.existsSync(this.filePath)) {
            console.warn(`[ExcelSource] File not found: ${this.filePath}. Proceeding with empty data.`);
            this.loaded = true;
            return;
        }

        try {
            console.log(`[ExcelSource] Reading file: ${this.filePath}`);
            const buffer = fs.readFileSync(this.filePath);
            const workbook = XLSX.read(buffer, { type: 'buffer' });

            if (workbook.Sheets['JOB_ITEMS'] && workbook.Sheets['PHRASE_MAPPING']) {
                try {
                    this._matrixV2Model = parseMatrixV2Workbook(workbook);
                    this.populateLegacyCachesFromV2();
                    console.log(
                        `[ExcelSource] MATRIX V2 loaded: ${this._matrixV2Model.jobs.size} jobs, ${this._matrixV2Model.phrases.length} phrase rows`,
                    );
                    this.loaded = true;
                    return;
                } catch (e) {
                    console.error('[ExcelSource] MATRIX V2 parse failed, falling back to legacy sheets if present:', e);
                    this._matrixV2Model = null;
                }
            } else {
                this._matrixV2Model = null;
            }

            // 1. Phrase_Mapping (Legacy/Keep for now)
            const phraseSheet = workbook.Sheets['Phrase_Mapping'];
            if (phraseSheet) {
                const data = XLSX.utils.sheet_to_json(phraseSheet);
                this._phraseMappings = data.map((row: any) => ({
                    pattern_id: row.pattern_id || undefined,
                    phrase: row.phrase || row.example_phrases || '',
                    positive_keywords: (row.positive_keywords || '').split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean),
                    negative_keywords: (row.negative_keywords || '').split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean),
                    canonical_job_item_id: row.canonical_job_item_id || row.normalized_job_item_id || '',
                    priority: row.priority || 0,
                    status: row.status || 'active',
                    auto_match_allowed: String(row.auto_match_allowed || 'Y').toUpperCase() === 'Y',
                    auto_match_min_tokens: row.auto_match_min_tokens || 1,
                    confidence_threshold: row.confidence_threshold || 0
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
                        risk_buffer_minutes: row.risk_buffer_minutes || 0,
                        ai_extractable: !!row.ai_extractable || false
                    });
                });
                // Stability fallback: create diagnostic radiator item if matrix does not include it.
                if (!this._jobItems.has('radiator_diagnosis')) {
                    this._jobItems.set('radiator_diagnosis', {
                        job_item_id: 'radiator_diagnosis',
                        display_name: 'Radiator Diagnosis',
                        capability_tag: 'PLUMBING',
                        default_time_weight_minutes: 45,
                        pricing_ladder: 'PLUMBING',
                        clarifier_ids: [],
                        uncertainty_prone: false,
                        uncertainty_handling: 'IGNORE',
                        risk_buffer_minutes: 0,
                        ai_extractable: true
                    });
                }
                /** Core residential cleaning SKUs — merged if missing from matrix workbook. */
                const synthCleaning: JobItemExcel[] = [
                    {
                        job_item_id: 'home_cleaning_standard',
                        display_name: 'Home cleaning (standard)',
                        capability_tag: 'CLEANING',
                        default_time_weight_minutes: 90,
                        pricing_ladder: 'HANDYMAN',
                        clarifier_ids: [],
                        uncertainty_prone: false,
                        uncertainty_handling: 'IGNORE',
                        risk_buffer_minutes: 0,
                        ai_extractable: true,
                    },
                    {
                        job_item_id: 'home_cleaning_deep',
                        display_name: 'Home cleaning (deep)',
                        capability_tag: 'CLEANING',
                        default_time_weight_minutes: 150,
                        pricing_ladder: 'HANDYMAN',
                        clarifier_ids: [],
                        uncertainty_prone: false,
                        uncertainty_handling: 'IGNORE',
                        risk_buffer_minutes: 0,
                        ai_extractable: true,
                    },
                    {
                        job_item_id: 'bathroom_cleaning',
                        display_name: 'Bathroom cleaning',
                        capability_tag: 'CLEANING',
                        default_time_weight_minutes: 55,
                        pricing_ladder: 'HANDYMAN',
                        clarifier_ids: [],
                        uncertainty_prone: false,
                        uncertainty_handling: 'IGNORE',
                        risk_buffer_minutes: 0,
                        ai_extractable: true,
                    },
                    {
                        job_item_id: 'kitchen_cleaning',
                        display_name: 'Kitchen cleaning',
                        capability_tag: 'CLEANING',
                        default_time_weight_minutes: 55,
                        pricing_ladder: 'HANDYMAN',
                        clarifier_ids: [],
                        uncertainty_prone: false,
                        uncertainty_handling: 'IGNORE',
                        risk_buffer_minutes: 0,
                        ai_extractable: true,
                    },
                ];
                for (const row of synthCleaning) {
                    if (!this._jobItems.has(row.job_item_id)) {
                        this._jobItems.set(row.job_item_id, row);
                    }
                }
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

            // 3b. Capability_Guardrails
            const guardrailSheet = workbook.Sheets['Capability_Guardrails'];
            this._capabilityGuardrails.clear();
            if (guardrailSheet) {
                const data = XLSX.utils.sheet_to_json(guardrailSheet);
                data.forEach((row: any) => {
                    const capability = String(row.capability || '').trim().toUpperCase();
                    if (!capability) return;
                    const maxLadder = String(row.max_ladder || '').trim().toUpperCase();
                    const ladderMaxTime = Number(row.ladder_max_time || 0);
                    const overflowAction = String(row.overflow_action || 'REVIEW').trim().toUpperCase();
                    if (!maxLadder || !Number.isFinite(ladderMaxTime) || ladderMaxTime <= 0) return;

                    this._capabilityGuardrails.set(capability, {
                        capability,
                        max_ladder: maxLadder,
                        ladder_max_time: ladderMaxTime,
                        overflow_action: overflowAction === 'REVIEW' ? 'REVIEW' : 'REVIEW',
                    });
                });
                console.log(`[ExcelSource] Loaded ${this._capabilityGuardrails.size} capability guardrails`);
            } else {
                console.log('[ExcelSource] Capability_Guardrails tab missing. Using pricing-tier-derived overflow limits.');
            }

            // 4. Clarifier_Library
            const clarifierSheet = workbook.Sheets['Clarifier_Library'];
            if (clarifierSheet) {
                const data = XLSX.utils.sheet_to_json(clarifierSheet);
                this._clarifierLibrary.clear();
                this._clarifierDefinitions.clear();
                data.forEach((row: any) => {
                    this._clarifierLibrary.set(row.clarifier_id, row.question);
                    let options: string[] = [];
                    if (row.options_json) {
                        try {
                            const parsed = JSON.parse(row.options_json);
                            if (Array.isArray(parsed)) options = parsed.map((o: any) => String(o));
                        } catch {
                            options = String(row.options_json).split(',').map((s: string) => s.trim()).filter(Boolean);
                        }
                    }
                    this._clarifierDefinitions.set(row.clarifier_id, {
                        clarifier_id: row.clarifier_id,
                        question: row.question,
                        input_type: row.input_type,
                        required_YN: row.required_YN,
                        trigger_keywords: row.trigger_keywords,
                        impacts: row.impacts,
                        notes: row.notes,
                        show_mode: row.show_mode,
                        type: row.type,
                        options_json: row.options_json,
                        options
                    });
                });
                // Required synthetic clarifier for TV concealment if not present in matrix.
                if (!this._clarifierDefinitions.has('CABLE_CONCEALMENT')) {
                    this._clarifierLibrary.set('CABLE_CONCEALMENT', 'Do you want cables concealed?');
                    this._clarifierDefinitions.set('CABLE_CONCEALMENT', {
                        clarifier_id: 'CABLE_CONCEALMENT',
                        question: 'Do you want cables concealed?',
                        input_type: 'boolean',
                        required_YN: 'N',
                        impacts: 'Tier',
                        options: []
                    });
                }
                console.log(`[ExcelSource] Loaded ${this._clarifierLibrary.size} clarifiers`);
            }

            // 5. Job_Item_Rules (New Tab)
            const rulesSheet = workbook.Sheets['Job_Item_Rules'];
            if (rulesSheet) {
                const data = XLSX.utils.sheet_to_json(rulesSheet);
                this._jobItemRules.clear();
                data.forEach((row: any) => {
                    const id = row.canonical_job_item_id || row.job_item_id;
                    if (id) {
                        const rawInclude = (row.include || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);

                        // Expansion: Support common plurals for inclusion keywords
                        const include: string[] = [...new Set(rawInclude.flatMap((kw: string) => {
                            if (kw.endsWith('y')) return [kw, kw.slice(0, -1) + 'ies'];
                            if (kw.endsWith('s') || kw.endsWith('x') || kw.endsWith('ch') || kw.endsWith('sh')) return [kw, kw + 'es'];
                            return [kw, kw + 's'];
                        }) as string[])];

                        this._jobItemRules.set(id, {
                            job_item_id: id,
                            include,
                            optional: (row.optional || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean),
                            exclude: (row.exclude || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)
                        });
                    }
                });
                console.log(`[ExcelSource] Loaded ${this._jobItemRules.size} job item rules (with plural expansion)`);
            } else {
                // v2 layered matrix removed Job_Item_Rules; build deterministic rules from Phrase_Mapping.
                this._jobItemRules.clear();
                this._phraseMappings.forEach((mapping) => {
                    if (!mapping.canonical_job_item_id) return;
                    if (!mapping.auto_match_allowed) return;
                    if (String(mapping.status || 'active').toLowerCase() !== 'active') return;
                    if ((mapping.positive_keywords || []).length < 2) return;

                    const existing = this._jobItemRules.get(mapping.canonical_job_item_id);
                    const include = [...new Set([...(existing?.include || []), ...mapping.positive_keywords])];
                    const exclude = [...new Set([...(existing?.exclude || []), ...mapping.negative_keywords])];

                    this._jobItemRules.set(mapping.canonical_job_item_id, {
                        job_item_id: mapping.canonical_job_item_id,
                        include,
                        optional: [],
                        exclude,
                    });
                });
                console.log(`[ExcelSource] Job_Item_Rules tab missing. Built ${this._jobItemRules.size} fallback rules from Phrase_Mapping`);
            }

            this.loaded = true;
        } catch (error) {
            console.error(`[ExcelSource] Failed to load excel file:`, error);
        }
    }
}

export const excelSource = ExcelSource.getInstance();

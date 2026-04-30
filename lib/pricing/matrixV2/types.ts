export interface MatrixV2PhraseRow {
    phrase: string;
    job_item_id: string;
}

export interface MatrixV2JobRow {
    job_item_id: string;
    category: string;
    base_tier: string;
    min_minutes: number;
    max_minutes: number;
    clarifierIds: string[];
    quantity_threshold: number;
}

export interface MatrixV2HandymanTier {
    tier: string;
    max_minutes: number;
    price_gbp: number;
}

export interface MatrixV2CleaningTier {
    tier: string;
    label: string;
    price_gbp: number;
}

export interface MatrixV2ClarifierRow {
    id: string;
    question: string;
    type: string;
}

export interface MatrixV2Model {
    phrases: MatrixV2PhraseRow[];
    jobs: Map<string, MatrixV2JobRow>;
    handymanTiers: MatrixV2HandymanTier[];
    cleaningTiers: MatrixV2CleaningTier[];
    clarifiers: Map<string, MatrixV2ClarifierRow>;
}

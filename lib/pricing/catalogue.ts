import { prisma } from '../prisma';
import { CatalogueItem } from '@prisma/client';

export type { CatalogueItem };

let cachedCatalogue: CatalogueItem[] | null = null;

// Simple in-memory cache for the server instance
// In serverless, this might reset, which is fine.
export async function getCatalogue(): Promise<CatalogueItem[]> {
    if (cachedCatalogue) return cachedCatalogue;

    cachedCatalogue = await prisma.catalogueItem.findMany();
    return cachedCatalogue;
}

export async function getCatalogueItem(id: string): Promise<CatalogueItem | undefined> {
    const all = await getCatalogue();
    return all.find((i) => i.job_item_id === id);
}

export function getCatalogueItemSync(id: string, allItems: CatalogueItem[]): CatalogueItem | undefined {
    return allItems.find((i) => i.job_item_id === id);
}

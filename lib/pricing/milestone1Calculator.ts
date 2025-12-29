/**
 * Milestone 1: Simple deterministic pricing calculator
 * Handyman-first, rule-based only
 */

import { parseHandymanRequest, ParsedJobItem } from './milestone1Parser';

export interface Milestone1PricingResult {
  totalPrice: number;
  items: Array<{
    itemType: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    description: string;
  }>;
  needsReview: boolean;
}

/**
 * Calculate job price using simple rule-based parsing
 * Always assumes handyman job
 */
export function calculateMilestone1Price(description: string): Milestone1PricingResult {
  const parsed = parseHandymanRequest(description);

  return {
    totalPrice: parsed.totalPrice,
    items: parsed.items.map(item => ({
      itemType: item.taskCode,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      description: item.description
    })),
    needsReview: parsed.needsReview
  };
}


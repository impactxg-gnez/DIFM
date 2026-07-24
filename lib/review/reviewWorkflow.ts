export type ReviewPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type SlaStatus = 'PENDING' | 'BREACHED';

export { REVIEW_QUOTE_ETA as OVERFLOW_REVIEW_ETA, REVIEW_QUOTE_MESSAGE as OVERFLOW_REVIEW_MESSAGE } from '../pricing/bookingCopy';

export function getReviewPriority(overflowDelta: number): ReviewPriority {
  if (overflowDelta <= 20) return 'LOW';
  if (overflowDelta <= 60) return 'MEDIUM';
  return 'HIGH';
}

export function getSlaDeadline(fromDate: Date = new Date()): Date {
  return new Date(fromDate.getTime() + 60 * 60 * 1000);
}

export function getSlaStatus(slaDeadline: Date, now: Date = new Date()): SlaStatus {
  return now.getTime() > slaDeadline.getTime() ? 'BREACHED' : 'PENDING';
}

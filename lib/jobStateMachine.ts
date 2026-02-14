import { prisma } from './prisma';

export const JOB_STATUSES = [
  'REQUESTED',
  'PRICED',
  'BOOKED',
  'WAITING_FOR_DISPATCH',
  'ASSIGNING',
  'ASSIGNED',
  'PREAUTHORISED',
  'ARRIVING',
  'ON_SITE',
  'IN_PROGRESS',
  'SCOPE_MISMATCH',
  'MISMATCH_PENDING',
  'REBOOK_REQUIRED',
  'PARTS_REQUIRED',
  'COMPLETED',
  'ISSUE_REPORTED',
  'ISSUE_RAISED_BY_CUSTOMER',
  'ISSUE_RAISED_BY_PROVIDER',
  'RESOLUTION_PENDING',
  'CAPTURED',
  'PAID_OUT',
  'CLOSED',
  'CANCELLED_FREE',
  'CANCELLED_CHARGED',
  'RESCHEDULE_REQUIRED',
  'FLAGGED_REVIEW',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  REQUESTED: ['PRICED'],
  PRICED: ['BOOKED'],
  BOOKED: ['WAITING_FOR_DISPATCH', 'ASSIGNING'],
  WAITING_FOR_DISPATCH: ['ASSIGNING'],
  ASSIGNING: ['ASSIGNED', 'RESCHEDULE_REQUIRED', 'FLAGGED_REVIEW'],
  ASSIGNED: ['PREAUTHORISED', 'FLAGGED_REVIEW'],
  PREAUTHORISED: ['ARRIVING'],
  ARRIVING: ['ON_SITE', 'ISSUE_RAISED_BY_PROVIDER'],
  ON_SITE: ['IN_PROGRESS', 'COMPLETED', 'MISMATCH_PENDING', 'PARTS_REQUIRED'],
  IN_PROGRESS: ['COMPLETED', 'MISMATCH_PENDING', 'PARTS_REQUIRED', 'ISSUE_RAISED_BY_PROVIDER'],
  MISMATCH_PENDING: ['ASSIGNED', 'ON_SITE', 'IN_PROGRESS', 'REBOOK_REQUIRED'],
  REBOOK_REQUIRED: ['BOOKED', 'WAITING_FOR_DISPATCH'],
  SCOPE_MISMATCH: ['IN_PROGRESS', 'BOOKED', 'MISMATCH_PENDING', 'REBOOK_REQUIRED'],
  PARTS_REQUIRED: ['IN_PROGRESS'],
  COMPLETED: ['CAPTURED', 'ISSUE_REPORTED', 'ISSUE_RAISED_BY_CUSTOMER'],
  ISSUE_REPORTED: ['CLOSED'],
  ISSUE_RAISED_BY_CUSTOMER: ['RESOLUTION_PENDING'],
  ISSUE_RAISED_BY_PROVIDER: ['RESOLUTION_PENDING'],
  RESOLUTION_PENDING: [], // Admin-only resolution
  CAPTURED: ['PAID_OUT'],
  PAID_OUT: ['CLOSED'],
  CLOSED: [],
  CANCELLED_FREE: ['CLOSED'],
  CANCELLED_CHARGED: ['CLOSED'],
  RESCHEDULE_REQUIRED: ['BOOKED', 'WAITING_FOR_DISPATCH', 'CLOSED'],
  FLAGGED_REVIEW: [], // Admin will move it out of this state
};

// Add cancellation transitions to all non-terminal states
const NON_TERMINAL_STATES: JobStatus[] = [
  'REQUESTED', 'PRICED', 'BOOKED', 'WAITING_FOR_DISPATCH', 'ASSIGNING', 'ASSIGNED',
  'PREAUTHORISED', 'ARRIVING', 'ON_SITE', 'IN_PROGRESS', 'SCOPE_MISMATCH', 'MISMATCH_PENDING', 'REBOOK_REQUIRED', 'PARTS_REQUIRED',
  'RESCHEDULE_REQUIRED', 'FLAGGED_REVIEW'
];

NON_TERMINAL_STATES.forEach(state => {
  VALID_TRANSITIONS[state].push('CANCELLED_FREE');
  VALID_TRANSITIONS[state].push('CANCELLED_CHARGED');
});

const STUCK_MINUTES: Partial<Record<JobStatus, number>> = {
  REQUESTED: 30,
  BOOKED: 45,
  ASSIGNED: 60,
  IN_PROGRESS: 180,
  COMPLETED: 120,
};

export function canTransition(from: JobStatus, to: JobStatus) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStates(current: JobStatus) {
  return VALID_TRANSITIONS[current] || [];
}

export function computeStuck(
  status: string,
  statusUpdatedAt?: Date | string | null
): { isStuck: boolean; reason?: string } {
  const currentStatus = status as JobStatus;
  const minutes = STUCK_MINUTES[currentStatus];
  if (!minutes || !statusUpdatedAt) return { isStuck: false };

  const updatedAt = new Date(statusUpdatedAt);
  const diffMinutes = (Date.now() - updatedAt.getTime()) / (1000 * 60);
  if (diffMinutes > minutes) {
    return {
      isStuck: true,
      reason: `${currentStatus} for ${diffMinutes.toFixed(0)}m (limit ${minutes}m)`,
    };
  }
  return { isStuck: false };
}

interface TransitionMeta {
  reason?: string;
  changedById?: string | null;
  changedByRole?: string | null;
}

export async function applyStatusChange(
  jobId: string,
  toStatus: JobStatus,
  meta: TransitionMeta = {}
) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) throw new Error('Job not found');

    const fromStatus = job.status as JobStatus;
    if (!canTransition(fromStatus, toStatus)) {
      throw new Error(`Invalid transition ${fromStatus} -> ${toStatus}`);
    }

    const now = new Date();

    const updatedJob = await tx.job.update({
      where: { id: jobId },
      data: {
        status: toStatus,
        statusUpdatedAt: now,
        acceptedAt: toStatus === 'ASSIGNED' ? now : job.acceptedAt,
      },
    });

    await tx.jobStateChange.create({
      data: {
        jobId,
        fromStatus,
        toStatus,
        reason: meta.reason,
        changedById: meta.changedById || undefined,
        changedByRole: meta.changedByRole || undefined,
      },
    });

    return updatedJob;
  });
}


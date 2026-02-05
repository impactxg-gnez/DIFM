import { prisma } from './prisma';

export const JOB_STATUSES = [
  'REQUESTED',
  'PRICED',
  'BOOKED',
  'ASSIGNING',
  'ASSIGNED',
  'PREAUTHORISED',
  'ARRIVING',
  'IN_PROGRESS',
  'SCOPE_MISMATCH',
  'PARTS_REQUIRED',
  'COMPLETED',
  'ISSUE_REPORTED',
  'CAPTURED',
  'PAID_OUT',
  'CLOSED',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  REQUESTED: ['PRICED'],
  PRICED: ['BOOKED'],
  BOOKED: ['ASSIGNING'],
  ASSIGNING: ['ASSIGNED'],
  ASSIGNED: ['PREAUTHORISED'],
  PREAUTHORISED: ['ARRIVING'],
  ARRIVING: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED', 'SCOPE_MISMATCH', 'PARTS_REQUIRED'],
  SCOPE_MISMATCH: ['IN_PROGRESS', 'BOOKED'], // Can rebook or upgrade
  PARTS_REQUIRED: ['IN_PROGRESS'],
  COMPLETED: ['CAPTURED', 'ISSUE_REPORTED'],
  ISSUE_REPORTED: ['CLOSED'],
  CAPTURED: ['PAID_OUT'],
  PAID_OUT: ['CLOSED'],
  CLOSED: [],
};

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


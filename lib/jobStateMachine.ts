import { prisma } from './prisma';

export const JOB_STATUSES = [
  'CREATED',
  'DISPATCHED',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
  'CANCELLED_FREE',
  'CANCELLED_CHARGED',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  CREATED: ['DISPATCHED'],
  DISPATCHED: ['ACCEPTED', 'CANCELLED_FREE'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED_FREE', 'CANCELLED_CHARGED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED_CHARGED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
  CANCELLED_FREE: [],
  CANCELLED_CHARGED: [],
};

const STUCK_MINUTES: Partial<Record<JobStatus, number>> = {
  CREATED: 30,
  DISPATCHED: 45,
  ACCEPTED: 60,
  IN_PROGRESS: 180,
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
        acceptedAt: toStatus === 'ACCEPTED' ? now : job.acceptedAt,
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


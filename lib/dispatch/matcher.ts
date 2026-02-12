/**
 * Milestone 2: Handyman-first job matching logic
 * Deterministic, rule-based matching
 */

import { prisma } from '../prisma';

export interface JobMatchResult {
  providerId: string;
  providerType: 'HANDYMAN' | 'SPECIALIST';
  matchReason: string;
}

/**
 * Find eligible providers for a job using handyman-first logic
 */
export async function findEligibleProviders(jobId: string): Promise<JobMatchResult[]> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { visits: true } as any
  });

  if (!job) {
    throw new Error('Job not found');
  }

  // V1: Determine required capabilities from visits (union of all visit capability tags)
  const visits = (job as any).visits || [];
  const allRequiredCapabilities = new Set<string>();
  visits.forEach((v: any) => {
    if (v.required_capability_tags_union && Array.isArray(v.required_capability_tags_union)) {
      v.required_capability_tags_union.forEach((cap: string) => allRequiredCapabilities.add(cap));
    }
  });

  // For matching, use the primary capability from the first visit or job.requiredCapability
  const primaryCapability = Array.from(allRequiredCapabilities)[0] || job.requiredCapability;

  // Only dispatch to ACTIVE providers
  const activeProviders = await prisma.user.findMany({
    where: {
      role: 'PROVIDER',
      providerStatus: 'ACTIVE',
      isOnline: true, // Only online providers
    }
  });

  const matches: JobMatchResult[] = [];

  // Step 1: Try to match with Handymen first
  if (job.category !== 'CLEANING') {
    const handymen = activeProviders.filter(p => p.providerType === 'HANDYMAN');
    for (const handyman of handymen) {
      const handymanCategories = handyman.categories?.split(',').filter(Boolean) || [];
      const handymanCapabilities = handyman.capabilities?.split(',').filter(Boolean) || [];

      let canHandle = true;
      let matchReason = 'Handyman match';

      if (primaryCapability) {
        if (!handymanCapabilities.includes(primaryCapability)) {
          canHandle = false;
        } else {
          matchReason = `Handyman with ${primaryCapability} capability`;
        }
      }

      if (job.category && job.category !== 'HANDYMAN') {
        if (!handymanCategories.includes(job.category)) {
          if (primaryCapability && !handymanCapabilities.includes(primaryCapability)) {
            canHandle = false;
          } else if (!primaryCapability) {
            canHandle = true;
            matchReason = `Handyman - general ${job.category} job`;
          }
        }
      }

      if (job.category === 'HANDYMAN') {
        canHandle = true;
        matchReason = 'Handyman - general job';
      }

      if (canHandle) {
        matches.push({
          providerId: handyman.id,
          providerType: 'HANDYMAN',
          matchReason
        });
      }
    }
  }

  // Step 2: Escalation to specialists
  const specialists = activeProviders.filter(p => p.providerType === 'SPECIALIST');
  for (const specialist of specialists) {
    const specialistCategories = specialist.categories?.split(',').filter(Boolean) || [];
    const specialistCapabilities = specialist.capabilities?.split(',').filter(Boolean) || [];

    if (specialistCategories.includes('CLEANING')) {
      if (job.category === 'CLEANING') {
        if (primaryCapability && primaryCapability.startsWith('C-')) {
          if (specialistCapabilities.includes(primaryCapability)) {
            matches.push({
              providerId: specialist.id,
              providerType: 'SPECIALIST',
              matchReason: `Cleaner with ${primaryCapability} capability`
            });
          }
        } else {
          matches.push({
            providerId: specialist.id,
            providerType: 'SPECIALIST',
            matchReason: 'Cleaner - general cleaning job'
          });
        }
      }
    } else {
      if (job.category && specialistCategories.includes(job.category)) {
        matches.push({
          providerId: specialist.id,
          providerType: 'SPECIALIST',
          matchReason: `Specialist - ${job.category}`
        });
      }
    }
  }

  // Deterministic sort: Handymen first (they are already first in our loops, but let's be explicit)
  // Then by rating (placeholder) or ID for consistency
  return matches.sort((a, b) => {
    if (a.providerType === 'HANDYMAN' && b.providerType !== 'HANDYMAN') return -1;
    if (a.providerType !== 'HANDYMAN' && b.providerType === 'HANDYMAN') return 1;
    return a.providerId.localeCompare(b.providerId);
  });
}

/**
 * Sequential Dispatch: Move to the next provider in the queue
 */
export async function advanceSequentialDispatch(jobId: string): Promise<string | null> {
  const matches = await findEligibleProviders(jobId);

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({ where: { id: jobId } });
    if (!job) return null;

    if (job.status !== 'ASSIGNING') return null;

    if (matches.length === 0) {
      console.warn(`[Dispatch] No matching providers for job ${jobId}. Failing dispatch.`);
      await tx.job.update({
        where: { id: jobId },
        data: { status: 'RESCHEDULE_REQUIRED', statusUpdatedAt: new Date() }
      });
      return null;
    }

    const triedIds = job.triedProviderIds ? job.triedProviderIds.split(',').filter(Boolean) : [];

    // Find the next provider who hasn't been tried yet
    const nextMatch = matches.find(m => !triedIds.includes(m.providerId));

    if (!nextMatch) {
      console.log(`[Dispatch] All matching providers (${triedIds.length}) have been tried for job ${jobId}.`);
      await tx.job.update({
        where: { id: jobId },
        data: { status: 'RESCHEDULE_REQUIRED', statusUpdatedAt: new Date() }
      });
      return null;
    }

    const now = new Date();
    const updatedTriedIds = [...triedIds, nextMatch.providerId].join(',');

    await tx.job.update({
      where: { id: jobId },
      data: {
        offeredToId: nextMatch.providerId,
        offeredAt: now,
        triedProviderIds: updatedTriedIds,
        statusUpdatedAt: now // Refresh timestamp for 10s countdown
      }
    });

    console.log(`[Dispatch] Sequential offer sent to ${nextMatch.providerId} for job ${jobId} (Attempt ${triedIds.length + 1})`);
    return nextMatch.providerId;
  });
}

/**
 * Trigger or Refresh dispatch for a job
 */
export async function dispatchJob(jobId: string): Promise<string | null> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return null;

  // If already assigning with an active offer, don't restart unless requested
  if (job.status === 'ASSIGNING' && job.offeredToId && job.offeredAt) {
    const offerAge = (Date.now() - new Date(job.offeredAt).getTime()) / 1000;
    if (offerAge < 10) {
      return job.offeredToId; // Offer still valid
    }
  }

  // Advance to next or first provider
  return advanceSequentialDispatch(jobId);
}

/**
 * Milestone 2: Handyman-first job matching logic
 * Deterministic, rule-based matching
 */

import { prisma } from '../prisma';

export interface JobMatchResult {
  providerId: string;
  providerType: 'HANDYMAN' | 'SPECIALIST';
  matchReason: string;
  distance?: number;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
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
        let distance: number | undefined;
        if (job.latitude && job.longitude && handyman.latitude && handyman.longitude) {
          distance = calculateDistance(job.latitude, job.longitude, handyman.latitude, handyman.longitude);
        }

        matches.push({
          providerId: handyman.id,
          providerType: 'HANDYMAN',
          matchReason,
          distance
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
        let isMatch = false;
        let matchReason = 'Cleaner - general cleaning job';

        if (primaryCapability && primaryCapability.startsWith('C-')) {
          if (specialistCapabilities.includes(primaryCapability)) {
            isMatch = true;
            matchReason = `Cleaner with ${primaryCapability} capability`;
          }
        } else {
          isMatch = true;
        }

        if (isMatch) {
          let distance: number | undefined;
          if (job.latitude && job.longitude && specialist.latitude && specialist.longitude) {
            distance = calculateDistance(job.latitude, job.longitude, specialist.latitude, specialist.longitude);
          }
          matches.push({
            providerId: specialist.id,
            providerType: 'SPECIALIST',
            matchReason,
            distance
          });
        }
      }
    } else {
      if (job.category && specialistCategories.includes(job.category)) {
        let distance: number | undefined;
        if (job.latitude && job.longitude && specialist.latitude && specialist.longitude) {
          distance = calculateDistance(job.latitude, job.longitude, specialist.latitude, specialist.longitude);
        }
        matches.push({
          providerId: specialist.id,
          providerType: 'SPECIALIST',
          matchReason: `Specialist - ${job.category}`,
          distance
        });
      }
    }
  }

  // Rolling Sort: Closest first
  return matches.sort((a, b) => {
    // If distance is unknown, move to end
    if (a.distance === undefined) return 1;
    if (b.distance === undefined) return -1;
    return a.distance - b.distance;
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

    const offeredIds = (job as any).offeredToIds || [];
    const declinedIds = (job as any).declinedProviderIds || [];
    const flaggedById = job.flaggedById;

    // Find the next provider who hasn't been offered yet AND hasn't declined AND hasn't flagged
    const nextMatch = matches.find(m =>
      !offeredIds.includes(m.providerId) &&
      !declinedIds.includes(m.providerId) &&
      m.providerId !== flaggedById
    );

    if (!nextMatch) {
      if (offeredIds.length >= matches.length) {
        console.log(`[Dispatch] All eligible providers (${matches.length}) have been offered job ${jobId}.`);
      }
      return null;
    }

    const now = new Date();
    const updatedOfferedIds = [...offeredIds, nextMatch.providerId];

    await tx.job.update({
      where: { id: jobId },
      data: {
        offeredToId: nextMatch.providerId,
        offeredToIds: updatedOfferedIds,
        offeredAt: now,
        statusUpdatedAt: now
      } as any
    });

    console.log(`[Dispatch] Rolling offer expanded to ${nextMatch.providerId} for job ${jobId}. Total recipients: ${updatedOfferedIds.length}`);
    return nextMatch.providerId;
  });
}

/**
 * Trigger or Refresh dispatch for a job
 */
export async function dispatchJob(jobId: string): Promise<string | null> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return null;

  // Rolling mode: If already assigning, check if 10s passed since LAST offer
  if (job.status === 'ASSIGNING' && job.offeredAt) {
    const offerAge = (Date.now() - new Date(job.offeredAt).getTime()) / 1000;
    if (offerAge < 10) {
      return job.offeredToId; // Still within the 10s window of the LAST offer
    }
  }

  // Expand to next provider
  return advanceSequentialDispatch(jobId);
}

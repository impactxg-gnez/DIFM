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
    include: { items: true }
  });

  if (!job) {
    throw new Error('Job not found');
  }

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
  // BUT: Skip handymen for CLEANING jobs (cleaners only)
  if (job.category !== 'CLEANING') {
    const handymen = activeProviders.filter(p => p.providerType === 'HANDYMAN');

    for (const handyman of handymen) {
      const handymanCategories = handyman.categories?.split(',').filter(Boolean) || [];
      const handymanCapabilities = handyman.capabilities?.split(',').filter(Boolean) || [];

      // Check if handyman can handle all job items
      let canHandle = true;
      let matchReason = 'Handyman match';

      // If job requires specific capability, check if handyman has it
      if (job.requiredCapability) {
        if (!handymanCapabilities.includes(job.requiredCapability)) {
          canHandle = false;
        } else {
          matchReason = `Handyman with ${job.requiredCapability} capability`;
        }
      }

      // Check category match
      if (job.category && !handymanCategories.includes(job.category) && job.category !== 'HANDYMAN') {
        // If job is not HANDYMAN category, handyman needs to have that category or capability
        if (!handymanCategories.includes(job.category) && !job.requiredCapability) {
          canHandle = false;
        }
      }

      // If job is HANDYMAN category, any handyman can potentially handle it
      if (job.category === 'HANDYMAN' && !job.requiredCapability) {
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

  // Step 2: If no handyman matches, escalate to specialists
  if (matches.length === 0) {
    const specialists = activeProviders.filter(p => p.providerType === 'SPECIALIST');

    for (const specialist of specialists) {
      const specialistCategories = specialist.categories?.split(',') || [];
      const specialistCapabilities = specialist.capabilities?.split(',').filter(Boolean) || [];

      // Cleaners: Only match CLEANING category jobs, never repair/installation
      if (specialistCategories.includes('CLEANING')) {
        // Cleaner providers only see CLEANING category jobs
        if (job.category === 'CLEANING') {
          // Check if job requires specific cleaning capability
          if (job.requiredCapability) {
            // If job requires a capability (e.g., C-DEEP-BATHROOM), check if cleaner has it
            if (specialistCapabilities.includes(job.requiredCapability)) {
              matches.push({
                providerId: specialist.id,
                providerType: 'SPECIALIST',
                matchReason: `Cleaner with ${job.requiredCapability} capability`
              });
            }
          } else {
            // General cleaning job - any cleaner can handle it
            matches.push({
              providerId: specialist.id,
              providerType: 'SPECIALIST',
              matchReason: 'Cleaner - general cleaning job'
            });
          }
        }
        // Cleaners never match non-cleaning jobs (HANDYMAN, PLUMBER, ELECTRICIAN, etc.)
      } else {
        // Other specialists (plumber, electrician, etc.) match their category
        if (job.category && specialistCategories.includes(job.category)) {
          matches.push({
            providerId: specialist.id,
            providerType: 'SPECIALIST',
            matchReason: `Specialist - ${job.category}`
          });
        }
      }
    }
  }

  return matches;
}

/**
 * Step 5: Sequential Provider Offers (10s window)
 * Moves from broadcast to one-by-one offering.
 */
export async function dispatchJob(jobId: string): Promise<string | null> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return null;

  const matches = await findEligibleProviders(jobId);
  const jAny = job as any;
  if (matches.length === 0) {
    // Reset if no matches left or none found
    if (jAny.offeredToId) {
      await prisma.job.update({
        where: { id: jobId },
        data: { offeredToId: null, offeredAt: null }
      });
    }
    return null;
  }

  const now = new Date();
  const OFFER_TIMEOUT_MS = 10000; // 10 seconds per spec

  // 1. If currently offered and within 10s, stay
  if (jAny.offeredToId && jAny.offeredAt) {
    const elapsed = now.getTime() - new Date(jAny.offeredAt).getTime();
    if (elapsed < OFFER_TIMEOUT_MS) {
      return jAny.offeredToId;
    }
  }

  // 2. Either no offer yet, or current offer expired. Find next.
  let nextIndex = 0;
  if (job.offeredToId) {
    const currentIndex = matches.findIndex(m => m.providerId === job.offeredToId);
    nextIndex = (currentIndex + 1) % matches.length;
  }

  const nextMatch = matches[nextIndex];

  await prisma.job.update({
    where: { id: jobId },
    data: {
      offeredToId: nextMatch.providerId,
      offeredAt: now,
    }
  });

  return nextMatch.providerId;
}

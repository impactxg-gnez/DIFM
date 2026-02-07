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
  
  console.log(`[Dispatch] Found ${activeProviders.length} active online providers for job ${jobId}`);
  if (activeProviders.length === 0) {
    console.warn(`[Dispatch] No active online providers available`);
  }

  const matches: JobMatchResult[] = [];

  // Step 1: Try to match with Handymen first
  // BUT: Skip handymen for CLEANING jobs (cleaners only)
  if (job.category !== 'CLEANING') {
    const handymen = activeProviders.filter(p => p.providerType === 'HANDYMAN');
    console.log(`[Dispatch] Found ${handymen.length} handymen for job ${jobId} (category: ${job.category}, primaryCapability: ${primaryCapability})`);

    for (const handyman of handymen) {
      const handymanCategories = handyman.categories?.split(',').filter(Boolean) || [];
      const handymanCapabilities = handyman.capabilities?.split(',').filter(Boolean) || [];

      console.log(`[Dispatch] Checking handyman ${handyman.id}: categories=[${handymanCategories.join(',')}], capabilities=[${handymanCapabilities.join(',')}]`);

      // Check if handyman can handle all job items
      let canHandle = true;
      let matchReason = 'Handyman match';

      // If job requires specific capability, check if handyman has it
      if (primaryCapability) {
        if (!handymanCapabilities.includes(primaryCapability)) {
          console.log(`[Dispatch] Handyman ${handyman.id} missing required capability: ${primaryCapability}`);
          canHandle = false;
        } else {
          matchReason = `Handyman with ${primaryCapability} capability`;
        }
      }

      // Check category match - be more lenient
      if (job.category && job.category !== 'HANDYMAN') {
        // If job is not HANDYMAN category, handyman needs to have that category OR the capability
        if (!handymanCategories.includes(job.category)) {
          // If no capability match either, then can't handle
          if (primaryCapability && !handymanCapabilities.includes(primaryCapability)) {
            console.log(`[Dispatch] Handyman ${handyman.id} doesn't have category ${job.category} or capability ${primaryCapability}`);
            canHandle = false;
          } else if (!primaryCapability) {
            // If no specific capability required, allow if handyman has general capabilities
            console.log(`[Dispatch] Handyman ${handyman.id} doesn't have category ${job.category}, but no specific capability required - allowing`);
            canHandle = true;
            matchReason = `Handyman - general ${job.category} job`;
          }
        }
      }

      // If job is HANDYMAN category, any handyman can potentially handle it
      if (job.category === 'HANDYMAN') {
        canHandle = true;
        matchReason = 'Handyman - general job';
      }

      if (canHandle) {
        console.log(`[Dispatch] Handyman ${handyman.id} matched: ${matchReason}`);
        matches.push({
          providerId: handyman.id,
          providerType: 'HANDYMAN',
          matchReason
        });
      } else {
        console.log(`[Dispatch] Handyman ${handyman.id} rejected`);
      }
    }
  }

  // Step 2: If no handyman matches, escalate to specialists
  if (matches.length === 0) {
    const specialists = activeProviders.filter(p => p.providerType === 'SPECIALIST');
    console.log(`[Dispatch] Found ${specialists.length} specialists for job ${jobId} (category: ${job.category})`);

    for (const specialist of specialists) {
      const specialistCategories = specialist.categories?.split(',').filter(Boolean) || [];
      const specialistCapabilities = specialist.capabilities?.split(',').filter(Boolean) || [];
      console.log(`[Dispatch] Checking specialist ${specialist.id}: categories=[${specialistCategories.join(',')}], capabilities=[${specialistCapabilities.join(',')}]`);

      // Cleaners: Only match CLEANING category jobs, never repair/installation
      if (specialistCategories.includes('CLEANING')) {
        // Cleaner providers only see CLEANING category jobs
        if (job.category === 'CLEANING') {
          // Check if job requires specific cleaning capability from visits
          if (primaryCapability && primaryCapability.startsWith('C-')) {
            // If job requires a capability (e.g., C-DEEP-BATHROOM), check if cleaner has it
            if (specialistCapabilities.includes(primaryCapability)) {
              console.log(`[Dispatch] Specialist ${specialist.id} matched: Cleaner with ${primaryCapability} capability`);
              matches.push({
                providerId: specialist.id,
                providerType: 'SPECIALIST',
                matchReason: `Cleaner with ${primaryCapability} capability`
              });
            } else {
              console.log(`[Dispatch] Specialist ${specialist.id} (cleaner) missing required capability: ${primaryCapability}`);
            }
          } else {
            // General cleaning job - any cleaner can handle it
            console.log(`[Dispatch] Specialist ${specialist.id} matched: Cleaner - general cleaning job`);
            matches.push({
              providerId: specialist.id,
              providerType: 'SPECIALIST',
              matchReason: 'Cleaner - general cleaning job'
            });
          }
        } else {
          console.log(`[Dispatch] Specialist ${specialist.id} (cleaner) cannot handle non-cleaning job: ${job.category}`);
        }
        // Cleaners never match non-cleaning jobs (HANDYMAN, PLUMBER, ELECTRICIAN, etc.)
      } else {
        // Other specialists (plumber, electrician, etc.) match their category
        if (job.category && specialistCategories.includes(job.category)) {
          console.log(`[Dispatch] Specialist ${specialist.id} matched: Specialist - ${job.category}`);
          matches.push({
            providerId: specialist.id,
            providerType: 'SPECIALIST',
            matchReason: `Specialist - ${job.category}`
          });
        } else {
          console.log(`[Dispatch] Specialist ${specialist.id} (categories: ${specialistCategories.join(',')}) does not match job category: ${job.category}`);
        }
      }
    }
  }

  console.log(`[Dispatch] Total matches for job ${jobId}: ${matches.length}`);
  matches.forEach(m => console.log(`  - Provider ${m.providerId}: ${m.matchReason}`));
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
  console.log(`[Dispatch] Job ${jobId} (category: ${job.category}, requiredCapability: ${job.requiredCapability}) found ${matches.length} eligible providers`);
  if (matches.length === 0) {
    console.warn(`[Dispatch] No matches for job ${jobId} - category: ${job.category}, requiredCapability: ${job.requiredCapability}`);
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

  // 1. If currently offered and within 10s, stay (don't move to next provider)
  if (jAny.offeredToId && jAny.offeredAt) {
    const elapsed = now.getTime() - new Date(jAny.offeredAt).getTime();
    if (elapsed < OFFER_TIMEOUT_MS) {
      console.log(`[Dispatch] Job ${jobId} still offered to provider ${jAny.offeredToId}, ${Math.round((OFFER_TIMEOUT_MS - elapsed) / 1000)}s remaining`);
      return jAny.offeredToId;
    } else {
      console.log(`[Dispatch] Job ${jobId} offer to provider ${jAny.offeredToId} expired (${Math.round(elapsed / 1000)}s elapsed), moving to next provider`);
    }
  }

  // 2. Either no offer yet, or current offer expired. Find next.
  let nextIndex = 0;
  if (job.offeredToId) {
    const currentIndex = matches.findIndex(m => m.providerId === job.offeredToId);
    if (currentIndex === -1) {
      // Current provider is no longer in matches (maybe went offline), start from beginning
      nextIndex = 0;
    } else {
      nextIndex = (currentIndex + 1) % matches.length;
    }
  }

  const nextMatch = matches[nextIndex];
  console.log(`[Dispatch] Offering job ${jobId} to provider ${nextMatch.providerId} (${nextMatch.matchReason})`);

  // Use updateMany to ensure we only update if job is still in ASSIGNING status (prevent race conditions)
  const updateResult = await prisma.job.updateMany({
    where: { 
      id: jobId,
      status: 'ASSIGNING' // Only update if still in ASSIGNING status
    },
    data: {
      offeredToId: nextMatch.providerId,
      offeredAt: now,
    }
  });

  if (updateResult.count === 0) {
    console.warn(`[Dispatch] Job ${jobId} is no longer in ASSIGNING status, cannot update offer`);
    return null;
  }

  console.log(`[Dispatch] Job ${jobId} updated - offeredToId: ${nextMatch.providerId}, offeredAt: ${now.toISOString()}`);

  return nextMatch.providerId;
}

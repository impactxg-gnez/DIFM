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

  // Step 2: If no handyman matches, escalate to specialists
  if (matches.length === 0) {
    const specialists = activeProviders.filter(p => p.providerType === 'SPECIALIST');
    
    for (const specialist of specialists) {
      const specialistCategories = specialist.categories?.split(',').filter(Boolean) || [];

      // Specialist must have the job's category
      if (job.category && specialistCategories.includes(job.category)) {
        matches.push({
          providerId: specialist.id,
          providerType: 'SPECIALIST',
          matchReason: `Specialist - ${job.category}`
        });
      }
    }
  }

  return matches;
}

/**
 * Dispatch job to eligible providers
 * Returns list of provider IDs the job was dispatched to
 */
export async function dispatchJob(jobId: string): Promise<string[]> {
  const matches = await findEligibleProviders(jobId);
  
  if (matches.length === 0) {
    // No eligible providers - job stays in DISPATCHED state
    // Could implement escalation logic here (expand radius, etc.)
    return [];
  }

  // For Milestone 2: Dispatch to all eligible providers
  // First-accept locking happens at acceptance time
  // In a real system, you might dispatch to a smaller batch first
  
  return matches.map(m => m.providerId);
}


const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedPricingRules() {
  console.log('Seeding pricing rules...');

  // Handyman pricing rules
  const handymanRules = [
    { itemType: 'MOUNT_TV', basePrice: 45, unit: 'ITEM', description: 'TV mounting' },
    { itemType: 'SHELF', basePrice: 25, unit: 'ITEM', description: 'Shelf installation' },
    { itemType: 'PICTURE_HANG', basePrice: 15, unit: 'ITEM', description: 'Picture/mirror hanging' },
    { itemType: 'DOOR_FIX', basePrice: 40, unit: 'ITEM', description: 'Door repair/adjustment' },
    { itemType: 'FURNITURE_ASSEMBLY', basePrice: 50, unit: 'ITEM', description: 'Furniture assembly' },
    { itemType: 'GENERAL_HOUR', basePrice: 35, unit: 'HOUR', description: 'General handyman work' },
    { itemType: 'CURTAIN_RAIL', basePrice: 30, unit: 'ITEM', description: 'Curtain rail installation' },
    { itemType: 'LOCK_CHANGE', basePrice: 55, unit: 'ITEM', description: 'Lock replacement' },
    { itemType: 'SMALL_PLUMBING', basePrice: 45, unit: 'ITEM', description: 'Minor leak/tap fixes' },
    { itemType: 'SMALL_ELECTRICAL', basePrice: 45, unit: 'ITEM', description: 'Minor electrical fixes' },
  ];

  for (const rule of handymanRules) {
    await prisma.pricingRule.upsert({
      where: { 
        id: `handyman-${rule.itemType.toLowerCase()}` 
      },
      update: {},
      create: {
        id: `handyman-${rule.itemType.toLowerCase()}`,
        category: 'HANDYMAN',
        itemType: rule.itemType,
        basePrice: rule.basePrice,
        unit: rule.unit,
        isActive: true
      }
    });
    console.log(`✓ Created pricing rule: HANDYMAN - ${rule.itemType} (£${rule.basePrice})`);
  }

  // Electrician pricing rules
  const electricianRules = [
    { itemType: 'OUTLET_INSTALL', basePrice: 40, unit: 'ITEM' },
    { itemType: 'LIGHT_FIXTURE', basePrice: 45, unit: 'ITEM' },
    { itemType: 'GENERAL_HOUR', basePrice: 40, unit: 'HOUR' },
  ];

  for (const rule of electricianRules) {
    await prisma.pricingRule.upsert({
      where: { 
        id: `electrician-${rule.itemType.toLowerCase()}` 
      },
      update: {},
      create: {
        id: `electrician-${rule.itemType.toLowerCase()}`,
        category: 'ELECTRICIAN',
        itemType: rule.itemType,
        basePrice: rule.basePrice,
        unit: rule.unit,
        isActive: true
      }
    });
    console.log(`✓ Created pricing rule: ELECTRICIAN - ${rule.itemType} (£${rule.basePrice})`);
  }

  // Plumber pricing rules
  const plumberRules = [
    { itemType: 'LEAK_FIX', basePrice: 50, unit: 'ITEM' },
    { itemType: 'DRAIN_UNBLOCK', basePrice: 60, unit: 'ITEM' },
    { itemType: 'TAP_INSTALL', basePrice: 45, unit: 'ITEM' },
    { itemType: 'GENERAL_HOUR', basePrice: 45, unit: 'HOUR' },
  ];

  for (const rule of plumberRules) {
    await prisma.pricingRule.upsert({
      where: { 
        id: `plumber-${rule.itemType.toLowerCase()}` 
      },
      update: {},
      create: {
        id: `plumber-${rule.itemType.toLowerCase()}`,
        category: 'PLUMBER',
        itemType: rule.itemType,
        basePrice: rule.basePrice,
        unit: rule.unit,
        isActive: true
      }
    });
    console.log(`✓ Created pricing rule: PLUMBER - ${rule.itemType} (£${rule.basePrice})`);
  }

  console.log('\n✅ Pricing rules seeded successfully!');
}

seedPricingRules()
  .catch((e) => {
    console.error('Error seeding pricing rules:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

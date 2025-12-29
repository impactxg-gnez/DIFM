import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

/**
 * Seed pricing rules from the pricing matrix
 */
export async function POST() {
    try {
        const cookieStore = await cookies();
        const role = cookieStore.get('userRole')?.value;
        if (role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Handyman pricing rules
        const handymanRules = [
            { itemType: 'MOUNT_TV', basePrice: 45, unit: 'ITEM' },
            { itemType: 'SHELF', basePrice: 25, unit: 'ITEM' },
            { itemType: 'PICTURE_HANG', basePrice: 15, unit: 'ITEM' },
            { itemType: 'DOOR_FIX', basePrice: 40, unit: 'ITEM' },
            { itemType: 'FURNITURE_ASSEMBLY', basePrice: 50, unit: 'ITEM' },
            { itemType: 'GENERAL_HOUR', basePrice: 35, unit: 'HOUR' },
            { itemType: 'CURTAIN_RAIL', basePrice: 30, unit: 'ITEM' },
            { itemType: 'LOCK_CHANGE', basePrice: 55, unit: 'ITEM' },
            { itemType: 'SMALL_PLUMBING', basePrice: 45, unit: 'ITEM' },
            { itemType: 'SMALL_ELECTRICAL', basePrice: 45, unit: 'ITEM' },
        ];

        for (const rule of handymanRules) {
            // Check if rule exists
            const existing = await prisma.pricingRule.findFirst({
                where: {
                    category: 'HANDYMAN',
                    itemType: rule.itemType
                }
            });

            if (existing) {
                await prisma.pricingRule.update({
                    where: { id: existing.id },
                    data: {
                        basePrice: rule.basePrice,
                        unit: rule.unit,
                    }
                });
            } else {
                await prisma.pricingRule.create({
                    data: {
                        category: 'HANDYMAN',
                        itemType: rule.itemType,
                        basePrice: rule.basePrice,
                        unit: rule.unit,
                        isActive: true
                    }
                });
            }
        }

        // Electrician pricing rules
        const electricianRules = [
            { itemType: 'OUTLET_INSTALL', basePrice: 40, unit: 'ITEM' },
            { itemType: 'LIGHT_FIXTURE', basePrice: 45, unit: 'ITEM' },
            { itemType: 'GENERAL_HOUR', basePrice: 40, unit: 'HOUR' },
        ];

        for (const rule of electricianRules) {
            const existing = await prisma.pricingRule.findFirst({
                where: {
                    category: 'ELECTRICIAN',
                    itemType: rule.itemType
                }
            });

            if (existing) {
                await prisma.pricingRule.update({
                    where: { id: existing.id },
                    data: {
                        basePrice: rule.basePrice,
                        unit: rule.unit,
                    }
                });
            } else {
                await prisma.pricingRule.create({
                    data: {
                        category: 'ELECTRICIAN',
                        itemType: rule.itemType,
                        basePrice: rule.basePrice,
                        unit: rule.unit,
                        isActive: true
                    }
                });
            }
        }

        // Plumber pricing rules
        const plumberRules = [
            { itemType: 'LEAK_FIX', basePrice: 50, unit: 'ITEM' },
            { itemType: 'DRAIN_UNBLOCK', basePrice: 60, unit: 'ITEM' },
            { itemType: 'TAP_INSTALL', basePrice: 45, unit: 'ITEM' },
            { itemType: 'GENERAL_HOUR', basePrice: 45, unit: 'HOUR' },
        ];

        for (const rule of plumberRules) {
            const existing = await prisma.pricingRule.findFirst({
                where: {
                    category: 'PLUMBER',
                    itemType: rule.itemType
                }
            });

            if (existing) {
                await prisma.pricingRule.update({
                    where: { id: existing.id },
                    data: {
                        basePrice: rule.basePrice,
                        unit: rule.unit,
                    }
                });
            } else {
                await prisma.pricingRule.create({
                    data: {
                        category: 'PLUMBER',
                        itemType: rule.itemType,
                        basePrice: rule.basePrice,
                        unit: rule.unit,
                        isActive: true
                    }
                });
            }
        }

        return NextResponse.json({ success: true, message: 'Pricing rules seeded successfully' });
    } catch (error: any) {
        console.error('Seed pricing rules error', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}


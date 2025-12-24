
import { SERVICE_CATEGORIES, ServiceCategory } from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Briefcase, Wrench, Zap, Paintbrush, Bug, Monitor, Hammer } from 'lucide-react';

const ICONS = {
    [SERVICE_CATEGORIES.HANDYMAN]: Hammer,
    [SERVICE_CATEGORIES.CLEANING]: Briefcase,
    [SERVICE_CATEGORIES.PEST_CONTROL]: Bug,
    [SERVICE_CATEGORIES.ELECTRICIAN]: Zap,
    [SERVICE_CATEGORIES.PLUMBER]: Wrench,
    [SERVICE_CATEGORIES.CARPENTER]: Hammer,
    [SERVICE_CATEGORIES.PAINTER]: Paintbrush,
    [SERVICE_CATEGORIES.PC_REPAIR]: Monitor
};

interface ServiceSelectionProps {
    onSelect: (category: ServiceCategory) => void;
}

export function ServiceSelection({ onSelect }: ServiceSelectionProps) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(Object.keys(SERVICE_CATEGORIES) as ServiceCategory[]).map((key) => {
                const label = SERVICE_CATEGORIES[key];
                const Icon = ICONS[label] || Briefcase;

                return (
                    <Card
                        key={key}
                        className="p-6 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:shadow-lg transition-all"
                        onClick={() => onSelect(key)}
                    >
                        <Icon className="w-10 h-10 mb-3 text-blue-600" />
                        <span className="font-semibold text-center">{label}</span>
                    </Card>
                );
            })}
        </div>
    );
}

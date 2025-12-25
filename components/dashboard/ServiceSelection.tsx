
import { SERVICE_CATEGORIES, ServiceCategory, CATEGORY_META } from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
    Hammer, 
    Zap, 
    Droplets, 
    Shovel, 
    Sparkles, 
    Paintbrush, 
    Bug, 
    Monitor,
    ChevronRight,
    Star
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Map icons to categories
const ICONS: Record<string, any> = {
    HANDYMAN: Hammer,
    ELECTRICIAN: Zap,
    PLUMBER: Droplets,
    CARPENTER: Hammer,
    CLEANING: Sparkles,
    PAINTER: Paintbrush,
    PEST_CONTROL: Bug,
    PC_REPAIR: Monitor
};

interface ServiceSelectionProps {
    onSelect: (category: ServiceCategory) => void;
}

export function ServiceSelection({ onSelect }: ServiceSelectionProps) {
    const categories = Object.keys(SERVICE_CATEGORIES) as ServiceCategory[];
    const featuredCategory = categories.find(c => CATEGORY_META[c].featured);
    const otherCategories = categories.filter(c => !CATEGORY_META[c].featured);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Featured Section */}
            {featuredCategory && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1">
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500">Recommended for you</h2>
                    </div>
                    <Card
                        className="relative group overflow-hidden cursor-pointer border-2 border-blue-100 hover:border-blue-500 hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-white to-blue-50/30"
                        onClick={() => onSelect(featuredCategory)}
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Hammer className="w-32 h-32 -rotate-12" />
                        </div>
                        
                        <div className="p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200 group-hover:scale-110 transition-transform duration-500">
                                    <Hammer className="w-8 h-8" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                                            {SERVICE_CATEGORIES[featuredCategory]}
                                        </h3>
                                        <Badge className="bg-amber-100 text-amber-700 border-none hover:bg-amber-100 font-bold px-2 py-0">
                                            POPULAR
                                        </Badge>
                                    </div>
                                    <p className="text-gray-600 text-lg font-medium">
                                        {CATEGORY_META[featuredCategory].tagline}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-bold text-blue-600 bg-blue-50 px-4 py-2 rounded-full">
                                    Trusted by 5,000+ Londoneers
                                </span>
                                <div className="hidden md:flex w-12 h-12 rounded-full border border-gray-100 items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                                    <ChevronRight className="w-6 h-6" />
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Grid Section */}
            <div className="space-y-4">
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 px-1">All Services</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {otherCategories.map((key) => {
                        const label = SERVICE_CATEGORIES[key];
                        const meta = CATEGORY_META[key];
                        const Icon = ICONS[key] || Sparkles;

                        return (
                            <Card
                                key={key}
                                className="group p-6 flex items-center gap-4 cursor-pointer hover:border-gray-300 hover:shadow-md transition-all duration-300 active:scale-[0.98]"
                                onClick={() => onSelect(key)}
                            >
                                <div className={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-sm",
                                    key === 'ELECTRICIAN' ? "bg-amber-50 text-amber-600 group-hover:bg-amber-100" :
                                    key === 'PLUMBER' ? "bg-cyan-50 text-cyan-600 group-hover:bg-cyan-100" :
                                    key === 'CLEANING' ? "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100" :
                                    "bg-gray-50 text-gray-600 group-hover:bg-gray-100"
                                )}>
                                    <Icon className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <span className="block font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                                        {label}
                                    </span>
                                    <span className="text-xs text-gray-500 font-medium line-clamp-1">
                                        {meta.tagline}
                                    </span>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-900" />
                            </Card>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

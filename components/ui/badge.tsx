import * as React from "react"
import { cn } from "./button"

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    status?: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

export const Badge = ({ className, status, variant, ...props }: BadgeProps) => {
    let colorClass = "bg-gray-100 text-gray-800"

    // Status overrides variant
    if (status) {
        switch (status) {
            case 'REQUESTED': colorClass = "bg-blue-100 text-blue-800"; break;
            case 'PRICED': colorClass = "bg-indigo-100 text-indigo-800"; break;
            case 'BOOKED': colorClass = "bg-sky-100 text-sky-800"; break;
            case 'ASSIGNING': colorClass = "bg-yellow-100 text-yellow-800 animate-pulse"; break;
            case 'ASSIGNED': colorClass = "bg-blue-100 text-blue-800"; break;
            case 'PREAUTHORISED': colorClass = "bg-emerald-100 text-emerald-800"; break;
            case 'ARRIVING': colorClass = "bg-amber-100 text-amber-800"; break;
            case 'ON_SITE': colorClass = "bg-blue-600 text-white font-bold"; break;
            case 'IN_PROGRESS': colorClass = "bg-green-100 text-green-800 font-bold"; break;
            case 'SCOPE_MISMATCH': colorClass = "bg-red-100 text-red-800 font-bold"; break;
            case 'MISMATCH_PENDING': colorClass = "bg-red-600 text-white font-bold animate-pulse"; break;
            case 'REBOOK_REQUIRED': colorClass = "bg-amber-100 text-amber-800 font-bold"; break;
            case 'PARTS_REQUIRED': colorClass = "bg-purple-100 text-purple-800"; break;
            case 'COMPLETED': colorClass = "bg-green-100 text-green-800"; break;
            case 'CAPTURED': colorClass = "bg-slate-700 text-white"; break;
            case 'PAID_OUT': colorClass = "bg-slate-900 text-white"; break;
            case 'CLOSED': colorClass = "bg-gray-800 text-white"; break;
            case 'CANCELLED_FREE':
            case 'CANCELLED_CHARGED': colorClass = "bg-red-100 text-red-800"; break;
            case 'DISPUTED': colorClass = "bg-red-500 text-white"; break;
        }
    } else if (variant) {
        switch (variant) {
            case 'default': colorClass = "bg-primary text-primary-foreground hover:bg-primary/80"; break;
            case 'secondary': colorClass = "bg-secondary text-secondary-foreground hover:bg-secondary/80"; break;
            case 'destructive': colorClass = "bg-red-500 text-white hover:bg-red-600"; break;
            case 'outline': colorClass = "text-foreground"; break;
        }
    }

    return (
        <div className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", colorClass, className)} {...props} />
    )
}

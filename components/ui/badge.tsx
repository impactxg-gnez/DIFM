import * as React from "react"
import { cn } from "./button"

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
    status?: string
}

export const Badge = ({ className, status, ...props }: BadgeProps) => {
    let colorClass = "bg-gray-100 text-gray-800"

    switch (status) {
        case 'CREATED': colorClass = "bg-blue-100 text-blue-800"; break;
        case 'DISPATCHING': colorClass = "bg-yellow-100 text-yellow-800 animate-pulse"; break;
        case 'ACCEPTED': colorClass = "bg-indigo-100 text-indigo-800"; break;
        case 'IN_PROGRESS': colorClass = "bg-orange-100 text-orange-800"; break;
        case 'COMPLETED': colorClass = "bg-green-100 text-green-800"; break;
        case 'CUSTOMER_REVIEWED': colorClass = "bg-purple-100 text-purple-800"; break;
        case 'ADMIN_REVIEWED': colorClass = "bg-pink-100 text-pink-800"; break;
        case 'CLOSED': colorClass = "bg-gray-800 text-white"; break;
    }

    return (
        <div className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2", colorClass, className)} {...props} />
    )
}

'use client';

import { Plus, Clock, Activity, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavProps {
    activeTab: 'NEW_TASK' | 'STATUS' | 'HISTORY' | 'ACCOUNT';
    onTabChange: (tab: 'NEW_TASK' | 'STATUS' | 'HISTORY' | 'ACCOUNT') => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
    return (
        <div className="fixed bottom-0 left-0 right-0 h-16 bg-zinc-900 border-t border-white/10 flex items-center justify-around px-2 z-50 safe-area-bottom">
            <button
                onClick={() => onTabChange('NEW_TASK')}
                className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                    activeTab === 'NEW_TASK' ? "text-blue-500" : "text-gray-400 hover:text-gray-200"
                )}
            >
                <Plus className="w-6 h-6" />
                <span className="text-[10px] font-medium">New Task</span>
            </button>
            <button
                onClick={() => onTabChange('STATUS')}
                className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                    activeTab === 'STATUS' ? "text-blue-500" : "text-gray-400 hover:text-gray-200"
                )}
            >
                <Activity className="w-6 h-6" />
                <span className="text-[10px] font-medium">Status</span>
            </button>
            <button
                onClick={() => onTabChange('HISTORY')}
                className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                    activeTab === 'HISTORY' ? "text-blue-500" : "text-gray-400 hover:text-gray-200"
                )}
            >
                <Clock className="w-6 h-6" />
                <span className="text-[10px] font-medium">History</span>
            </button>
            <button
                onClick={() => onTabChange('ACCOUNT')}
                className={cn(
                    "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                    activeTab === 'ACCOUNT' ? "text-blue-500" : "text-gray-400 hover:text-gray-200"
                )}
            >
                <User className="w-6 h-6" />
                <span className="text-[10px] font-medium">Account</span>
            </button>
        </div>
    );
}

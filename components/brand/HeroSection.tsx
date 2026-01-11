import { CheckCircle, Hammer, HardHat, Wrench } from 'lucide-react';
import { motion } from 'framer-motion';

export function HeroSection({ className = "" }: { className?: string }) {
    return (
        <div className={`space-y-8 flex flex-col justify-center h-full ${className}`}>

            {/* Logo / Worker Graphic */}
            <div className="flex justify-center md:justify-start">
                <div className="relative w-32 h-32 md:w-40 md:h-40">
                    <div className="absolute inset-0 flex items-center justify-center gap-2">
                        <div className="flex flex-col items-center text-white">
                            <HardHat className="w-12 h-12 md:w-16 md:h-16 mb-2" />
                            <div className="h-1 w-8 bg-white/20 rounded-full" />
                        </div>
                        <div className="h-12 w-[1px] bg-white/20 mx-2" />
                        <div className="flex flex-col items-center text-white">
                            <Hammer className="w-12 h-12 md:w-16 md:h-16 mb-2" />
                            <div className="h-1 w-8 bg-white/20 rounded-full" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Headlines */}
            <div className="space-y-4 text-center md:text-left">
                <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-white leading-[0.9]">
                    DIFM<br />
                    <span className="text-xl md:text-2xl font-normal tracking-normal text-gray-400 block mt-2">Do it For Me</span>
                </h1>

                <h2 className="text-2xl md:text-3xl font-bold text-white max-w-md">
                    Book trusted local pros. We handle everything.
                </h2>

                <p className="text-lg text-blue-200 font-medium">
                    Instant fixed price • No calling around • We'll do it for you.
                </p>
            </div>

            {/* Checklist */}
            <div className="space-y-4 bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-sm max-w-md">
                <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-500 fill-blue-500 bg-white rounded-full border-none" />
                    <span className="text-white font-medium text-lg">Vetted local pros</span>
                </div>
                <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-500 fill-blue-500 bg-white rounded-full border-none flex-shrink-0 mt-1" />
                    <div>
                        <span className="text-white font-medium text-lg">Fixed upfront pricing</span>
                        <p className="text-sm text-gray-400">• No quotes, no surprises</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-500 fill-blue-500 bg-white rounded-full border-none" />
                    <span className="text-white font-medium text-lg">We cover no-shows, issues and disputes</span>
                </div>
            </div>

            {/* Tagline */}
            <div className="pt-4 text-center md:text-left">
                <p className="text-gray-500 font-serif italic text-lg">"Don't stress. Rest Assured. We'll do it for YOU!"</p>
            </div>
        </div>
    );
}

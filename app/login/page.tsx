'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HeroSection } from '@/components/brand/HeroSection'; // New shared branding

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('customer@demo.com');
    const [password, setPassword] = useState('password');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [role, setRole] = useState('CUSTOMER'); // Default role for demo purposes or strictly login

    // In a real app we might not ask for role on login if the backend handles it, 
    // but the current /api/auth/login roughly returns role. 
    // So distinct inputs aren't needed unless we want to "toggle" default credentials.

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.role === 'ADMIN') router.push('/admin');
                else if (data.role === 'PROVIDER') router.push('/dashboard/provider');
                else router.push('/dashboard/customer');
            } else {
                const err = await res.json();
                setError(err.error || 'Login failed');
            }
        } catch (e) {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-black text-white font-sans selection:bg-blue-600/30">
            {/* Left Side: Branding (Visible on Desktop) */}
            <div className="hidden lg:flex flex-col justify-center p-12 relative overflow-hidden bg-[#0a0a0a]">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-transparent"></div>

                <div className="relative z-10 max-w-lg mx-auto">
                    <HeroSection />
                </div>
            </div>

            {/* Right Side: Login Form */}
            <div className="flex items-center justify-center p-6 lg:p-12 relative">
                {/* Mobile Branding (Simplified) */}
                <div className="lg:hidden absolute top-6 left-0 right-0 px-6 text-center">
                    <div className="text-3xl font-black mb-2">DIFM.</div>
                    <p className="text-gray-400 text-sm">Do it For Me</p>
                </div>

                <div className="w-full max-w-md space-y-8 mt-16 lg:mt-0">
                    <div className="text-center lg:text-left">
                        <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
                        <p className="text-gray-400 mt-2">Enter your details to access your account</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Email</label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="bg-[#1c1c1c] border-[#333] h-12 text-white placeholder:text-gray-600 focus:border-blue-500 transition-colors"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Password</label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="bg-[#1c1c1c] border-[#333] h-12 text-white placeholder:text-gray-600 focus:border-blue-500 transition-colors"
                            />
                        </div>

                        {error && <p className="text-destructive text-sm font-medium">{error}</p>}

                        <Button
                            type="submit"
                            className="w-full h-12 text-base font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_-5px_rgba(37,99,235,0.4)]"
                            disabled={loading}
                        >
                            {loading ? 'Logging in...' : 'Log in'}
                        </Button>

                        <p className="text-center text-sm text-gray-500">
                            Don't have an account? <a href="/register" className="text-blue-400 hover:text-blue-300 font-medium hover:underline">Register</a>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('customer@demo.com');
    const [password, setPassword] = useState('password123');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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
                router.push('/dashboard');
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
        <div className="relative min-h-screen w-full font-sans text-white overflow-x-hidden flex flex-col items-center justify-center p-4 sm:p-6">
            {/* Background Texture */}
            <div
                className="fixed inset-0 bg-cover bg-center z-0"
                style={{
                    backgroundImage: 'url(/dashboard-bg.jpg)',
                }}
            />
            {/* Dark Overlay */}
            <div className="fixed inset-0 bg-black/60 z-0" />

            <div className="relative z-10 w-full max-w-md flex flex-col gap-8">

                {/* Header Section */}
                <div className="text-center space-y-3">
                    <h1 className="text-3xl font-bold tracking-tight">What needs doing?</h1>
                    <p className="text-white/60 text-sm">
                        Professional services handled for you,<br />start to finish.
                    </p>
                </div>

                {/* Benefits List */}
                <div className="space-y-4 px-2">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />
                        <span className="text-sm font-medium">Vetted local pros</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />
                        <span className="text-sm font-medium">No Quotes. No Calling Around</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0" />
                        <span className="text-sm font-medium">We handle no-shows, issues and disputes</span>
                    </div>
                </div>

                {/* Login Card */}
                <div className="bg-[#1E1E20] border border-white/5 rounded-[32px] p-6 sm:p-8 shadow-2xl">
                    <h2 className="text-2xl font-bold mb-6">Sign In</h2>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-white/40 tracking-wider uppercase">Email Address</label>
                            <div className="relative group">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@example.com"
                                    className="w-full h-12 bg-black/20 border border-white/10 rounded-xl pl-12 pr-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-white/40 tracking-wider uppercase">Password</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20 group-focus-within:text-blue-500 transition-colors" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full h-12 bg-black/20 border border-white/10 rounded-xl pl-12 pr-12 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500 transition-colors"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {error && <p className="text-red-400 text-sm">{error}</p>}

                        <Button
                            type="submit"
                            disabled={loading}
                            className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold text-base flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(37,99,235,0.3)] hover:shadow-[0_6px_24px_rgba(37,99,235,0.4)] transition-all"
                        >
                            {loading ? 'Signing In...' : 'Sign In'} <ArrowRight className="w-4 h-4" />
                        </Button>

                        <div className="text-center">
                            <button type="button" className="text-sm text-white/40 hover:text-white transition-colors">
                                Forgot password?
                            </button>
                        </div>
                    </form>

                    {/* Divider */}
                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/5"></div>
                        </div>
                        <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold">
                            <span className="bg-[#1E1E20] px-2 text-white/20">Or Continue With</span>
                        </div>
                    </div>

                    {/* Social Buttons */}
                    <div className="grid grid-cols-2 gap-4">
                        <button className="h-12 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all">
                            {/* Simple Google G placeholder or Text */}
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white"><path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z" /></svg>
                            <span className="text-sm font-semibold">Google</span>
                        </button>
                        <button className="h-12 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white"><path d="M17.8 11.5c.03-3.03 2.5-4.5 2.6-4.54-1.4-2.04-3.6-2.32-4.4-2.35-1.85-.2-3.62 1.08-4.56 1.08-.94 0-2.4-1.05-3.95-1.02-2.04.03-3.92 1.18-4.97 3-2.13 3.68-.54 9.17 1.52 12.17 1.02 1.48 2.23 3.12 3.82 3.07 1.53-.05 2.1-.98 3.95-.98 1.84 0 2.35.98 3.95.93 1.63-.05 2.67-1.48 3.66-2.95.94-1.37 1.33-2.7 1.35-2.77-.02-.02-2.6-1-2.57-4.14zm-5.7-9.06c.84-1.03 1.4-2.46 1.25-3.9-.7.03-2.22.8-2.95 2.03-.65 1.1-1.22 2.48-1.06 3.93.8 0 1.9-.3 2.76-1.06z" /></svg>
                            <span className="text-sm font-semibold">Apple</span>
                        </button>
                    </div>

                    {/* Sign Up Link */}
                    <div className="mt-8 text-center pt-6 border-t border-white/5">
                        <p className="text-sm text-white/40">
                            Don't have an account?{' '}
                            <button onClick={() => router.push('/register')} className="text-blue-500 font-bold hover:underline">
                                Sign Up
                            </button>
                        </p>
                    </div>

                </div>
            </div>
        </div>
    );
}

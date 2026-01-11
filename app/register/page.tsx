'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HeroSection } from '@/components/brand/HeroSection'; // Shared branding

export default function RegisterPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState('CUSTOMER');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name, role })
            });

            if (res.ok) {
                router.push('/login');
            } else {
                const err = await res.json();
                setError(err.error || 'Registration failed');
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

            {/* Right Side: Register Form */}
            <div className="flex items-center justify-center p-6 lg:p-12 relative">
                {/* Mobile Branding (Simplified) */}
                <div className="lg:hidden absolute top-6 left-0 right-0 px-6 text-center">
                    <div className="text-3xl font-black mb-2">DIFM.</div>
                    <p className="text-gray-400 text-sm">Do it For Me</p>
                </div>

                <div className="w-full max-w-md space-y-8 mt-16 lg:mt-0">
                    <div className="text-center lg:text-left">
                        <h2 className="text-3xl font-bold tracking-tight">Create Account</h2>
                        <p className="text-gray-400 mt-2">Join DIFM to get things done simply.</p>
                    </div>

                    <form onSubmit={handleRegister} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Full Name</label>
                            <Input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="bg-[#1c1c1c] border-[#333] h-12 text-white placeholder:text-gray-600 focus:border-blue-500 transition-colors"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Email</label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="bg-[#1c1c1c] border-[#333] h-12 text-white placeholder:text-gray-600 focus:border-blue-500 transition-colors"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Password</label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="bg-[#1c1c1c] border-[#333] h-12 text-white placeholder:text-gray-600 focus:border-blue-500 transition-colors"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block text-gray-300">I am a:</label>
                            <div className="grid grid-cols-2 gap-4">
                                <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${role === 'CUSTOMER' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-[#1c1c1c] border-[#333] text-gray-400 hover:bg-[#252525]'}`}>
                                    <input type="radio" name="role" value="CUSTOMER" checked={role === 'CUSTOMER'} onChange={(e) => setRole(e.target.value)} className="hidden" />
                                    Customer
                                </label>
                                <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${role === 'PROVIDER' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-[#1c1c1c] border-[#333] text-gray-400 hover:bg-[#252525]'}`}>
                                    <input type="radio" name="role" value="PROVIDER" checked={role === 'PROVIDER'} onChange={(e) => setRole(e.target.value)} className="hidden" />
                                    Provider
                                </label>
                            </div>
                        </div>

                        {error && <p className="text-destructive text-sm font-medium">{error}</p>}

                        <Button
                            type="submit"
                            className="w-full h-12 text-base font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_-5px_rgba(37,99,235,0.4)]"
                            disabled={loading}
                        >
                            {loading ? 'Creating Account...' : 'Register'}
                        </Button>

                        <p className="text-center text-sm text-gray-500">
                            Already have an account? <a href="/login" className="text-blue-400 hover:text-blue-300 font-medium hover:underline">Login</a>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}

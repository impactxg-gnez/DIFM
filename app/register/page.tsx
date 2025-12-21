'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function RegisterPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('CUSTOMER');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, role }),
            });

            if (!res.ok) {
                throw new Error('Registration failed');
            }

            router.push('/login');
        } catch (err) {
            setError('Registration failed. Try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">Join DIFM</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleRegister} className="space-y-4">
                        <div>
                            <Input
                                placeholder="Full Name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <Input
                                type="email"
                                placeholder="Email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <Input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">I am a:</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="role" value="CUSTOMER" checked={role === 'CUSTOMER'} onChange={(e) => setRole(e.target.value)} className="w-4 h-4" />
                                    Customer
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="role" value="PROVIDER" checked={role === 'PROVIDER'} onChange={(e) => setRole(e.target.value)} className="w-4 h-4" />
                                    Provider
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="role" value="ADMIN" checked={role === 'ADMIN'} onChange={(e) => setRole(e.target.value)} className="w-4 h-4" />
                                    Admin
                                </label>
                            </div>
                        </div>

                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? 'Registering...' : 'Register'}
                        </Button>
                        <p className="text-center text-sm text-gray-500">
                            Already have an account? <a href="/login" className="text-blue-600 hover:underline">Login</a>
                        </p>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SERVICE_CATEGORIES } from '@/lib/constants';
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface ProviderOnboardingProps {
    user: any;
    onComplete: () => void;
}

export function ProviderOnboarding({ user, onComplete }: ProviderOnboardingProps) {
    const [step, setStep] = useState<'profile' | 'capabilities' | 'documents'>('profile');
    const [providerType, setProviderType] = useState<string>(user.providerType || 'HANDYMAN');
    const [categories, setCategories] = useState<string[]>(user.categories?.split(',').filter(Boolean) || []);
    const [capabilities, setCapabilities] = useState<string[]>(user.capabilities?.split(',').filter(Boolean) || []);
    const [serviceArea, setServiceArea] = useState(user.serviceArea || '');
    const [complianceConfirmed, setComplianceConfirmed] = useState(user.complianceConfirmed || false);
    const [isSaving, setIsSaving] = useState(false);
    const [idProofUrl, setIdProofUrl] = useState('');
    const [insuranceUrl, setInsuranceUrl] = useState('');

    const { data: documents, mutate: mutateDocuments } = useSWR('/api/provider/documents', fetcher);

    const handleSaveProfile = async () => {
        setIsSaving(true);
        try {
            await fetch('/api/provider/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    providerType,
                    categories: categories.join(','),
                    capabilities: capabilities.join(','),
                    serviceArea,
                    complianceConfirmed
                })
            });
            setStep('capabilities');
        } catch (e) {
            console.error('Save profile error', e);
            alert('Failed to save profile');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveCapabilities = async () => {
        setIsSaving(true);
        try {
            await fetch('/api/provider/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categories: categories.join(','),
                    capabilities: capabilities.join(','),
                    // Auto-confirm compliance when capabilities are set (documents optional)
                    complianceConfirmed: true
                })
            });
            // Allow skipping documents - go directly to complete if providerType and categories are set
            if (providerType && categories.length > 0) {
                onComplete();
            } else {
                setStep('documents');
            }
        } catch (e) {
            console.error('Save capabilities error', e);
            alert('Failed to save capabilities');
        } finally {
            setIsSaving(false);
        }
    };

    const handleUploadDocument = async (documentType: string, fileUrl: string) => {
        try {
            await fetch('/api/provider/documents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentType, fileUrl })
            });
            mutateDocuments();
        } catch (e) {
            console.error('Upload document error', e);
            alert('Failed to upload document');
        }
    };

    const toggleCategory = (category: string) => {
        if (categories.includes(category)) {
            setCategories(categories.filter(c => c !== category));
        } else {
            setCategories([...categories, category]);
        }
    };

    const toggleCapability = (capability: string) => {
        if (capabilities.includes(capability)) {
            setCapabilities(capabilities.filter(c => c !== capability));
        } else {
            setCapabilities([...capabilities, capability]);
        }
    };



    if (step === 'profile') {
        return (
            <Card className="w-full max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle>Provider Profile Setup</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label>Provider Type *</Label>
                        <div className="flex gap-4">
                            <Button
                                type="button"
                                variant={providerType === 'HANDYMAN' ? 'default' : 'outline'}
                                onClick={() => setProviderType('HANDYMAN')}
                                className="flex-1"
                            >
                                Handyman
                            </Button>
                            <Button
                                type="button"
                                variant={providerType === 'SPECIALIST' ? 'default' : 'outline'}
                                onClick={() => setProviderType('SPECIALIST')}
                                className="flex-1"
                            >
                                Specialist
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Service Area</Label>
                        <Input
                            value={serviceArea}
                            onChange={(e) => setServiceArea(e.target.value)}
                            placeholder="e.g. London, Greater London area"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={complianceConfirmed}
                                onChange={(e) => setComplianceConfirmed(e.target.checked)}
                                className="w-4 h-4"
                            />
                            I confirm compliance with all requirements
                        </Label>
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={onComplete}>Skip for now</Button>
                        <Button onClick={handleSaveProfile} disabled={isSaving}>
                            {isSaving ? 'Saving...' : 'Continue'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (step === 'capabilities') {
        return (
            <Card className="w-full max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle>Select Your Capabilities</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-3">
                        <Label>Service Categories</Label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {Object.entries(SERVICE_CATEGORIES).map(([key, label]) => (
                                <Button
                                    key={key}
                                    type="button"
                                    variant={categories.includes(key) ? 'default' : 'outline'}
                                    onClick={() => toggleCategory(key)}
                                    className="justify-start"
                                >
                                    {categories.includes(key) && '✓ '}
                                    {label}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {providerType === 'HANDYMAN' && (
                        <div className="space-y-3">
                            <Label>Handyman Capabilities</Label>
                            <div className="flex flex-col gap-2">
                                <Button
                                    type="button"
                                    variant={capabilities.includes('HANDYMAN_PLUMBING') ? 'default' : 'outline'}
                                    onClick={() => toggleCapability('HANDYMAN_PLUMBING')}
                                    className="justify-start"
                                >
                                    {capabilities.includes('HANDYMAN_PLUMBING') && '✓ '}
                                    Plumbing (P1 jobs)
                                </Button>
                                <Button
                                    type="button"
                                    variant={capabilities.includes('HANDYMAN_ELECTRICAL') ? 'default' : 'outline'}
                                    onClick={() => toggleCapability('HANDYMAN_ELECTRICAL')}
                                    className="justify-start"
                                >
                                    {capabilities.includes('HANDYMAN_ELECTRICAL') && '✓ '}
                                    Electrical (E1 jobs)
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setStep('profile')}>Back</Button>
                        <Button onClick={handleSaveCapabilities} disabled={isSaving}>
                            {isSaving ? 'Saving...' : 'Continue'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (step === 'documents') {
        return (
            <Card className="w-full max-w-2xl mx-auto">
                <CardHeader>
                    <CardTitle>Upload Documents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label>ID Proof</Label>
                        <div className="flex gap-2">
                            <Input
                                value={idProofUrl}
                                onChange={(e) => setIdProofUrl(e.target.value)}
                                placeholder="Document URL or path"
                            />
                            <Button
                                onClick={() => {
                                    if (idProofUrl) {
                                        handleUploadDocument('ID_PROOF', idProofUrl);
                                        setIdProofUrl('');
                                    }
                                }}
                            >
                                Upload
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">For Milestone 2, enter a URL. File upload can be added later.</p>
                    </div>

                    <div className="space-y-2">
                        <Label>Liability Insurance</Label>
                        <div className="flex gap-2">
                            <Input
                                value={insuranceUrl}
                                onChange={(e) => setInsuranceUrl(e.target.value)}
                                placeholder="Document URL or path"
                            />
                            <Button
                                onClick={() => {
                                    if (insuranceUrl) {
                                        handleUploadDocument('LIABILITY_INSURANCE', insuranceUrl);
                                        setInsuranceUrl('');
                                    }
                                }}
                            >
                                Upload
                            </Button>
                        </div>
                    </div>

                    {documents && documents.length > 0 && (
                        <div className="space-y-2">
                            <Label>Uploaded Documents</Label>
                            <div className="space-y-1">
                                {documents.map((doc: any) => (
                                    <div key={doc.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                                        <span className="text-sm">{doc.documentType}</span>
                                        <Badge variant="outline">{new Date(doc.uploadedAt).toLocaleDateString()}</Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}



                    <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                        <p className="text-sm text-primary">
                            <strong>Status:</strong> {user.providerStatus || 'PENDING'}
                        </p>
                        <p className="text-xs text-primary/80 mt-1">
                            Document upload is optional. You can upload documents later from your profile.
                        </p>
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setStep('capabilities')}>Back</Button>
                        <Button variant="outline" onClick={async () => {
                            // Skip documents and mark compliance if not already set
                            if (!user.complianceConfirmed) {
                                try {
                                    await fetch('/api/provider/profile', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ complianceConfirmed: true })
                                    });
                                } catch (e) {
                                    console.error('Save compliance error', e);
                                }
                            }
                            onComplete();
                        }}>Skip Documents</Button>
                        <Button onClick={onComplete}>Complete</Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return null;
}


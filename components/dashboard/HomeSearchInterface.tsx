'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Search, Mic, Camera, CheckCircle } from 'lucide-react';
import { AddressModal } from '@/components/AddressModal';
import { REVIEW_QUOTE_MESSAGE } from '@/lib/pricing/bookingCopy';

export type HomeBookingFlow = 'fixed' | 'quote';

interface HomeSearchInterfaceProps {
    onBookNow: (data: {
        description: string;
        address: string;
        label?: string;
        pricePrediction?: any;
        flow?: HomeBookingFlow;
        /** For review/quote flow — used to follow up with a custom quote */
        quoteContactEmail?: string;
        quoteContactPhone?: string;
    }) => void;
    initialLocation?: string;
    showLoginButton?: boolean;
    onLoginClick?: () => void;
}

const JOB_LABELS: Record<string, string> = {
    // Legacy / V1 ids
    tv_mount_standard: 'TV Mount',
    shelf_install_single: 'Shelf Install',
    install_shelves_set: 'Shelf Install',
    install_blinds: 'Blind Install',
    mirror_hang: 'Mirror Hang',
    pic_hang: 'Picture Hang',
    handyman_small_repair: 'Minor Repair',
    appliance_install: 'Appliance Install',
    // MATRIX V2 workbook ids
    tv_mount: 'TV Mount',
    shelf_install: 'Shelf Install',
    blind_install: 'Blind Install',
    curtain_rail: 'Curtain Rail',
    furniture_assembly: 'Furniture Assembly',
    wall_repair: 'Wall Repair',
    picture_hang: 'Picture Hang',
    washing_machine_install: 'Washing Machine Install',
    dishwasher_install: 'Dishwasher Install',
    home_cleaning: 'Home Cleaning',
    home_cleaning_standard: 'Home Cleaning',
    home_cleaning_deep: 'Deep Cleaning',
    bathroom_cleaning: 'Bathroom Cleaning',
    kitchen_cleaning: 'Kitchen Cleaning',
};

const FLAG_LABELS: Record<string, string> = {
    heavyLoad: 'Heavy Load',
    largeTV: 'Large TV',
    highWall: 'Above 2.5m',
};

/** Warnings that block instant fixed price display (routed to review/quote in API). */
const BOOKING_BLOCK_WARNINGS = new Set([
    'OUT_OF_SCOPE',
    'NEEDS_CLARIFICATION',
    'COMMERCIAL_QUOTE_REQUIRED',
    'BUNDLE_COMPLEX_QUOTE_REQUIRED',
    'CONTRADICTION_CLARIFY',
    'PARTIAL_PARSE_CLARIFY',
]);

function resolveJobLabel(jobId: string): string {
    return JOB_LABELS[jobId] || jobId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function HomeSearchInterface({ onBookNow, initialLocation = 'Location', showLoginButton = false, onLoginClick }: HomeSearchInterfaceProps) {
    const initialLocationRef = useRef(initialLocation);
    initialLocationRef.current = initialLocation;

    const [locationText, setLocationText] = useState(initialLocation);
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);

    // Search & Pricing State
    const [description, setDescription] = useState('');
    const [debouncedDesc, setDebouncedDesc] = useState('');
    const [pricePreview, setPricePreview] = useState<any>(null);
    const [isPricingLoading, setIsPricingLoading] = useState(false);

    // Modal State
    const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
    const [selectedAddress, setSelectedAddress] = useState('');
    const [selectedLabel, setSelectedLabel] = useState<string | undefined>(undefined);
    const [quoteContactEmail, setQuoteContactEmail] = useState('');
    const [quoteContactPhone, setQuoteContactPhone] = useState('');

    // Debounce description input
    useEffect(() => {
        const timer = setTimeout(() => {
            const normalized = description.trim();
            // Stability guard: do not trigger extraction for very short partial input.
            setDebouncedDesc(normalized.length >= 6 ? normalized : '');
        }, 400);
        return () => clearTimeout(timer);
    }, [description]);

    // Fetch Price Prediction
    useEffect(() => {
        const fetchPrice = async () => {
            if (!debouncedDesc.trim()) {
                setPricePreview(null);
                return;
            }

            setIsPricingLoading(true);
            try {
                const res = await fetch('/api/pricing/preview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: 'HANDYMAN', description: debouncedDesc }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setPricePreview(data);
                }
            } catch (error) {
                console.error('Failed to fetch price:', error);
            } finally {
                setIsPricingLoading(false);
            }
        };

        fetchPrice();
    }, [debouncedDesc]);

    const applyGeocodedAddress = (displayName: string) => {
        const full = displayName
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
            .slice(0, 3)
            .join(', ');
        const short = displayName.split(',')[0].trim() || full;
        setLocationText(short);
        setSelectedAddress(full);
        try {
            if (full) localStorage.setItem('preferredLocation', full);
        } catch {
            // ignore
        }
    };

    // Sync with initialLocation prop (e.g. dashboard after CustomerView geolocation / preferredLocation)
    useEffect(() => {
        const v = (initialLocation || '').trim();
        if (v && v !== 'Location') {
            setLocationText(v.split(',')[0].trim() || v);
            setSelectedAddress(v);
        }
    }, [initialLocation]);

    /** @param cancelIfParentHasAddress in-flight from auto-detect: skip if parent set preferredLocation after mount. Manual refresh always applies. */
    const fetchLocation = (cancelIfParentHasAddress = true) => {
        setIsLoadingLocation(true);
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    try {
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                        if (res.ok) {
                            const data = await res.json();
                            const name = data.display_name as string;
                            if (name) {
                                const fromParent = (initialLocationRef.current || '').trim();
                                if (cancelIfParentHasAddress && fromParent && fromParent !== 'Location') {
                                    // don't clobber a sync'd parent address with a stale geocode
                                } else {
                                    applyGeocodedAddress(name);
                                }
                            } else {
                                setLocationText('Current Location');
                            }
                        } else {
                            setLocationText('Current Location');
                        }
                    } catch (e) {
                        console.error('Reverse geocode failed', e);
                        setLocationText('Current Location');
                    } finally {
                        setIsLoadingLocation(false);
                    }
                },
                (error) => {
                    console.error('Error getting location:', error);
                    setIsLoadingLocation(false);
                }
            );
        } else {
            setIsLoadingLocation(false);
        }
    };

    // Geolocate only when the parent is not already supplying a saved address
    useEffect(() => {
        const v = (initialLocation || '').trim();
        if (v && v !== 'Location') {
            return;
        }
        fetchLocation(true);
    }, [initialLocation]);

    const handleAddressClick = () => {
        setIsAddressModalOpen(true);
    };

    const handleAddressSave = (address: string, label?: string) => {
        setSelectedAddress(address);
        setSelectedLabel(label);
        try {
            if (address.trim()) localStorage.setItem('preferredLocation', address.trim());
        } catch {
            // ignore
        }
    };

    const handleBookFixedClick = () => {
        if (!description) return;
        onBookNow({
            description,
            address: selectedAddress,
            label: selectedLabel,
            pricePrediction: pricePreview,
            flow: 'fixed',
        });
    };

    const handleQuoteSubmitClick = () => {
        if (!description || !quoteContactOk) return;
        onBookNow({
            description,
            address: selectedAddress,
            label: selectedLabel,
            pricePrediction: pricePreview,
            flow: 'quote',
            quoteContactEmail: quoteContactEmail.trim(),
            quoteContactPhone: quoteContactPhone.trim(),
        });
    };

    const handleMediaClick = (type: 'mic' | 'camera') => {
        alert(`${type === 'mic' ? 'Voice Note' : 'Camera'} upload coming soon!`);
    };

    const trimmedDescription = description.trim();
    const isTooShortForExtraction = trimmedDescription.length > 0 && trimmedDescription.length < 6;
    const previewJobs: string[] =
        Array.isArray(pricePreview?.finalJobs) && pricePreview.finalJobs.length > 0
            ? pricePreview.finalJobs
            : Array.isArray(pricePreview?.visits)
                ? pricePreview.visits.flatMap((visit: any) => {
                    const primary = String(visit?.primary_job_item?.job_item_id || '').trim();
                    const addons = Array.isArray(visit?.addon_job_items)
                        ? visit.addon_job_items.map((a: any) => String(a?.job_item_id || '').trim())
                        : [];
                    return [primary, ...addons].filter(Boolean);
                  })
                : [];
    const jobLabels = previewJobs.map(resolveJobLabel);
    const quantitiesMap = ((pricePreview?.quantitiesByJob || {}) as Record<string, number>) || {};
    const qtySubtitle =
        previewJobs.length > 0
            ? previewJobs
                  .map((id) => {
                      const q = quantitiesMap[id];
                      const label = resolveJobLabel(id);
                      return typeof q === 'number' && q > 1 ? `${label} × ${q}` : label;
                  })
                  .join(' • ')
            : '';
    const matrixClarifiers: Array<{ tag?: string; question?: string }> = Array.isArray(pricePreview?.clarifiers)
        ? pricePreview.clarifiers
        : [];
    const showMatrixClarifiers = matrixClarifiers.length > 0 && !isPricingLoading;
    const displayTitle =
        jobLabels.length === 1
            ? jobLabels[0]
            : jobLabels.length === 2
                ? jobLabels.join(' + ')
                : jobLabels.length > 2
                    ? `${jobLabels[0]} + ${jobLabels.length - 1} more`
                    : (description || 'Custom Job');
    const subtitle = Object.entries((pricePreview?.flags || {}) as Record<string, boolean>)
        .filter(([, val]) => !!val)
        .map(([key]) => FLAG_LABELS[key])
        .filter(Boolean)
        .join(' • ');
    const displayPrice = Number(pricePreview?.display_price);
    const hasDisplayPrice = Number.isFinite(displayPrice) && displayPrice > 0;
    const previewWarnings: string[] = Array.isArray(pricePreview?.warnings) ? pricePreview.warnings : [];
    const blocksBookableQuote = previewWarnings.some((w) => BOOKING_BLOCK_WARNINGS.has(w));
    const hasBookableVisits = Array.isArray(pricePreview?.visits) && pricePreview.visits.length > 0;
    const routing = pricePreview?.routing as string | undefined;
    const isOut = previewWarnings.includes('OUT_OF_SCOPE') || pricePreview?.isOutOfScope;
    /** Book with fixed price: has quote + (API says bookable or legacy without `routing` field). */
    const showFixedPath =
        !isOut &&
        hasDisplayPrice &&
        hasBookableVisits &&
        !blocksBookableQuote &&
        (pricePreview?.bookable === true ||
            routing === 'FIXED_PRICE' ||
            (routing == null && hasDisplayPrice));
    /** Review / quote: not OOS, not the fixed path, and server allows quote submission (or legacy unknown). */
    const showReviewPath =
        !isOut &&
        !showFixedPath &&
        pricePreview != null &&
        (pricePreview?.canSubmitQuoteRequest !== false) &&
        (routing === 'REVIEW_QUOTE' || routing == null);
    const addressOk = Boolean(selectedAddress?.trim());
    const quoteEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quoteContactEmail.trim());
    const quotePhoneDigits = quoteContactPhone.replace(/\D/g, '');
    const quotePhoneOk = quotePhoneDigits.length >= 8 && quotePhoneDigits.length <= 15;
    const quoteContactOk = quoteEmailOk && quotePhoneOk;
    const canAct = !isTooShortForExtraction && description.trim().length > 0;
    if (pricePreview && showFixedPath && !hasDisplayPrice) {
        console.error('Missing backend display_price', pricePreview);
    }

    return (
        <div className="relative w-full min-h-screen font-sans text-white overflow-x-hidden">

            {/* Header: Auto-detected location (top left); tap opens address modal */}
            <div className="absolute top-8 left-4 sm:left-6 z-20 max-w-[min(85vw,280px)]">
                <button
                    type="button"
                    onClick={handleAddressClick}
                    title="Add or edit address"
                    className="flex items-start justify-start text-left px-4 py-2.5 min-h-[44px] bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md hover:bg-white/10 transition-all font-semibold text-xs sm:text-sm text-white/90 tracking-wide leading-snug"
                >
                    <span className="line-clamp-3">
                        {isLoadingLocation && !(selectedAddress || locationText)?.trim()
                            ? 'Locating…'
                            : (selectedAddress?.trim() ||
                                  locationText?.trim() ||
                                  'Tap to add address')}
                    </span>
                </button>
            </div>

            {showLoginButton && (
                <div className="absolute top-8 right-6 z-20">
                    <button
                        onClick={onLoginClick}
                        className="flex items-center justify-center px-6 py-2 h-[44px] bg-white/5 border border-white/10 rounded-full backdrop-blur-md hover:bg-white/10 transition-all font-semibold text-sm text-white/80 tracking-wide"
                    >
                        Login
                    </button>
                </div>
            )}

            {/* Scrollable Main Content Wrapper */}
            <div className="relative z-10 w-full flex flex-col items-center pt-[120px] pb-32 px-4 md:px-0">

                {/* Hero Graphic */}
                <div className="w-[180px] h-[180px] mb-4 flex items-center justify-center">
                    <img
                        src="/hero-graphic.png"
                        alt="DIFM Hero"
                        className="w-full h-full object-contain drop-shadow-2xl"
                    />
                </div>

                {/* Sub-Hero Tagline */}
                <p className="text-white/50 text-sm font-medium tracking-wide mb-8 text-center">
                    Fixed Upfront Price. No Calling Around
                </p>

                {/* Main Modal Card */}
                <div className="w-full max-w-[400px] bg-[#121212] rounded-[32px] p-6 border border-white/5 shadow-2xl flex flex-col gap-6">

                    {/* Modal Heading */}
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-white leading-[1.2] mb-2">
                            Book trusted local pros.<br />
                            We handle everything
                        </h1>
                        <p className="text-white/40 text-xs">
                            Fix a leaking tap, paint a bedroom, clean a 1 bed flat...
                        </p>
                    </div>

                    {/* Search Bar - Dynamic Input */}
                    <div className="w-full bg-[#1E1E20] border border-white/10 rounded-2xl h-[52px] flex items-center px-4 transition-colors focus-within:border-blue-500/50">
                        <Search className="w-5 h-5 text-gray-500 mr-3" />
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What needs doing?"
                            className="bg-transparent text-white placeholder:text-gray-500 text-sm flex-1 outline-none"
                        />
                        <div className="flex items-center gap-3 pl-3 border-l border-white/10 ml-2">
                            <Mic className="w-4 h-4 text-gray-400 cursor-pointer hover:text-white transition-colors" onClick={() => handleMediaClick('mic')} />
                            <Camera className="w-4 h-4 text-gray-400 cursor-pointer hover:text-white transition-colors" onClick={() => handleMediaClick('camera')} />
                        </div>
                    </div>
                    {isTooShortForExtraction && (
                        <p className="text-[11px] text-blue-300/80 -mt-3 px-1">
                            Type a few more words to describe the job
                        </p>
                    )}

                    {/* Checklist */}
                    <div className="space-y-3.5 pl-1">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600/20 p-1 rounded-full"><CheckCircle className="w-4 h-4 text-blue-500" /></div>
                            <span className="text-white font-semibold text-sm">Vetted Local Pros</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600/20 p-1 rounded-full"><CheckCircle className="w-4 h-4 text-blue-500" /></div>
                            <div className="flex flex-col">
                                <span className="text-white font-semibold text-sm leading-none">Fixed Upfront Pricing</span>
                                <span className="text-white/30 text-[10px] mt-0.5">No Quotes</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600/20 p-1 rounded-full">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 w-4 h-4"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            </div>
                            <span className="text-white font-semibold text-sm">We handle no-shows, issues and disputes</span>
                        </div>
                    </div>

                    {/* Out of Scope Warning */}
                    {pricePreview?.warnings?.includes('OUT_OF_SCOPE') && (
                        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-[24px] p-4 text-yellow-200 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <span>⚠️</span>
                                <span>Service Not Available</span>
                            </div>
                            <div className="text-xs mb-3 text-yellow-100/80">
                                We don't currently offer "{description}". 
                                We specialize in home repairs, installations, and cleaning services.
                            </div>
                            <div className="text-xs">
                                <strong className="text-yellow-200">Available services:</strong>{' '}
                                {pricePreview?.suggestedServices?.join(', ') || 'Plumbing, Electrical, Handyman, Cleaning, Painting, TV Mounting, and more home services'}
                            </div>
                        </div>
                    )}

                    {/* Matrix clarifiers (from workbook) — before price or quote path */}
                    {showMatrixClarifiers && (
                        <div className="bg-white/[0.06] border border-white/15 rounded-[20px] p-4 text-white/90 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-2">
                            <p className="text-[11px] font-semibold text-white tracking-wide">We’ll confirm details with you</p>
                            <ul className="list-disc list-inside space-y-1.5 marker:text-blue-400/80">
                                {matrixClarifiers.map((c) => (
                                    <li key={c.tag || c.question} className="text-[11px] text-white/80 leading-snug pl-0.5">
                                        {typeof c.question === 'string' && c.question.trim() ? c.question : c.tag}
                                    </li>
                                ))}
                            </ul>
                            {showFixedPath ? (
                                <p className="text-[10px] text-white/45 pt-1">Price below reflects this scope — final lock at booking.</p>
                            ) : null}
                        </div>
                    )}

                    {/* Review / quote path (low confidence, commercial, multi-service, vague, etc.) */}
                    {(pricePreview || isPricingLoading) && showReviewPath && (
                        <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-[24px] p-4 text-emerald-50 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">
                            <div className="font-semibold text-sm flex items-center gap-2">
                                <span>✉️</span>
                                <span>Confirm & submit</span>
                            </div>
                            <p className="text-xs text-emerald-100/90 leading-relaxed">
                                {pricePreview?.clarifyMessage || REVIEW_QUOTE_MESSAGE}
                            </p>
                            <p className="text-[10px] text-emerald-200/70">
                                No upfront price is shown for this request — our team or a pro will follow up.
                            </p>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-[10px] font-medium text-emerald-200/80 block mb-1">
                                        Email <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        autoComplete="email"
                                        inputMode="email"
                                        value={quoteContactEmail}
                                        onChange={(e) => setQuoteContactEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-medium text-emerald-200/80 block mb-1">
                                        Phone number <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="tel"
                                        autoComplete="tel"
                                        inputMode="tel"
                                        value={quoteContactPhone}
                                        onChange={(e) => setQuoteContactPhone(e.target.value)}
                                        placeholder="+44 … or local number"
                                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/30"
                                    />
                                    <p className="text-[9px] text-emerald-200/50 mt-1">We’ll use this to reach you with your quote.</p>
                                </div>
                            </div>
                            <div
                                onClick={handleAddressClick}
                                className={`w-full h-[44px] rounded-[16px] flex items-center justify-center cursor-pointer text-sm font-semibold transition-colors ${selectedAddress ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/70'}`}
                            >
                                {selectedAddress || 'Add your address (required)'}
                            </div>
                        </div>
                    )}

                    {/* Upfront Price Card — high-confidence fixed path only */}
                    {(pricePreview || isPricingLoading) && showFixedPath && !blocksBookableQuote && (
                        <div className="bg-[#D9D9D9] rounded-[24px] p-4 text-black relative overflow-hidden mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex flex-col max-w-[70%]">
                                    <span className="text-[10px] font-bold text-black/70 uppercase tracking-wider">Upfront Price</span>
                                    <span className="text-[11px] font-semibold text-black/80 mt-1">
                                        {isPricingLoading ? 'Calculating...' : displayTitle}
                                    </span>
                                    {!isPricingLoading && subtitle && (
                                        <span className="text-[10px] text-black/65 mt-1">{subtitle}</span>
                                    )}
                                    {!isPricingLoading && qtySubtitle && (
                                        <span className="text-[10px] text-black/65 mt-1 font-medium">{qtySubtitle}</span>
                                    )}
                                    <span className="text-[10px] text-black/50">Price locked when you book</span>
                                </div>
                                <div className="text-right flex flex-col items-end shrink-0">
                                    <span className="text-[#007AFF] font-bold text-sm">
                                        {isPricingLoading ? '...' : (hasDisplayPrice ? `£${displayPrice.toFixed(2)}` : '')}
                                    </span>
                                    {!isPricingLoading && <span className="text-[#007AFF] text-[9px] font-bold cursor-pointer hover:underline">Change &gt;</span>}
                                </div>
                            </div>

                            {/* Pricing note — address lives on the top-left of the screen */}
                            <div className="w-full min-h-[48px] rounded-[16px] flex items-center justify-center px-3 bg-black/[0.06] border border-black/10">
                                <span className="font-bold text-sm text-black/80 text-center leading-snug">
                                    Final price after Scope Lock
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Primary actions — no dead end: always offer quote when review path applies */}
                <div className="mt-8 flex flex-col items-center gap-3 w-full max-w-[400px] px-4">
                    {showFixedPath && (
                        <Button
                            onClick={handleBookFixedClick}
                            disabled={!canAct || !hasDisplayPrice || !hasBookableVisits || !addressOk}
                            className={`w-full max-w-sm px-8 h-[56px] rounded-full flex items-center justify-center gap-2 transition-all ${!canAct || !hasDisplayPrice || !hasBookableVisits || !addressOk
                                ? 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                                : 'bg-[#007AFF] hover:bg-[#006ee6] text-white shadow-[0px_8px_30px_rgba(0,122,255,0.4)]'
                                }`}
                        >
                            <CheckCircle className="w-5 h-5" />
                            <span className="text-base font-bold">Book with fixed price</span>
                        </Button>
                    )}
                    {showReviewPath && (
                        <Button
                            onClick={handleQuoteSubmitClick}
                            disabled={!canAct || !addressOk || !quoteContactOk}
                            className="w-full max-w-sm px-8 h-[56px] rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span className="text-base font-bold">Submit for quote</span>
                        </Button>
                    )}
                </div>

                {/* Footer Info */}
                <div className="mt-12 text-center space-y-3">
                    <p className="text-white/40 text-xs font-medium">Don't Stress. Rest Assured. We'll do it for you.</p>
                    <div className="flex justify-center gap-4 text-[10px] text-white/40 font-medium">
                        <span className="cursor-pointer hover:text-white transition-colors">About Us</span>
                        <span className="cursor-pointer hover:text-white transition-colors">How It Works</span>
                        <span className="cursor-pointer hover:text-white transition-colors">FAQs</span>
                        <span className="cursor-pointer hover:text-white transition-colors">Trust & Safety</span>
                    </div>
                </div>

            </div>

            {/* Address Modal */}
            <AddressModal
                isOpen={isAddressModalOpen}
                onClose={() => setIsAddressModalOpen(false)}
                onSave={handleAddressSave}
            />
        </div>
    );
}

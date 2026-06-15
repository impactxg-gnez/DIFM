'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Search, Mic, Camera, CheckCircle, FileQuestion, ShieldAlert } from 'lucide-react';
import { AddressModal } from '@/components/AddressModal';
import { ReviewQuoteModal } from '@/components/ReviewQuoteModal';

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
    tap_leak_fix: 'Tap / Sink / Small plumbing',
    water_purifier_service: 'Water purifier service',
    water_purifier_repair: 'Water purifier repair',
    geyser_repair: 'Geyser / water heater repair',
    geyser_install: 'Geyser / water heater install',
    microwave_repair: 'Microwave repair',
    fridge_repair: 'Fridge repair',
    washing_machine_repair: 'Washing machine repair',
    thermostat_install: 'Thermostat install',
    door_lock_install: 'Door lock install',
    smart_lock_install: 'Smart lock install',
    door_repair: 'Door repair',
    window_repair: 'Window repair',
    curtain_repair: 'Curtain repair',
    cabinet_repair: 'Cabinet repair',
    replace_socket: 'Socket replacement',
    install_light_fitting: 'Ceiling light / fitting',
    install_ceiling_fan: 'Ceiling fan install',
    room_painting: 'Interior painting',
    ac_wall_unit_install: 'AC / split unit install',
    ac_unit_service: 'AC service',
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
    'MATRIX_V2_NO_MATCH',
    'MATRIX_V2_JOB_UNKNOWN',
    'COMMERCIAL_QUOTE_REQUIRED',
    'BUNDLE_COMPLEX_QUOTE_REQUIRED',
    'CONTRADICTION_CLARIFY',
    'PARTIAL_PARSE_CLARIFY',
    'BLOCKED_UNSUPPORTED',
    'REVIEW_QUOTE_LEAD',
]);

/** Show “add detail” banner (not custom-quote flow, not out-of-scope). */
const CLARIFY_LANDING_WARNINGS = new Set([
    'NEEDS_CLARIFICATION',
    'MATRIX_V2_NO_MATCH',
    'MATRIX_V2_JOB_UNKNOWN',
    'PARTIAL_PARSE_CLARIFY',
    'CONTRADICTION_CLARIFY',
]);

/** Landing "Request custom quote" — only bulk / commercial quantity paths (not general REVIEW_QUOTE routing). */
const COMMERCIAL_QUOTE_LANDING_WARNINGS = new Set([
    'COMMERCIAL_QUOTE_REQUIRED',
    'COMMERCIAL_BULK',
    'HIGH_QUANTITY',
    'MATRIX_V2_QUANTITY_REVIEW',
    'MATRIX_V2_COMMERCIAL_CLEAN',
    'MATRIX_V2_COMMERCIAL_PAINT',
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
    const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
    const [selectedAddress, setSelectedAddress] = useState('');
    const [selectedLabel, setSelectedLabel] = useState<string | undefined>(undefined);
    const [quoteContactEmail, setQuoteContactEmail] = useState('');
    const [quoteContactPhone, setQuoteContactPhone] = useState('');

    // Debounce description input — wait for a pause before pricing preview (avoids mid-typing commercial flashes).
    useEffect(() => {
        const timer = setTimeout(() => {
            const normalized = description.trim();
            // Stability guard: do not trigger extraction for very short partial input.
            setDebouncedDesc(normalized.length >= 6 ? normalized : '');
        }, 750);
        return () => clearTimeout(timer);
    }, [description]);

    // Fetch Price Prediction (silent clarifier hydration — no inputs on landing page)
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
                    body: JSON.stringify({
                        category: 'HANDYMAN',
                        description: debouncedDesc,
                    }),
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

    const handleMediaClick = (_type: 'mic' | 'camera') => {
        // Coming soon — no alert
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
    const isBlockedSafety =
        routing === 'REJECT' || previewWarnings.some((w) => w === 'BLOCKED_UNSUPPORTED');
    const quoteRequestAllowed = pricePreview?.canSubmitQuoteRequest !== false;
    /** Preview is for the text in the box now — not an in-flight or stale debounced fetch. */
    const previewStableForCurrentInput =
        !isPricingLoading &&
        trimmedDescription.length >= 6 &&
        trimmedDescription === debouncedDesc;
    const needsCommercialQuoteOnLanding =
        previewStableForCurrentInput &&
        previewWarnings.some((w) => COMMERCIAL_QUOTE_LANDING_WARNINGS.has(w));
    const needsIntentLeadForReview =
        previewStableForCurrentInput &&
        previewWarnings.some((w) => w === 'REVIEW_QUOTE_LEAD') &&
        routing === 'REVIEW_QUOTE' &&
        quoteRequestAllowed &&
        !isBlockedSafety;
    const prioritizeLeadOverClarify =
        needsIntentLeadForReview && !needsCommercialQuoteOnLanding && !isOut;
    const showClarifyOnLanding =
        previewStableForCurrentInput &&
        pricePreview != null &&
        !isOut &&
        !needsCommercialQuoteOnLanding &&
        !prioritizeLeadOverClarify &&
        previewWarnings.some((w) => CLARIFY_LANDING_WARNINGS.has(String(w)));
    const clarifyBannerText =
        typeof pricePreview?.clarifyMessage === 'string' && pricePreview.clarifyMessage.trim()
            ? pricePreview.clarifyMessage.trim()
            : 'Please add more detail about the task so we can match it to a priced home service.';
    /** Fixed banner: show estimate when not blocked — even if API uses REVIEW_QUOTE routing for matrix bookkeeping. */
    const showFixedPath =
        previewStableForCurrentInput &&
        !isOut &&
        !isBlockedSafety &&
        !needsCommercialQuoteOnLanding &&
        !needsIntentLeadForReview &&
        hasDisplayPrice &&
        hasBookableVisits &&
        !blocksBookableQuote &&
        (pricePreview?.bookable === true ||
            routing === 'FIXED_PRICE' ||
            routing === 'REVIEW_QUOTE' ||
            routing == null);
    /** Review / quote banner + CTA — user opens the modal explicitly (no auto-popup). */
    const showReviewPath =
        !isOut &&
        !isBlockedSafety &&
        pricePreview != null &&
        routing === 'REVIEW_QUOTE' &&
        (needsCommercialQuoteOnLanding || needsIntentLeadForReview);
    const addressOk = Boolean(selectedAddress?.trim());
    const quoteEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quoteContactEmail.trim());
    const quotePhoneDigits = quoteContactPhone.replace(/\D/g, '');
    const quotePhoneOk = quotePhoneDigits.length >= 8 && quotePhoneDigits.length <= 15;
    const quoteContactOk = quoteEmailOk && quotePhoneOk;
    const canAct = !isTooShortForExtraction && description.trim().length > 0;
    if (pricePreview && showFixedPath && !hasDisplayPrice) {
        console.error('Missing backend display_price', pricePreview);
    }

    const reviewQuoteBannerBody = needsCommercialQuoteOnLanding
        ? 'This looks like a large commercial or high-quantity job. Share your details and we’ll follow up with a quote.'
        : "We couldn’t match this to an instant fixed-price task. Share your details and our team will review and send a quote.";

    return (
        <div className="relative w-full min-h-screen font-sans text-white overflow-x-hidden">

            {/* Header: Auto-detected location (top left); tap opens address modal */}
            <div className="fixed top-8 left-4 sm:left-6 z-50 max-w-[min(85vw,280px)]">
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
                <div className="fixed top-8 right-6 z-50">
                    <button
                        onClick={onLoginClick}
                        className="flex items-center justify-center px-6 py-2 h-[44px] bg-white/5 border border-white/10 rounded-full backdrop-blur-md hover:bg-white/10 transition-all font-semibold text-sm text-white/80 tracking-wide"
                    >
                        Login
                    </button>
                </div>
            )}

            {/* Scrollable Main Content Wrapper */}
            {/* pt-[168px] on mobile: address chip is fixed ~64px tall + 8px top = 72px; hero graphic is ~120px; give 168px total clearance so logo always clears the chip */}
            <div className="relative z-10 w-full flex flex-col items-center pt-[168px] sm:pt-[120px] pb-32 px-4 md:px-0">

                {/* Hero Graphic — smaller on mobile so it doesn't crowd the address chip */}
                <div className="w-[140px] h-[140px] sm:w-[180px] sm:h-[180px] mb-4 flex items-center justify-center">
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

                    {/* Unsafe / unsupported — cannot request quote */}
                    {previewStableForCurrentInput && isBlockedSafety && (
                        <div className="bg-red-950/50 border border-red-500/40 rounded-[24px] p-4 text-red-100 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="font-semibold text-sm mb-2 flex items-center gap-2 text-red-300">
                                <ShieldAlert className="w-4 h-4 shrink-0" />
                                <span>{`Can't proceed with this request`}</span>
                            </div>
                            <div className="text-xs leading-relaxed text-red-100/85">
                                {typeof pricePreview?.clarifyMessage === 'string' && pricePreview.clarifyMessage.trim()
                                    ? pricePreview.clarifyMessage.trim()
                                    : 'That type of request isn’t something we can book through the app.'}
                            </div>
                        </div>
                    )}

                    {/* No match / need more detail — priced home tasks only */}
                    {showClarifyOnLanding && (
                        <div className="bg-blue-600/15 border border-blue-500/35 rounded-[24px] p-4 text-blue-50 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="font-semibold text-sm mb-2 flex items-center gap-2 text-blue-200">
                                <FileQuestion className="w-4 h-4 shrink-0" />
                                <span>Need a bit more detail</span>
                            </div>
                            <p className="text-xs text-blue-100/85 leading-relaxed">{clarifyBannerText}</p>
                        </div>
                    )}
                    {previewStableForCurrentInput && pricePreview?.warnings?.includes('OUT_OF_SCOPE') && (
                        <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-[24px] p-4 text-yellow-200 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="font-semibold text-sm mb-2 flex items-center gap-2">
                                <span>⚠️</span>
                                <span>Service Not Available</span>
                            </div>
                            <div className="text-xs mb-3 text-yellow-100/80">
                                We don't currently offer "{description}". We specialize in home repairs, installations, and cleaning
                                services.
                            </div>
                            <div className="text-xs">
                                <strong className="text-yellow-200">Available services:</strong>{' '}
                                {pricePreview?.suggestedServices?.join(', ') ||
                                    'Plumbing, Electrical, Handyman, Cleaning, Painting, TV Mounting, and more home services'}
                            </div>
                        </div>
                    )}

                    {/* Review / custom-quote banner — shown instead of fixed price card */}
                    {(pricePreview || isPricingLoading) && showReviewPath && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-[24px] p-4 text-amber-50 mt-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="font-semibold text-sm flex items-center gap-2 mb-2">
                                <FileQuestion className="w-4 h-4 text-amber-400" />
                                <span className="text-amber-300">Custom Quote Required</span>
                            </div>
                            <p className="text-xs text-amber-100/80 leading-relaxed mb-3">
                                {reviewQuoteBannerBody}
                            </p>
                            <button
                                onClick={() => setIsReviewModalOpen(true)}
                                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors"
                            >
                                Request Custom Quote →
                            </button>
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
                                    <span className="text-[10px] text-black/50">Price locked when you book</span>
                                </div>
                                <div className="text-right flex flex-col items-end shrink-0">
                                    <span className="text-[#007AFF] font-bold text-sm">
                                        {isPricingLoading ? '...' : (hasDisplayPrice ? `£${displayPrice.toFixed(2)}` : '')}
                                    </span>
                                    {!isPricingLoading && <span className="text-[#007AFF] text-[9px] font-bold cursor-pointer hover:underline">Change &gt;</span>}
                                </div>
                            </div>

                            <div className="w-full min-h-[48px] rounded-[16px] flex items-center justify-center px-3 bg-black/[0.06] border border-black/10 mt-4">
                                <span className="font-bold text-sm text-black/80 text-center leading-snug">
                                    You’ll confirm scope and details on the next screen
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Primary CTA */}
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
                            onClick={() => setIsReviewModalOpen(true)}
                            disabled={!canAct}
                            className="w-full max-w-sm px-8 h-[56px] rounded-full bg-amber-500 hover:bg-amber-400 text-black flex items-center justify-center gap-2 font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_8px_24px_rgba(245,158,11,0.35)]"
                        >
                            <FileQuestion className="w-5 h-5" />
                            <span className="text-base font-bold">Request Custom Quote</span>
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

            {/* Review / Custom Quote Modal */}
            <ReviewQuoteModal
                isOpen={isReviewModalOpen}
                onClose={() => setIsReviewModalOpen(false)}
                rawInput={description}
                detectedJob={
                    Array.isArray(pricePreview?.finalJobs) && pricePreview.finalJobs.length > 0
                        ? pricePreview.finalJobs[0]
                        : undefined
                }
                parsedEntities={pricePreview?.quantitiesByJob ?? undefined}
                quantity={
                    (() => {
                        const qb = pricePreview?.quantitiesByJob;
                        if (!qb || typeof qb !== 'object') return 1;
                        const ids = Array.isArray(pricePreview?.finalJobs) ? pricePreview.finalJobs : [];
                        const only = ids.length === 1 ? qb[ids[0]!] : undefined;
                        if (typeof only === 'number') return only;
                        const vals = Object.values(qb).filter((n) => typeof n === 'number') as number[];
                        return vals[0] ?? 1;
                    })()
                }
                estimatedMinutes={
                    Array.isArray(pricePreview?.visits)
                        ? pricePreview.visits.reduce(
                              (acc: number, v: { total_minutes?: number }) =>
                                  acc + (Number(v?.total_minutes) || 0),
                              0,
                          )
                        : 0
                }
                confidenceScore={typeof pricePreview?.confidence === 'number' ? pricePreview.confidence : 0}
                numericIntentConfidence={pricePreview?.numericIntentConfidence}
                confidenceLabel={pricePreview?.intentConfidence ?? null}
                inferredCategory={pricePreview?.inferredCategory ?? null}
                parserStageUsed={pricePreview?.parserStageUsed ?? null}
            />
        </div>
    );
}

import Script from 'next/script';

export function GoogleMapsLoader() {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        console.error('❌ NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set in environment variables!');
        return null;
    }

    console.log('🔑 Loading Google Maps with API key:', apiKey.substring(0, 10) + '...');

    return (
        <Script
            src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`}
            strategy="afterInteractive"
            onLoad={() => {
                console.log('✅ Google Maps script loaded successfully');
                console.log('   - window.google exists:', !!window.google);
                console.log('   - google.maps exists:', !!window.google?.maps);
                console.log('   - google.maps.places exists:', !!window.google?.maps?.places);
            }}
            onError={(e) => {
                console.error('❌ Failed to load Google Maps script');
                console.error('   Error:', e);
                console.error('   Check: 1) API key is valid, 2) Places API is enabled, 3) Billing is enabled');
            }}
        />
    );
}

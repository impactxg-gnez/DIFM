import Script from 'next/script';

export function GoogleMapsLoader() {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        console.warn('Google Maps API key not found. Location picker will not work.');
        return null;
    }

    return (
        <Script
            src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`}
            strategy="lazyOnload"
        />
    );
}

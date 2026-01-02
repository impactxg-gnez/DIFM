'use client';

import { useEffect, useRef } from 'react';

interface UserLocationMapProps {
    latitude: number;
    longitude: number;
}

export function UserLocationMap({ latitude, longitude }: UserLocationMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const userMarker = useRef<any>(null);

    useEffect(() => {
        const loadLeaflet = async () => {
            if (!(window as any).L) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(link);

                const script = document.createElement('script');
                script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                script.onload = () => initMap();
                document.head.appendChild(script);
            } else {
                initMap();
            }
        };

        const initMap = () => {
            if (!mapRef.current || mapInstance.current) return;

            const L = (window as any).L;
            // Default view centered on user
            mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView([latitude, longitude], 15);

            L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM'
            }).addTo(mapInstance.current);

            // User Marker (Blue with pulsing effect via CSS if we wanted, but standard is fine for now)
            userMarker.current = L.circleMarker([latitude, longitude], { 
                color: '#2563eb', // blue-600
                fillColor: '#3b82f6', // blue-500
                fillOpacity: 0.7, 
                radius: 8, 
                weight: 2 
            }).addTo(mapInstance.current)
                .bindPopup('You are here');
        };

        loadLeaflet();

        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    // Update marker when props change
    useEffect(() => {
        const L = (window as any).L;
        if (L && mapInstance.current && userMarker.current) {
            const newLatLng = [latitude, longitude];
            userMarker.current.setLatLng(newLatLng);
            mapInstance.current.setView(newLatLng);
        }
    }, [latitude, longitude]);

    return (
        <div className="w-full h-[200px] rounded-lg overflow-hidden border border-gray-200 shadow-sm relative z-0">
             <div ref={mapRef} className="w-full h-full" />
             <div className="absolute bottom-2 right-2 z-[1000] bg-white/90 px-2 py-1 rounded text-[10px] shadow-sm text-gray-600 font-medium">
                Location Verification
             </div>
        </div>
    );
}

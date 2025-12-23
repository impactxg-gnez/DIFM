
'use client';

import { useEffect, useRef, useState } from 'react';

interface ProviderMapProps {
    providerLat: number;
    providerLon: number;
    jobLat: number;
    jobLon: number;
    showRoute?: boolean;
}

export function ProviderMap({ providerLat, providerLon, jobLat, jobLon, showRoute = false }: ProviderMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<any>(null);
    const providerMarker = useRef<any>(null);
    const polyline = useRef<any>(null);
    const [eta, setEta] = useState<number | null>(null);

    // Calculate ETA (Simulated: Distance / 40km/h avg speed)
    const updateETA = () => {
        const R = 6371; // km
        const dLat = (jobLat - providerLat) * Math.PI / 180;
        const dLon = (jobLon - providerLon) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(providerLat * Math.PI / 180) * Math.cos(jobLat * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;
        const minutes = Math.round((distance / 40) * 60) + 2; // +2 mins overhead
        setEta(minutes);
    };

    useEffect(() => {
        updateETA();
    }, [providerLat, providerLon]);

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
            mapInstance.current = L.map(mapRef.current, { zoomControl: false }).setView([jobLat, jobLon], 13);

            L.tileLayer('https://{s}.tile.osm.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OSM'
            }).addTo(mapInstance.current);

            // Job Marker (Red)
            L.circleMarker([jobLat, jobLon], { color: '#ef4444', radius: 8, fillOpacity: 0.9, weight: 1 }).addTo(mapInstance.current)
                .bindPopup('Destination');

            // Provider Marker (Blue)
            providerMarker.current = L.circleMarker([providerLat, providerLon], { color: '#3b82f6', radius: 10, fillOpacity: 0.9, weight: 1 }).addTo(mapInstance.current)
                .bindPopup('Provider');

            // Route
            if (showRoute) {
                polyline.current = L.polyline([[providerLat, providerLon], [jobLat, jobLon]], {
                    color: '#3b82f6',
                    weight: 3,
                    dashArray: '5, 10',
                    opacity: 0.6
                }).addTo(mapInstance.current);
            }

            // Fit bounds
            const group = new L.featureGroup([
                L.marker([jobLat, jobLon]),
                L.marker([providerLat, providerLon])
            ]);
            mapInstance.current.fitBounds(group.getBounds().pad(0.3));
        };

        loadLeaflet();

        return () => {
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const L = (window as any).L;
        if (L) {
            if (providerMarker.current) {
                providerMarker.current.setLatLng([providerLat, providerLon]);
            }
            if (polyline.current) {
                polyline.current.setLatLngs([[providerLat, providerLon], [jobLat, jobLon]]);
            }
        }
    }, [providerLat, providerLon]);

    return (
        <div className="w-full h-[350px] rounded-xl overflow-hidden border border-gray-100 shadow-inner relative group">
            <div ref={mapRef} className="w-full h-full grayscale-[0.2]" />

            {/* ETA Overlay */}
            {eta !== null && (
                <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-blue-50 flex flex-col gap-0.5 pointer-events-none">
                    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Estimated Arrival</span>
                    <span className="text-xl font-black text-slate-900">{eta} mins</span>
                </div>
            )}

            <div className="absolute bottom-4 right-4 z-[1000] bg-slate-900/80 backdrop-blur-sm px-3 py-1.5 rounded-full text-[10px] font-medium text-white flex gap-3">
                <span className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
                    Provider
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                    <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
                    Job
                </span>
            </div>
        </div>
    );
}

/** Minimum move before re-persisting when stored location is already GPS-accurate. */
export const LOCATION_PERSIST_MIN_MOVE_M = 10;

/** Stored vs GPS drift above this → treat as stale seed / placeholder coords. */
export const STALE_LOCATION_DRIFT_M = 500;

/** Normal max accuracy to accept GPS fixes. */
export const GPS_ACCURACY_MAX_M = 100;

/** Relaxed accuracy when replacing a missing or stale stored location. */
export const GPS_ACCURACY_STALE_MAX_M = 2000;

export function haversineDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function haversineDistanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
): number {
    return haversineDistanceMeters(lat1, lon1, lat2, lon2) / 1000;
}

function hasStoredCoords(storedLat?: number | null, storedLng?: number | null): boolean {
    return (
        storedLat != null &&
        storedLng != null &&
        Number.isFinite(storedLat) &&
        Number.isFinite(storedLng)
    );
}

/**
 * Decide whether a GPS fix should overwrite the provider's stored coordinates.
 * Service area text is never used here — only live GPS vs last persisted coords.
 */
export function shouldPersistProviderLocation(args: {
    storedLat?: number | null;
    storedLng?: number | null;
    gpsLat: number;
    gpsLng: number;
    accuracyM: number;
}): boolean {
    const { storedLat, storedLng, gpsLat, gpsLng, accuracyM } = args;

    if (!Number.isFinite(gpsLat) || !Number.isFinite(gpsLng)) {
        return false;
    }

    const hasStored = hasStoredCoords(storedLat, storedLng);

    if (!hasStored) {
        return accuracyM <= GPS_ACCURACY_STALE_MAX_M;
    }

    const driftM = haversineDistanceMeters(storedLat!, storedLng!, gpsLat, gpsLng);
    const isStaleStored = driftM >= STALE_LOCATION_DRIFT_M;

    if (isStaleStored) {
        return accuracyM <= GPS_ACCURACY_STALE_MAX_M;
    }

    if (accuracyM > GPS_ACCURACY_MAX_M) {
        return false;
    }

    return driftM >= LOCATION_PERSIST_MIN_MOVE_M;
}

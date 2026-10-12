/**
 * Haversine formula for calculating high-precision distance between GPS coordinates in meters.
 */
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters}m`;
  }
  return `${(meters / 1000).toFixed(2)}km`;
}

export function verifyGeofence(
  userLat?: number,
  userLon?: number,
  targetLat?: number,
  targetLon?: number,
  maxRadiusMeters = 150
): {
  valid: boolean;
  distanceMeters: number;
  formattedDistance: string;
  error?: string;
} {
  if (userLat === undefined || userLon === undefined) {
    return {
      valid: false,
      distanceMeters: -1,
      formattedDistance: 'Unknown',
      error: 'GPS location is required. Please enable location permissions on your phone to clock in.',
    };
  }

  if (targetLat === undefined || targetLon === undefined) {
    return {
      valid: true,
      distanceMeters: 0,
      formattedDistance: '0m',
    };
  }

  const distance = getDistanceMeters(userLat, userLon, targetLat, targetLon);
  const formatted = formatDistance(distance);

  if (distance > maxRadiusMeters) {
    return {
      valid: false,
      distanceMeters: distance,
      formattedDistance: formatted,
      error: `Location Restriction: You are ${formatted} away from the workplace. Clock-in is only allowed at the designated workplace location (within ${maxRadiusMeters}m).`,
    };
  }

  return {
    valid: true,
    distanceMeters: distance,
    formattedDistance: formatted,
  };
}

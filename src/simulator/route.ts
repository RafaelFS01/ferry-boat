export interface Coordinates { readonly latitude: number; readonly longitude: number }

export const SAO_JOAQUIM: Coordinates = Object.freeze({ latitude: -12.9482, longitude: -38.5028 });
export const BOM_DESPACHO: Coordinates = Object.freeze({ latitude: -12.9774, longitude: -38.5724 });
export const KNOT_IN_METERS_PER_SECOND = 1852 / 3600;
const EARTH_RADIUS_METERS = 6371000;
const radians = (degrees: number): number => degrees * Math.PI / 180;
const degrees = (angle: number): number => angle * 180 / Math.PI;

export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const lat1 = radians(from.latitude);
  const lat2 = radians(to.latitude);
  const a = Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(radians(to.longitude - from.longitude) / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function bearingDegrees(from: Coordinates, to: Coordinates): number {
  const lat1 = radians(from.latitude);
  const lat2 = radians(to.latitude);
  const delta = radians(to.longitude - from.longitude);
  return (degrees(Math.atan2(Math.sin(delta) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta))) + 360) % 360;
}

export function destination(from: Coordinates, bearing: number, meters: number): Coordinates {
  const angular = meters / EARTH_RADIUS_METERS;
  const heading = radians(bearing);
  const lat1 = radians(from.latitude);
  const lon1 = radians(from.longitude);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) +
    Math.cos(lat1) * Math.sin(angular) * Math.cos(heading));
  const lon2 = lon1 + Math.atan2(Math.sin(heading) * Math.sin(angular) * Math.cos(lat1),
    Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return { latitude: degrees(lat2), longitude: ((degrees(lon2) + 540) % 360) - 180 };
}

export const ROUTE_DISTANCE_METERS = distanceMeters(SAO_JOAQUIM, BOM_DESPACHO);

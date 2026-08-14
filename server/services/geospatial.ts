export interface Coordinate {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_METERS = 6_371_000

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = toRadians(b.latitude - a.latitude)
  const longitudeDelta = toRadians(b.longitude - a.longitude)
  const firstLatitude = toRadians(a.latitude)
  const secondLatitude = toRadians(b.latitude)
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine))
}

export function sortByDistance<T extends Coordinate>(origin: Coordinate, items: T[]) {
  return items
    .map((item) => ({ ...item, distanceMeters: Math.round(distanceMeters(origin, item)) }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
}

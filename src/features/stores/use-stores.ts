import { useQuery } from '@tanstack/react-query'
import { usesFirebaseEmulators } from '@/lib/firebase'
import { fetchLocalStores, NEARBY_RADIUS_KM } from './store-repository'
import type { MapPoint } from '@/features/map/map-config'

export function useStores(center: MapPoint) {
  const query = useQuery({
    queryKey: [
      'stores',
      'emulator',
      'demo-toilet-map',
      center.lat,
      center.lng,
      NEARBY_RADIUS_KM,
    ],
    queryFn: () => fetchLocalStores(center),
    enabled: usesFirebaseEmulators,
  })
  return { ...query, enabled: usesFirebaseEmulators }
}

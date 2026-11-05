import { AdvancedMarker } from '@vis.gl/react-google-maps'
import { MapMarkerPin } from '../map/map-marker-pin'
import { availabilityLabels, type Store } from './store-schema'

export function StoreMarkers({
  stores,
  selectedId,
  onSelect,
}: {
  stores: Store[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return stores.map((store) => (
    <AdvancedMarker
      key={store.id}
      position={store.location}
      title={`${store.name}・${availabilityLabels[store.availability]}`}
      onClick={() => onSelect(store.id)}
      zIndex={store.id === selectedId ? 10 : 1}
    >
      <MapMarkerPin selected={store.id === selectedId} registered />
    </AdvancedMarker>
  ))
}

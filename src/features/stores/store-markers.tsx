import { AdvancedMarker } from '@vis.gl/react-google-maps'
import { MapMarkerPin } from '../map/map-marker-pin'
import { availabilityLabels, type Store } from './store-schema'

export function StoreMarkers({
  stores,
  onSelect,
}: {
  stores: Store[]
  onSelect: (id: string) => void
}) {
  return stores.map((store) => (
    <AdvancedMarker
      key={store.id}
      position={store.location}
      title={`${store.name}・${availabilityLabels[store.availability]}`}
      onClick={() => onSelect(store.id)}
      zIndex={1}
    >
      <MapMarkerPin name={store.name} />
    </AdvancedMarker>
  ))
}

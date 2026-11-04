import { AdvancedMarker, Pin } from '@vis.gl/react-google-maps'
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
      <Pin
        scale={store.id === selectedId ? 1.3 : 1}
        background={store.id === selectedId ? '#164532' : '#ffffff'}
        borderColor="#216047"
        glyphColor={store.id === selectedId ? '#ffffff' : '#216047'}
      />
    </AdvancedMarker>
  ))
}

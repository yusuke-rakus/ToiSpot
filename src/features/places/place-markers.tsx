import { AdvancedMarker } from '@vis.gl/react-google-maps'
import { MapMarkerPin } from '../map/map-marker-pin'
import { registrationLabels, type MapEntry } from './map-entries'

export function PlaceMarkers({
  entries,
  selectedId,
  onSelect,
}: {
  entries: MapEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return entries
    .filter((entry) => !entry.store && entry.place)
    .map((entry) => (
      <AdvancedMarker
        key={entry.key}
        position={entry.location}
        title={`${entry.name}・${registrationLabels[entry.registration]}`}
        onClick={() => onSelect(entry.place!.id)}
        zIndex={entry.place!.id === selectedId ? 10 : 0}
      >
        <MapMarkerPin
          selected={entry.place!.id === selectedId}
          registered={false}
        />
      </AdvancedMarker>
    ))
}

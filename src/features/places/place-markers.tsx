import { AdvancedMarker, Pin } from '@vis.gl/react-google-maps'
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
        <Pin
          scale={entry.place!.id === selectedId ? 1.3 : 1}
          background="#9ca3af"
          borderColor="#6b7280"
          glyphColor="#ffffff"
        />
      </AdvancedMarker>
    ))
}

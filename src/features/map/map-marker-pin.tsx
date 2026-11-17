import { classifyChain } from '../search/search-filters'

export function MapMarkerPin({
  name,
  selected,
  neutral = false,
}: {
  name: string
  selected: boolean
  neutral?: boolean
}) {
  const directory = neutral ? 'icons/map-pins/neutral' : 'icons/map-pins'
  const chain = classifyChain(name)
  const filename = chain === 'other' ? 'convenience-store.svg' : `${chain}.svg`
  return (
    <img
      className="map-marker-pin"
      data-selected={selected}
      src={`${import.meta.env.BASE_URL}${directory}/${filename}`}
      width="28"
      height="36"
      alt=""
      draggable={false}
    />
  )
}

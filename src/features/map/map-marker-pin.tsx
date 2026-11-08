function pinFilename(name: string) {
  const normalized = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{Dash}]/gu, '')
  if (/^(セブンー?イレブン|7eleven|seveneleven)/.test(normalized))
    return 'seven-eleven.svg'
  if (/^(ローソン|lawson)/.test(normalized)) return 'lawson.svg'
  if (/^(ファミリーマート|familymart)/.test(normalized)) return 'familymart.svg'
  return 'convenience-store.svg'
}

export function MapMarkerPin({
  name,
  selected,
}: {
  name: string
  selected: boolean
}) {
  return (
    <img
      className="map-marker-pin"
      data-selected={selected}
      src={`${import.meta.env.BASE_URL}icons/map-pins/${pinFilename(name)}`}
      width="28"
      height="36"
      alt=""
      draggable={false}
    />
  )
}

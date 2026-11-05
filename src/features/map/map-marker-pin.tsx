export function MapMarkerPin({
  selected,
  registered,
}: {
  selected: boolean
  registered: boolean
}) {
  return (
    <svg
      className="map-marker-pin"
      data-selected={selected}
      data-registered={registered}
      width="28"
      height="38"
      viewBox="0 0 28 38"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M14 37C11 30 1 24 1 14a13 13 0 0 1 26 0c0 10-10 16-13 23Z"
        fill="currentColor"
      />
      <circle cx="14" cy="14" r="5" />
    </svg>
  )
}

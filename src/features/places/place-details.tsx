import { Button } from '@/components/ui/button'
import { registrationLabels, type MapEntry } from './map-entries'

export function PlaceDetails({
  entry,
  canManage,
  onRegister,
}: {
  entry: MapEntry
  canManage: boolean
  onRegister: () => void
}) {
  const place = entry.place!
  return (
    <article className="map-panel-enter" aria-label="コンビニの詳細">
      <div className="space-y-2 border-l-2 border-muted pl-3">
        <p className="text-xs text-muted-foreground">Google Maps の店舗情報</p>
        <h3 className="text-lg leading-7 font-semibold">{place.name}</h3>
        <p className="text-xs leading-6 text-muted-foreground">
          {place.address}
        </p>
        {place.attributions.map((attribution, index) => (
          <p key={index} className="text-xs text-muted-foreground">
            {attribution.uri && /^https?:\/\//.test(attribution.uri) ? (
              <a
                href={attribution.uri}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {attribution.provider}
              </a>
            ) : (
              attribution.provider
            )}
          </p>
        ))}
      </div>
      <p role="status" className="mt-6 text-sm font-medium">
        トイレ情報：{registrationLabels[entry.registration]}
      </p>
      {canManage && entry.registration === 'missing' && (
        <div className="mt-5 space-y-3">
          <Button className="w-full" onClick={onRegister}>
            トイレ情報を登録
          </Button>
        </div>
      )}
    </article>
  )
}

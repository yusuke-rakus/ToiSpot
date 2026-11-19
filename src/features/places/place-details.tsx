import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { registrationLabels, type MapEntry } from './map-entries'

export function PlaceDetails({
  entry,
  directionsAction,
  canManage,
  canRegister = canManage,
  registering = false,
  onRegister,
}: {
  entry: MapEntry
  directionsAction?: ReactNode
  canManage: boolean
  canRegister?: boolean
  registering?: boolean
  onRegister: () => void
}) {
  const place = entry.place!
  return (
    <article className="map-panel-enter" aria-label="コンビニの詳細">
      <div className="space-y-2 border-l-2 border-muted pl-3">
        <p className="text-xs text-muted-foreground">Google Maps の店舗情報</p>
        <h3 className="text-lg leading-6 font-semibold wrap-anywhere max-lg:pr-10">
          {place.name}
        </h3>
        <p className="text-xs leading-5 wrap-anywhere text-muted-foreground">
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
      <p role="status" className="mt-3 text-sm font-medium">
        トイレ情報：{registrationLabels[entry.registration]}
      </p>
      {directionsAction}
      {canRegister && entry.registration === 'missing' && (
        <div className="mt-5 space-y-3">
          <Button
            variant="outline"
            className="w-full"
            onClick={onRegister}
            disabled={registering}
          >
            {canManage ? 'トイレ情報を登録' : '登録を申請'}
          </Button>
        </div>
      )}
    </article>
  )
}

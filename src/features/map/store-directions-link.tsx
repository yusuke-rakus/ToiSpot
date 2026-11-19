import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MapPoint } from './map-config'

export function StoreDirectionsLink({
  location,
  placeId,
}: {
  location: MapPoint
  placeId: string
}) {
  const url = new URL('https://www.google.com/maps/dir/')
  url.searchParams.set('api', '1')
  url.searchParams.set('destination', `${location.lat},${location.lng}`)
  url.searchParams.set('destination_place_id', placeId)

  return (
    <Button asChild className="h-11 w-full">
      <a href={url.href} target="_blank" rel="noopener noreferrer">
        Google マップで経路を見る
        <ArrowUpRight aria-hidden="true" data-icon="inline-end" />
      </a>
    </Button>
  )
}

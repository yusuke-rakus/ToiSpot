import type { ComponentProps } from 'react'
import { Popover as Primitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export const Popover = Primitive.Root
export const PopoverTrigger = Primitive.Trigger
export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align={align}
        sideOffset={sideOffset}
        data-map-filter-popover=""
        className={cn(
          'z-50 w-80 max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg outline-none',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}

import type { ComponentProps } from 'react'
import { Tooltip as Primitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export const TooltipProvider = Primitive.Provider
export const Tooltip = Primitive.Root
export const TooltipTrigger = Primitive.Trigger
export function TooltipContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}

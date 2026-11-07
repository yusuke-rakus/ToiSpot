import type { ComponentProps } from 'react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'

const Sheet = SheetPrimitive.Root
const SheetTitle = SheetPrimitive.Title

// shadcn/ui の Radix Sheet の下端バリエーション。
function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-30 bg-black/10"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side="bottom"
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-xl border-t bg-popover text-popover-foreground shadow-lg outline-none data-open:animate-in data-open:slide-in-from-bottom-full data-open:duration-200 motion-reduce:animate-none',
          className,
        )}
        {...props}
      >
        <SheetPrimitive.Close asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-3"
            aria-label="トイレ情報を閉じる"
          >
            <X aria-hidden="true" />
          </Button>
        </SheetPrimitive.Close>
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  )
}

export { Sheet, SheetContent, SheetTitle }

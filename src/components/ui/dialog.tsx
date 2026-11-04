import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { cn } from 'cn'

const Dialog = DialogPrimitive.Root
const DialogTitle = DialogPrimitive.Title
const DialogDescription = DialogPrimitive.Description

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/45 data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border bg-background shadow-xl outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
export { Dialog, DialogContent, DialogTitle, DialogDescription }

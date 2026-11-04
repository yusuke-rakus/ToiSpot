import { Toast } from 'radix-ui'
import { useState } from 'react'
import { useAdmin } from '@/features/auth/admin-provider'

export function Toaster() {
  const { message } = useAdmin()
  return message ? <ErrorToast key={message} message={message} /> : null
}

function ErrorToast({ message }: { message: string }) {
  const [open, setOpen] = useState(true)
  return (
    <Toast.Provider swipeDirection="right">
      <Toast.Root
        open={open}
        onOpenChange={setOpen}
        duration={6000}
        className="rounded-xl border border-destructive/30 bg-background p-4 text-foreground shadow-lg"
      >
        <Toast.Title className="font-semibold text-destructive">
          認証エラー
        </Toast.Title>
        <Toast.Description className="mt-2 text-sm leading-6">
          {message}
        </Toast.Description>
        <Toast.Close
          aria-label="通知を閉じる"
          className="mt-3 text-sm underline"
        >
          閉じる
        </Toast.Close>
      </Toast.Root>
      <Toast.Viewport className="fixed right-4 bottom-4 z-[100] w-[calc(100%-2rem)] max-w-sm outline-none" />
    </Toast.Provider>
  )
}

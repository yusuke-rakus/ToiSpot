import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAdmin } from '@/features/auth/admin-provider'
import { Toaster as Sonner } from './sonner'

export function Toaster() {
  const { message } = useAdmin()
  useEffect(() => {
    if (!message) return
    const id = toast.error('認証エラー', {
      description: message,
      duration: 6000,
    })
    return () => {
      toast.dismiss(id)
    }
  }, [message])
  return (
    <Sonner
      position="bottom-right"
      closeButton
      containerAriaLabel="通知"
      toastOptions={{ closeButtonAriaLabel: '通知を閉じる' }}
    />
  )
}

import { useRef, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
} from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogHeader,
  DialogFooter,
} from '@/components/ui/dialog'
import { useAdmin } from '@/features/auth/admin-provider'
import { errorCode } from '@/features/auth/auth-repository'
import {
  availabilityLabels,
  layoutLabels,
  storeInputSchema,
} from './store-schema'
import {
  storeFormDefaults,
  storeFormSchema,
  convenienceStoreTypes,
  registrationAvailability,
  type StoreFormValues,
  type StoreFormData,
} from './store-form-schema'
import {
  saveLocalStore,
  StoreConflictError,
  type StoreWriteTarget,
} from './store-writer'
import type { ConveniencePlace } from '../places/nearby-places'

type Props = {
  target: StoreWriteTarget
  place?: ConveniencePlace
  onClose: () => void
  onSaved: (id: string) => Promise<void>
}
const selectClass =
  'w-full [&_select]:h-10 [&_select]:text-base md:[&_select]:text-sm'

export function StoreEditor({ target, place, onClose, onSaved }: Props) {
  const admin = useAdmin()
  const [returnFocus] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  )
  const [message, setMessage] = useState<string | null>(null)
  const [discard, setDiscard] = useState(false)
  const submitting = useRef(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const mutation = useMutation({
    mutationFn: (input: StoreFormData) =>
      saveLocalStore(
        target,
        storeInputSchema.parse({
          ...input,
          location: target.original?.location ?? place?.location,
        }),
      ),
  })
  const form = useForm<StoreFormValues, unknown, StoreFormData>({
    resolver: zodResolver(storeFormSchema),
    defaultValues: storeFormDefaults(target.original, place),
  })
  const {
    register,
    formState: { errors, isDirty, isSubmitting },
  } = form
  const unknown = useWatch({ control: form.control, name: 'confirmedUnknown' })
  const saving = isSubmitting || mutation.isPending
  const allowed = admin.status === 'admin'
  function close() {
    if (submitting.current) return
    if (isDirty) setDiscard(true)
    else onClose()
  }
  async function submit(input: StoreFormData) {
    if (submitting.current || !allowed) return
    submitting.current = true
    setMessage(null)
    try {
      await mutation.mutateAsync(input)
      await onSaved(target.id)
    } catch (error) {
      setMessage(
        error instanceof StoreConflictError
          ? error.message
          : errorCode(error) === 'permission-denied'
            ? '保存する権限がありません。管理者設定とログイン状態を確認してください。'
            : '保存できませんでした。入力内容は保持しています。Emulatorの接続を確認して再試行してください。',
      )
      if (errorCode(error) === 'permission-denied') admin.refreshAccess()
    } finally {
      submitting.current = false
    }
  }
  function field(
    name: keyof StoreFormValues,
    label: string,
    control: ReactNode,
    hint?: string,
  ) {
    return (
      <Field data-invalid={!!errors[name]}>
        <FieldLabel htmlFor={`store-${name}`}>{label}</FieldLabel>
        {control}
        {hint && (
          <FieldDescription id={`hint-${name}`}>{hint}</FieldDescription>
        )}
        {errors[name] && (
          <FieldError id={`error-${name}`} role="alert">
            {errors[name]?.message}
          </FieldError>
        )}
      </Field>
    )
  }
  function attrs(name: keyof StoreFormValues) {
    return {
      id: `store-${name}`,
      'aria-invalid': !!errors[name],
      'aria-describedby': [
        errors[name] && `error-${name}`,
        name === 'confirmedDate' && `hint-${name}`,
      ]
        .filter(Boolean)
        .join(' '),
    }
  }
  function text(name: 'name' | 'address', label: string) {
    return field(
      name,
      label,
      <Input className="h-10" {...attrs(name)} {...register(name)} />,
    )
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent
        className="h-[90dvh] overflow-hidden"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          if (returnFocus?.isConnected) returnFocus.focus()
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          close()
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault()
          close()
        }}
      >
        <div className="flex shrink-0 items-start justify-between border-b px-5 py-4 sm:px-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {target.original ? '店舗を編集' : '店舗を登録'}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground">
              設備数の空欄は不明として扱います。
            </DialogDescription>
          </DialogHeader>
          <Button
            variant="ghost"
            size="icon"
            ref={closeButtonRef}
            aria-label="入力を閉じる"
            onClick={close}
            disabled={saving}
          >
            <X />
          </Button>
        </div>
        <form
          onSubmit={(event) => {
            void form.handleSubmit(submit)(event)
          }}
          noValidate
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <ScrollArea className="min-h-0 flex-1">
            <fieldset
              disabled={saving || !allowed}
              className="min-w-0 space-y-6 px-5 py-5 sm:px-6"
            >
              {text('name', '店名')}
              {field(
                'chainName',
                'コンビニの種類',
                <NativeSelect
                  className={selectClass}
                  {...attrs('chainName')}
                  {...register('chainName')}
                >
                  <NativeSelectOption value="" disabled>
                    選択してください
                  </NativeSelectOption>
                  {convenienceStoreTypes.map((type) => (
                    <NativeSelectOption key={type} value={type}>
                      {type}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>,
              )}
              {text('address', '住所')}
              {field(
                'availability',
                '貸出状況',
                <NativeSelect
                  className={selectClass}
                  {...attrs('availability')}
                  {...register('availability')}
                >
                  <NativeSelectOption value="" disabled>
                    選択してください
                  </NativeSelectOption>
                  {registrationAvailability.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {availabilityLabels[value]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>,
              )}
              {field(
                'genderLayout',
                '設備区分',
                <NativeSelect
                  className={selectClass}
                  {...attrs('genderLayout')}
                  {...register('genderLayout')}
                >
                  {Object.entries(layoutLabels).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>,
              )}
              <div className="grid grid-cols-2 gap-4">
                {(
                  [
                    ['male', '男性用個室（室）'],
                    ['female', '女性用個室（室）'],
                    ['shared', '共用個室（室）'],
                    ['urinals', '男性用小便器（基）'],
                  ] as const
                ).map(([name, label]) => (
                  <div key={name}>
                    {field(
                      name,
                      label,
                      <Input
                        className="h-10"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="不明"
                        {...attrs(name)}
                        {...register(name)}
                      />,
                    )}
                  </div>
                ))}
              </div>
              {field(
                'notes',
                '備考',
                <Textarea
                  className="min-h-20"
                  {...attrs('notes')}
                  {...register('notes')}
                />,
              )}
              <div className="space-y-3">
                <Field orientation="horizontal">
                  <Controller
                    name="confirmedUnknown"
                    control={form.control}
                    render={({ field }) => (
                      <Checkbox
                        id="store-confirmedUnknown"
                        name={field.name}
                        ref={field.ref}
                        checked={field.value}
                        onCheckedChange={(checked) =>
                          field.onChange(checked === true)
                        }
                        onBlur={field.onBlur}
                        disabled={saving || !allowed}
                      />
                    )}
                  />
                  <FieldLabel htmlFor="store-confirmedUnknown">
                    最終確認日は未確認
                  </FieldLabel>
                </Field>
                {field(
                  'confirmedDate',
                  '最終確認日',
                  <Input
                    className="h-10"
                    type="date"
                    disabled={unknown}
                    {...attrs('confirmedDate')}
                    {...register('confirmedDate')}
                  />,
                  '日付は日本時間として保存します。',
                )}
              </div>
            </fieldset>
          </ScrollArea>
          <div className="shrink-0 space-y-3 border-t px-5 py-4 sm:px-6">
            {!allowed && (
              <Alert variant="destructive">
                <AlertDescription>
                  管理者権限が確認できないため保存できません。入力内容は保持しています。
                </AlertDescription>
              </Alert>
            )}
            {message && (
              <Alert variant="destructive">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={close}
                disabled={saving}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={saving || !allowed}>
                {saving && <Spinner aria-hidden="true" />}
                {saving ? '保存中' : '保存する'}
              </Button>
            </DialogFooter>
          </div>
        </form>
        <AlertDialog open={discard} onOpenChange={setDiscard}>
          <AlertDialogContent
            onEscapeKeyDown={(event) => event.stopPropagation()}
            onCloseAutoFocus={(event) => {
              event.preventDefault()
              closeButtonRef.current?.focus()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>未保存の入力を破棄しますか？</AlertDialogTitle>
              <AlertDialogDescription>
                変更した内容は保存されません。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>入力を続ける</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onClose}>
                破棄して閉じる
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

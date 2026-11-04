import { useRef, useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
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
      <div className="space-y-2">
        <Label htmlFor={`store-${name}`}>{label}</Label>
        {control}
        {hint && (
          <p
            id={`hint-${name}`}
            className="text-xs leading-5 text-muted-foreground"
          >
            {hint}
          </p>
        )}
        {errors[name] && (
          <p
            id={`error-${name}`}
            className="text-xs text-destructive"
            role="alert"
          >
            {errors[name]?.message}
          </p>
        )}
      </div>
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
          <div>
            <DialogTitle className="text-lg font-semibold">
              {target.original ? '店舗を編集' : '店舗を登録'}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground">
              設備数の空欄は不明として扱います。
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
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
                <div className="flex items-center gap-2">
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
                  <Label htmlFor="store-confirmedUnknown">
                    最終確認日は未確認
                  </Label>
                </div>
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
              <p role="alert" className="text-sm text-destructive">
                管理者権限が確認できないため保存できません。入力内容は保持しています。
              </p>
            )}
            {message && (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            )}
            {discard ? (
              <div className="space-y-3" role="alert">
                <p className="text-sm">未保存の入力を破棄しますか？</p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDiscard(false)}
                  >
                    入力を続ける
                  </Button>
                  <Button type="button" variant="destructive" onClick={onClose}>
                    破棄して閉じる
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={close}
                  disabled={saving}
                >
                  キャンセル
                </Button>
                <Button type="submit" disabled={saving || !allowed}>
                  {saving && <LoaderCircle className="animate-spin" />}
                  {saving ? '保存中' : '保存する'}
                </Button>
              </div>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

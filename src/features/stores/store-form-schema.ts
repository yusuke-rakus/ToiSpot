import { z } from 'zod'
import { storeInputSchema, type Store, type StoreInput } from './store-schema'
import type { ConveniencePlace } from '../places/nearby-places'

// 選択したコンビニの種類は既存のchainNameフィールドに保存する。
export const convenienceStoreTypes = [
  'セブン-イレブン',
  'ファミリーマート',
  'ローソン',
  'ミニストップ',
  'デイリーヤマザキ',
  'セイコーマート',
  'ポプラ',
  'その他',
] as const
const convenienceStoreTypeSchema = z.enum(convenienceStoreTypes, {
  error: 'コンビニの種類を選択してください',
})
export const registrationAvailability = ['available', 'unavailable'] as const
const registrationAvailabilitySchema = z.enum(registrationAvailability, {
  error: '貸出状況を選択してください',
})

const equipment = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value)))
  .pipe(
    z
      .number({ error: '0以上の整数を入力してください' })
      .int('整数を入力してください')
      .nonnegative('0以上を入力してください')
      .nullable(),
  )

export const storeFormSchema = z
  .object({
    name: z.string().trim().min(1, '店名を入力してください'),
    chainName: z
      .union([z.literal(''), convenienceStoreTypeSchema])
      .pipe(convenienceStoreTypeSchema),
    address: z.string().trim().min(1, '住所を入力してください'),
    availability: z
      .union([z.literal(''), registrationAvailabilitySchema])
      .pipe(registrationAvailabilitySchema),
    genderLayout: storeInputSchema.shape.genderLayout,
    male: equipment,
    female: equipment,
    shared: equipment,
    urinals: equipment,
    notes: z.string().trim(),
    confirmedUnknown: z.boolean(),
    confirmedDate: z.union([
      z.literal(''),
      z.iso.date({ error: '有効な日付を入力してください' }),
    ]),
  })
  .superRefine((value, context) => {
    if (!value.confirmedUnknown && !value.confirmedDate)
      context.addIssue({
        code: 'custom',
        path: ['confirmedDate'],
        message: '確認日を入力するか、未確認を選んでください',
      })
  })
  .transform(
    ({
      male,
      female,
      shared,
      confirmedDate,
      confirmedUnknown,
      ...value
    }): Omit<StoreInput, 'location'> => ({
      ...value,
      conditions: '',
      stalls: { male, female, shared },
      lastConfirmedAt: confirmedUnknown
        ? null
        : new Date(`${confirmedDate}T00:00:00+09:00`).toISOString(),
    }),
  )

export type StoreFormValues = z.input<typeof storeFormSchema>
export type StoreFormData = z.output<typeof storeFormSchema>

export function storeFormDefaults(
  store?: Store,
  place?: ConveniencePlace,
): StoreFormValues {
  const count = (value: number | null | undefined) =>
    value == null ? '' : String(value)
  const storeType = convenienceStoreTypeSchema.safeParse(store?.chainName)
  return {
    name: store?.name ?? place?.name ?? '',
    chainName: store ? (storeType.success ? storeType.data : 'その他') : '',
    address: store?.address ?? place?.address ?? '',
    // 旧データの「条件付き」「不明」などを利用可・不可に決めつけず、再選択を求める。
    availability:
      store?.availability === 'available' ||
      store?.availability === 'unavailable'
        ? store.availability
        : '',
    genderLayout: store?.genderLayout ?? 'unknown',
    male: count(store?.stalls.male),
    female: count(store?.stalls.female),
    shared: count(store?.stalls.shared),
    urinals: count(store?.urinals),
    notes: store?.notes ?? '',
    confirmedUnknown: !store?.lastConfirmedAt,
    confirmedDate: store?.lastConfirmedAt
      ? new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(store.lastConfirmedAt))
      : '',
  }
}

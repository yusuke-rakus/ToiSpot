import { z } from 'zod'
import { availabilitySchema, type Store, type StoreInput } from './store-schema'
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

const equipmentFormSchema = z.object({
  male: equipment,
  female: equipment,
  shared: equipment,
  urinals: equipment,
})

export const storeFormSchema = z
  .object({
    name: z.string().trim().min(1, '店名を入力してください'),
    chainName: z
      .union([z.literal(''), convenienceStoreTypeSchema])
      .pipe(convenienceStoreTypeSchema),
    address: z.string().trim().min(1, '住所を入力してください'),
    availability: z
      .union([z.literal(''), availabilitySchema])
      .pipe(availabilitySchema),
    male: z.string(),
    female: z.string(),
    shared: z.string(),
    urinals: z.string(),
    notes: z.string().trim(),
  })
  .transform(
    (
      { male, female, shared, urinals, ...value },
      context,
    ): Omit<StoreInput, 'location'> => {
      if (value.availability === 'unavailable')
        return {
          ...value,
          stalls: { male: null, female: null, shared: null },
          urinals: null,
        }
      const result = equipmentFormSchema.safeParse({
        male,
        female,
        shared,
        urinals,
      })
      if (!result.success) {
        result.error.issues.forEach((issue) =>
          context.addIssue({
            code: 'custom',
            path: issue.path,
            message: issue.message,
          }),
        )
        return z.NEVER
      }
      return {
        ...value,
        stalls: {
          male: result.data.male,
          female: result.data.female,
          shared: result.data.shared,
        },
        urinals: result.data.urinals,
      }
    },
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
    availability: store?.availability ?? '',
    male: count(store?.stalls.male),
    female: count(store?.stalls.female),
    shared: count(store?.stalls.shared),
    urinals: count(store?.urinals),
    notes: store?.notes ?? '',
  }
}

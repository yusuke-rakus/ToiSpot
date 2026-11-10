import { z } from 'zod'
import { availabilitySchema, type Store, type StoreInput } from './store-schema'
import type { ConveniencePlace } from '../places/nearby-places'

export const equipmentCountOptions = ['0', '1', '2', '3', '4', '5'] as const

const equipment = z
  .string()
  .trim()
  .transform((value) => value || '0')
  .pipe(z.enum(equipmentCountOptions, { error: '0〜5から選択してください' }))
  .transform(Number)

const equipmentFormSchema = z.object({
  male: equipment,
  female: equipment,
  shared: equipment,
  urinals: equipment,
})

export const storeFormSchema = z
  .object({
    name: z.string().trim().min(1, '店名を入力してください'),
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
  const count = (value: number | null | undefined) => String(value ?? 0)
  return {
    name: store?.name ?? place?.name ?? '',
    address: store?.address ?? place?.address ?? '',
    availability: store?.availability ?? '',
    male: count(store?.stalls.male),
    female: count(store?.stalls.female),
    shared: count(store?.stalls.shared),
    urinals: count(store?.urinals),
    notes: store?.notes ?? '',
  }
}

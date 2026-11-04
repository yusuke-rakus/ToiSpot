import { z } from 'zod'

export const availabilitySchema = z.enum([
  'available',
  'conditional',
  'unavailable',
  'temporarily_unavailable',
  'unknown',
])
export type Availability = z.infer<typeof availabilitySchema>
export const availabilityLabels: Record<Availability, string> = {
  available: '利用可',
  conditional: '条件付き',
  unavailable: '利用不可',
  temporarily_unavailable: '一時停止',
  unknown: '不明',
}
export const layoutLabels = {
  separate: '男女別',
  shared: '共用',
  mixed: '男女別・共用の混在',
  unknown: '不明',
} as const

// Web SDK・Admin SDKのTimestampを、画面で扱うISO文字列へ正規化する。
const timestampSchema = z.preprocess((value) => {
  try {
    if (value instanceof Date) return value.toISOString()
    if (
      value &&
      typeof value === 'object' &&
      'toDate' in value &&
      typeof value.toDate === 'function'
    ) {
      return value.toDate().toISOString()
    }
  } catch {
    return value
  }
  return value
}, z.iso.datetime())

const countSchema = z.number().int().nonnegative().nullable()
export const googlePlaceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,512}$/)
const storeObjectSchema = z.object({
  googlePlaceId: googlePlaceIdSchema,
  name: z.string().trim().min(1),
  chainName: z.string().trim().min(1),
  address: z.string().trim().min(1),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  geohash: z.string().regex(/^[0123456789bcdefghjkmnpqrstuvwxyz]{1,12}$/),
  availability: availabilitySchema,
  conditions: z.string(),
  genderLayout: z.enum(['separate', 'shared', 'mixed', 'unknown']),
  stalls: z.object({
    male: countSchema,
    female: countSchema,
    shared: countSchema,
  }),
  urinals: countSchema,
  notes: z.string(),
  lastConfirmedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  isSample: z
    .boolean()
    .default(false)
    .refine((value) => !value),
})
const hasConditions = (data: {
  availability: Availability
  conditions: string
}) => data.availability !== 'conditional' || data.conditions.trim().length > 0
const conditionError = {
  message: '条件付きの場合は利用条件を入力してください',
  path: ['conditions'],
}
export const storeDocumentSchema = storeObjectSchema.refine(
  hasConditions,
  conditionError,
)
export const storeInputSchema = storeObjectSchema
  .omit({
    geohash: true,
    createdAt: true,
    updatedAt: true,
    isSample: true,
    googlePlaceId: true,
  })
  .refine(hasConditions, conditionError)
export type StoreInput = z.infer<typeof storeInputSchema>
export type StoreDocument = z.infer<typeof storeDocumentSchema>
export type Store = StoreDocument & { id: string }
export const STORE_DISPLAY_LIMIT = 100
export type StoreListResult = {
  stores: Store[]
  invalidCount: number
  truncated: boolean
}

export function parseStoreDocuments(
  documents: ReadonlyArray<{ id: string; data: unknown }>,
): StoreListResult {
  const stores: Store[] = []
  let invalidCount = 0
  for (const document of documents.slice(0, STORE_DISPLAY_LIMIT)) {
    const result = storeDocumentSchema.safeParse(document.data)
    if (result.success) stores.push({ ...result.data, id: document.id })
    else invalidCount += 1
  }
  stores.sort(
    (a, b) => a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id),
  )
  return {
    stores,
    invalidCount,
    truncated: documents.length > STORE_DISPLAY_LIMIT,
  }
}

export function formatEquipmentCount(count: number | null, unit = '基') {
  return count === null ? '不明' : `${count}${unit}`
}

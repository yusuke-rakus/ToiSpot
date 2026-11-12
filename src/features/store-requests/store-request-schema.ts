import { Timestamp } from 'firebase/firestore'
import { z } from 'zod'
import { googlePlaceIdSchema, storeInputSchema } from '../stores/store-schema'

const documentIdSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes('/'))
const timestampSchema = z.instanceof(Timestamp)
const displayedTimestampSchema = timestampSchema.transform((value) =>
  value.toDate().toISOString(),
)

export const storeRequestTargetSchema = z
  .object({
    requestId: documentIdSchema,
    kind: z.enum(['create', 'update']),
    targetStoreId: documentIdSchema,
    googlePlaceId: googlePlaceIdSchema,
    baseUpdatedAt: timestampSchema.nullable(),
  })
  .strict()
  .refine(
    (target) =>
      target.kind === 'create'
        ? target.baseUpdatedAt === null &&
          target.targetStoreId === target.requestId
        : target.baseUpdatedAt !== null,
    { message: '申請の対象と更新日時が一致していません。' },
  )

export const storeRequestDocumentSchema = z
  .object({
    kind: z.enum(['create', 'update']),
    targetStoreId: documentIdSchema,
    googlePlaceId: googlePlaceIdSchema,
    input: storeInputSchema.strict(),
    baseUpdatedAt: timestampSchema.nullable(),
    status: z.enum(['pending', 'approved', 'rejected']),
    createdAt: displayedTimestampSchema,
    reviewedAt: displayedTimestampSchema.nullable(),
  })
  .strict()
  .refine(
    (request) =>
      (request.kind === 'create') === (request.baseUpdatedAt === null) &&
      (request.status === 'pending') === (request.reviewedAt === null),
    { message: '申請の状態と日時が一致していません。' },
  )

export type StoreRequestTarget = z.infer<typeof storeRequestTargetSchema>
export type StoreRequest = z.infer<typeof storeRequestDocumentSchema> & {
  id: string
}

export const STORE_REQUEST_PAGE_SIZE = 20

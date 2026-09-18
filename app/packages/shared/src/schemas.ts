import { z } from "zod";

/**
 * Schemas mirror the Java records in backend/.../item/ItemDto.java field
 * for field. When you add an entity on the backend, add its schema here
 * too — that is the whole contract between the three apps.
 */

export const ItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  done: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const CreateItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
});

export const UpdateItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  done: z.boolean(),
});

/**
 * Matches com.hackspain.api.common.PageResponse<T>.
 */
export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    page: z.number(),
    size: z.number(),
    totalItems: z.number(),
    totalPages: z.number(),
  });
}

/**
 * RFC 9457 ProblemDetail, the shape of every error response.
 * See com.hackspain.api.common.ApiExceptionHandler.
 */
export const ProblemDetailSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.number().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  fieldErrors: z.record(z.string(), z.string()).optional(),
});

export const ItemPageSchema = pageSchema(ItemSchema);

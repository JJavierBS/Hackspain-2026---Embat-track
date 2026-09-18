import type { z } from "zod";
import type {
  CreateItemSchema,
  ItemPageSchema,
  ItemSchema,
  ProblemDetailSchema,
  UpdateItemSchema,
} from "./schemas";

export type Item = z.infer<typeof ItemSchema>;
export type CreateItem = z.infer<typeof CreateItemSchema>;
export type UpdateItem = z.infer<typeof UpdateItemSchema>;
export type ItemPage = z.infer<typeof ItemPageSchema>;
export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

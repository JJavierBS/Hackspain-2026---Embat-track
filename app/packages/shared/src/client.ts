import type { z } from "zod";
import { ProblemDetailSchema } from "./schemas";
import type { ProblemDetail } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetail | undefined;

  constructor(status: number, problem: ProblemDetail | undefined, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

export interface ApiClientOptions {
  /** e.g. "/api" for the web proxy, or "http://192.168.1.20:8080/api" for the phone. */
  baseUrl: string;
}

/**
 * A small typed fetch wrapper shared by web and mobile. Every response is
 * parsed with the zod schema you pass in, so a backend field rename shows
 * up as a caught error here instead of a silent `undefined` in the UI.
 */
export function createApiClient({ baseUrl }: ApiClientOptions) {
  async function request<T>(
    method: string,
    path: string,
    schema: z.ZodType<T> | undefined,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      let problem: ProblemDetail | undefined;
      try {
        problem = ProblemDetailSchema.parse(await response.json());
      } catch {
        // Body was not a ProblemDetail (e.g. the API was unreachable). Fall through.
      }
      throw new ApiError(
        response.status,
        problem,
        problem?.detail ?? `Request failed with status ${response.status}`,
      );
    }

    if (response.status === 204 || schema === undefined) {
      return undefined as T;
    }
    return schema.parse(await response.json());
  }

  return {
    get: <T>(path: string, schema: z.ZodType<T>) => request("GET", path, schema),
    post: <T>(path: string, schema: z.ZodType<T>, body?: unknown) => request("POST", path, schema, body),
    put: <T>(path: string, schema: z.ZodType<T>, body?: unknown) => request("PUT", path, schema, body),
    del: (path: string) => request<void>("DELETE", path, undefined),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

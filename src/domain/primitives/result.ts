export interface DomainError {
  code:
    | "NOT_FOUND"
    | "POLICY_VIOLATION"
    | "STATE_CONFLICT"
    | "VALIDATION_ERROR";
  message: string;
  details?: string;
}

export type Result<TValue, TError extends DomainError = DomainError> =
  | { ok: true; value: TValue }
  | { ok: false; error: TError };

export function ok<TValue>(value: TValue): Result<TValue> {
  return { ok: true, value };
}

export function err<TError extends DomainError>(error: TError): Result<never, TError> {
  return { ok: false, error };
}


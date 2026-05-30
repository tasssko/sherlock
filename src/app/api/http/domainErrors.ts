export function mapDomainErrorToHttpStatus(code: string): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "POLICY_VIOLATION":
      return 403;
    case "STATE_CONFLICT":
      return 409;
    case "VALIDATION_ERROR":
      return 400;
    default:
      return 500;
  }
}


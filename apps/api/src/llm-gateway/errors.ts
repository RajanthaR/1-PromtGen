export type LlmGatewayErrorCode =
  | "configuration_error"
  | "invalid_input"
  | "invalid_output"
  | "provider_unavailable"
  | "secret_detected";

export class LlmGatewayError extends Error {
  constructor(
    public readonly code: LlmGatewayErrorCode,
    message: string,
    public readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LlmGatewayError";
  }
}

export class LlmProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable = true,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LlmProviderError";
  }
}

export function toSafeErrorCode(error: unknown): string {
  if (error instanceof LlmGatewayError || error instanceof LlmProviderError) {
    return error.code;
  }

  if (error instanceof Error) {
    return error.name;
  }

  return "unknown_error";
}

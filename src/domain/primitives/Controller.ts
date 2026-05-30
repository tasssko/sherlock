import type { Result } from "./result.js";

export interface Controller<TCommand, TResult> {
  execute(command: TCommand): Promise<Result<TResult>> | Result<TResult>;
}


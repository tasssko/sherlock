export interface ContextFact<TLabel extends string = string> {
  label: TLabel;
  value: string;
}

export interface ContextAssumption {
  id: string;
  statement: string;
}

export interface OperationContext<TFactLabel extends string = string> {
  knownFacts: readonly ContextFact<TFactLabel>[];
  assumptions: readonly ContextAssumption[];
  metadata: Record<string, boolean | number | readonly string[] | string>;
}


export type PromptOperationMode = "improve" | "enhance" | "shorten" | "refine";

export interface PromptOperationRecord {
  id: string;
  userId: string;
  original: string;
  enhanced: string;
  mode: PromptOperationMode;
  targetModel: string;
  promptType: string;
  structureScoreBefore: number;
  structureScoreAfter: number;
  tokens: number;
  provider: string;
  model: string;
  latencyMs: number;
  saved: boolean;
  thumbsFeedback?: "up" | "down";
  createdAt: Date;
}

export interface RecordPromptOperationInput {
  original: string;
  enhanced: string;
  mode: PromptOperationMode;
  targetModel: string;
  promptType: string;
  structureScoreBefore: number;
  structureScoreAfter: number;
  tokens: number;
  provider: string;
  model: string;
  latencyMs: number;
  saved: boolean;
  thumbsFeedback?: "up" | "down";
}

export interface UsageEventInput {
  eventName: string;
  units: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface HistoryUsagePort {
  recordPromptOperation(
    userId: string,
    input: RecordPromptOperationInput,
  ): Promise<PromptOperationRecord>;
  listPromptHistory(userId: string): Promise<PromptOperationRecord[]>;
  deleteHistoryEntry(userId: string, historyEntryId: string): Promise<void>;
  recordUsageEvent(userId: string, input: UsageEventInput): Promise<void>;
}

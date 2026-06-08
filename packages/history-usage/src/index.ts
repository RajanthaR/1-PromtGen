import { and, desc, eq, inArray, type InferSelectModel } from "drizzle-orm";

import type { PromptGenDatabase } from "@promptgen/db";
import { operations, usageEvents, users } from "@promptgen/db";

export type PromptOperationMode = "improve" | "enhance" | "shorten" | "refine";
export type PromptHistoryPlan = "free" | "pro" | "advanced";
export type PromptOperationFeedback = "up" | "down";

export interface PromptOperationRecord {
  id: string;
  userId: string;
  original: string;
  enhanced: string;
  mode: PromptOperationMode;
  targetModel: string;
  promptType: string;
  structureScoreBefore?: number;
  structureScoreAfter?: number;
  tokens?: number;
  provider?: string;
  model?: string;
  latencyMs?: number;
  saved: boolean;
  thumbsFeedback?: PromptOperationFeedback;
  createdAt: Date;
}

export interface RecordPromptOperationInput {
  original: string;
  enhanced: string;
  mode: PromptOperationMode;
  targetModel: string;
  promptType: string;
  structureScoreBefore?: number;
  structureScoreAfter?: number;
  tokens?: number;
  provider?: string;
  model?: string;
  latencyMs?: number;
  saved: boolean;
  thumbsFeedback?: PromptOperationFeedback;
}

export interface PromptHistoryEditorPayload {
  raw_prompt: string;
  enhanced_prompt: string;
  mode: PromptOperationMode;
  target_model: string;
  prompt_type: string;
}

export interface PromptHistorySendToEditorResult {
  id: string;
  original: string;
  enhanced: string;
  editorPayload: PromptHistoryEditorPayload;
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
  getPromptHistoryEntry(
    userId: string,
    historyEntryId: string,
  ): Promise<PromptOperationRecord | null>;
  deleteHistoryEntry(userId: string, historyEntryId: string): Promise<void>;
  recordUsageEvent(userId: string, input: UsageEventInput): Promise<void>;
}

export interface InMemoryHistoryUsageStoreOptions {
  createId?: () => string;
  defaultPlan?: PromptHistoryPlan;
  getUserPlan?: (userId: string) => PromptHistoryPlan | Promise<PromptHistoryPlan>;
  now?: () => Date;
}

interface StoredPromptOperationRecord {
  record: PromptOperationRecord;
  sequence: number;
}

type OperationRow = InferSelectModel<typeof operations>;

export function getPromptHistoryRetentionLimit(plan: PromptHistoryPlan): number | null {
  switch (plan) {
    case "free":
      return 50;
    case "pro":
      return 500;
    case "advanced":
      return null;
  }
}

export function createPromptHistoryEditorPayload(
  record: PromptOperationRecord,
): PromptHistoryEditorPayload {
  return {
    raw_prompt: record.original,
    enhanced_prompt: record.enhanced,
    mode: record.mode,
    target_model: record.targetModel,
    prompt_type: record.promptType,
  };
}

export function createPromptHistorySendToEditorResult(
  record: PromptOperationRecord,
): PromptHistorySendToEditorResult {
  return {
    id: record.id,
    original: record.original,
    enhanced: record.enhanced,
    editorPayload: createPromptHistoryEditorPayload(record),
  };
}

export function createInMemoryHistoryUsageStore(
  options: InMemoryHistoryUsageStoreOptions = {},
): HistoryUsagePort {
  return new InMemoryHistoryUsageStore(options);
}

export function createPostgresHistoryUsageStore(db: PromptGenDatabase): HistoryUsagePort {
  return new PostgresHistoryUsageStore(db);
}

class InMemoryHistoryUsageStore implements HistoryUsagePort {
  private readonly operations: StoredPromptOperationRecord[] = [];
  private readonly usageEvents: Array<{ input: UsageEventInput; userId: string }> = [];
  private sequence = 0;

  constructor(private readonly options: InMemoryHistoryUsageStoreOptions) {}

  async recordPromptOperation(
    userId: string,
    input: RecordPromptOperationInput,
  ): Promise<PromptOperationRecord> {
    const record: PromptOperationRecord = {
      id: this.options.createId?.() ?? crypto.randomUUID(),
      userId,
      original: input.original,
      enhanced: input.enhanced,
      mode: input.mode,
      targetModel: input.targetModel,
      promptType: input.promptType,
      saved: input.saved,
      createdAt: new Date(this.options.now?.() ?? new Date()),
      ...(input.structureScoreBefore !== undefined
        ? { structureScoreBefore: input.structureScoreBefore }
        : {}),
      ...(input.structureScoreAfter !== undefined
        ? { structureScoreAfter: input.structureScoreAfter }
        : {}),
      ...(input.tokens !== undefined ? { tokens: input.tokens } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
      ...(input.thumbsFeedback !== undefined ? { thumbsFeedback: input.thumbsFeedback } : {}),
    };

    this.sequence += 1;
    this.operations.push({ record, sequence: this.sequence });
    await this.enforceRetention(userId);

    return clonePromptOperationRecord(record);
  }

  async listPromptHistory(userId: string): Promise<PromptOperationRecord[]> {
    return this.operations
      .filter((entry) => entry.record.userId === userId)
      .sort(compareStoredOperationsNewestFirst)
      .map((entry) => clonePromptOperationRecord(entry.record));
  }

  async getPromptHistoryEntry(
    userId: string,
    historyEntryId: string,
  ): Promise<PromptOperationRecord | null> {
    const entry = this.operations.find(
      (operation) => operation.record.userId === userId && operation.record.id === historyEntryId,
    );

    return entry ? clonePromptOperationRecord(entry.record) : null;
  }

  async deleteHistoryEntry(userId: string, historyEntryId: string): Promise<void> {
    const index = this.operations.findIndex(
      (entry) => entry.record.userId === userId && entry.record.id === historyEntryId,
    );

    if (index >= 0) {
      this.operations.splice(index, 1);
    }
  }

  async recordUsageEvent(userId: string, input: UsageEventInput): Promise<void> {
    this.usageEvents.push({ userId, input });
  }

  private async enforceRetention(userId: string): Promise<void> {
    const plan = await this.resolvePlan(userId);
    const retentionLimit = getPromptHistoryRetentionLimit(plan);

    if (retentionLimit === null) {
      return;
    }

    const userEntries = this.operations
      .filter((entry) => entry.record.userId === userId)
      .sort(compareStoredOperationsNewestFirst);
    const expiredEntryIds = new Set(
      userEntries.slice(retentionLimit).map((entry) => entry.record.id),
    );

    if (expiredEntryIds.size === 0) {
      return;
    }

    for (let index = this.operations.length - 1; index >= 0; index -= 1) {
      const entry = this.operations[index];

      if (entry && expiredEntryIds.has(entry.record.id)) {
        this.operations.splice(index, 1);
      }
    }
  }

  private async resolvePlan(userId: string): Promise<PromptHistoryPlan> {
    if (this.options.getUserPlan) {
      return this.options.getUserPlan(userId);
    }

    return this.options.defaultPlan ?? "free";
  }
}

class PostgresHistoryUsageStore implements HistoryUsagePort {
  constructor(private readonly db: PromptGenDatabase) {}

  async recordPromptOperation(
    userId: string,
    input: RecordPromptOperationInput,
  ): Promise<PromptOperationRecord> {
    const [operation] = await this.db
      .insert(operations)
      .values({
        userId,
        rawPrompt: input.original,
        enhancedPrompt: input.enhanced,
        mode: input.mode,
        targetModel: input.targetModel,
        promptType: input.promptType,
        saved: input.saved,
        ...(input.structureScoreBefore !== undefined
          ? { structureScoreBefore: input.structureScoreBefore }
          : {}),
        ...(input.structureScoreAfter !== undefined
          ? { structureScoreAfter: input.structureScoreAfter }
          : {}),
        ...(input.tokens !== undefined ? { tokens: input.tokens } : {}),
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
        ...(input.thumbsFeedback !== undefined ? { feedback: input.thumbsFeedback } : {}),
      })
      .returning();

    if (!operation) {
      throw new Error("Failed to record prompt history entry.");
    }

    await this.enforceRetention(userId);

    return mapOperationRow(operation);
  }

  async listPromptHistory(userId: string): Promise<PromptOperationRecord[]> {
    const rows = await this.db
      .select()
      .from(operations)
      .where(eq(operations.userId, userId))
      .orderBy(desc(operations.createdAt), desc(operations.id));

    return rows.map(mapOperationRow);
  }

  async getPromptHistoryEntry(
    userId: string,
    historyEntryId: string,
  ): Promise<PromptOperationRecord | null> {
    const [row] = await this.db
      .select()
      .from(operations)
      .where(and(eq(operations.userId, userId), eq(operations.id, historyEntryId)))
      .limit(1);

    return row ? mapOperationRow(row) : null;
  }

  async deleteHistoryEntry(userId: string, historyEntryId: string): Promise<void> {
    await this.db
      .delete(operations)
      .where(and(eq(operations.userId, userId), eq(operations.id, historyEntryId)));
  }

  async recordUsageEvent(userId: string, input: UsageEventInput): Promise<void> {
    await this.db.insert(usageEvents).values({
      userId,
      kind: input.eventName,
      quantity: input.units,
    });
  }

  private async enforceRetention(userId: string): Promise<void> {
    const plan = await this.resolvePlan(userId);
    const retentionLimit = getPromptHistoryRetentionLimit(plan);

    if (retentionLimit === null) {
      return;
    }

    const expiredRows = await this.db
      .select({ id: operations.id })
      .from(operations)
      .where(eq(operations.userId, userId))
      .orderBy(desc(operations.createdAt), desc(operations.id))
      .offset(retentionLimit);

    if (expiredRows.length === 0) {
      return;
    }

    await this.db.delete(operations).where(
      and(
        eq(operations.userId, userId),
        inArray(
          operations.id,
          expiredRows.map((row) => row.id),
        ),
      ),
    );
  }

  private async resolvePlan(userId: string): Promise<PromptHistoryPlan> {
    const [user] = await this.db
      .select({ plan: users.plan })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user?.plan ?? "free";
  }
}

function mapOperationRow(row: OperationRow): PromptOperationRecord {
  const thumbsFeedback = parsePromptOperationFeedback(row.feedback);

  return {
    id: row.id,
    userId: row.userId,
    original: row.rawPrompt,
    enhanced: row.enhancedPrompt ?? "",
    mode: row.mode as PromptOperationMode,
    targetModel: row.targetModel,
    promptType: row.promptType,
    saved: row.saved,
    createdAt: row.createdAt,
    ...(row.structureScoreBefore !== null
      ? { structureScoreBefore: row.structureScoreBefore }
      : {}),
    ...(row.structureScoreAfter !== null ? { structureScoreAfter: row.structureScoreAfter } : {}),
    ...(row.tokens !== null ? { tokens: row.tokens } : {}),
    ...(row.provider !== null ? { provider: row.provider } : {}),
    ...(row.model !== null ? { model: row.model } : {}),
    ...(row.latencyMs !== null ? { latencyMs: row.latencyMs } : {}),
    ...(thumbsFeedback ? { thumbsFeedback } : {}),
  };
}

function parsePromptOperationFeedback(value: string | null): PromptOperationFeedback | null {
  if (value === "up" || value === "down") {
    return value;
  }

  return null;
}

function compareStoredOperationsNewestFirst(
  left: StoredPromptOperationRecord,
  right: StoredPromptOperationRecord,
): number {
  const createdAtDiff = right.record.createdAt.getTime() - left.record.createdAt.getTime();

  return createdAtDiff || right.sequence - left.sequence;
}

function clonePromptOperationRecord(record: PromptOperationRecord): PromptOperationRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt),
  };
}

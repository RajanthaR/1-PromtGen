export type PromptEnhancementMode = "improve" | "enhance" | "shorten";

export interface PromptEngineRequest {
  userId: string;
  rawPrompt: string;
  mode: PromptEnhancementMode;
  promptType: string;
  targetModel?: string;
  selectedContextSnippetIds: string[];
}

export interface PromptEngineResult {
  enhancedPrompt: string;
  explanation: string;
  diffSummary: string;
  structureScoreBefore: number;
  structureScoreAfter: number;
  contextSnippetIdsUsed: string[];
}

export interface PromptEnginePort {
  enhancePrompt(request: PromptEngineRequest): Promise<PromptEngineResult>;
}

export function createPhaseOnePromptEngineStub(): PromptEnginePort {
  return {
    async enhancePrompt(_request) {
      throw new Error("Prompt engine enhancement is deferred until Phase 2.");
    },
  };
}

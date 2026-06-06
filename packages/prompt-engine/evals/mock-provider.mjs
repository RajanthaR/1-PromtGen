export default class PromptEngineMockProvider {
  id() {
    return "prompt-engine-local-mock";
  }

  async callApi(prompt, context) {
    const output = context?.vars?.expected_output;

    if (!output || typeof output !== "object") {
      return { error: "expected_output fixture is required" };
    }

    return {
      output: JSON.stringify(output),
      metadata: {
        caseId: context.vars.case_id,
        promptHasStaticPrefix:
          prompt.includes("# Golden Few-Shots") &&
          prompt.includes("# Provider-Enforced Output Schema"),
        promptWrapsUserInput: prompt.includes("<user_input>") && prompt.includes("</user_input>"),
        promptWrapsJudgeInputs:
          prompt.includes("<original_prompt>") &&
          prompt.includes("</original_prompt>") &&
          prompt.includes("<enhanced_prompt>") &&
          prompt.includes("</enhanced_prompt>"),
      },
    };
  }
}

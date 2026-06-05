const canonicalFields = [
  "title",
  "needs_clarification",
  "questions",
  "enhanced_prompt",
  "role",
  "task",
  "context",
  "constraints",
  "format",
  "tone",
  "success_criteria",
  "explanation",
  "added",
  "removed",
  "changed",
];

function parseOutput(output) {
  try {
    return { data: JSON.parse(output), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

function fail(reason) {
  return { pass: false, score: 0, reason };
}

function pass(reason) {
  return { pass: true, score: 1, reason };
}

function hasOnlyCanonicalFields(data) {
  const keys = Object.keys(data);
  return (
    keys.length === canonicalFields.length &&
    canonicalFields.every((field) => Object.prototype.hasOwnProperty.call(data, field))
  );
}

module.exports = (output, context) => {
  const { data, error } = parseOutput(output);
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return fail("Output must be a JSON object.");
  }

  if (!hasOnlyCanonicalFields(data)) {
    return fail("Output must contain exactly the canonical flat fields.");
  }

  const { vars, providerResponse } = context;
  const metadata = providerResponse?.metadata || {};

  if (!metadata.promptHasStaticPrefix || !metadata.promptWrapsUserInput) {
    return fail("Prompt must include the static prefix and wrap raw input in user_input tags.");
  }

  if (vars.target_model !== "gemini") {
    return fail("Phase 2 evals must use the single launch provider target: gemini.");
  }

  if (data.questions.length > 3) {
    return fail("Clarification questions must be capped at three.");
  }

  switch (vars.expected_behavior) {
    case "improve":
      if (data.needs_clarification || !data.enhanced_prompt || data.questions.length !== 0) {
        return fail("Improve mode should return a light rewrite without clarification questions.");
      }
      if (!data.explanation.some((item) => item.toLowerCase().includes("clarified"))) {
        return fail("Improve mode should explain the light clarification.");
      }
      break;
    case "enhance":
      if (
        data.needs_clarification ||
        !data.role ||
        data.success_criteria.length === 0 ||
        !data.enhanced_prompt.includes("[")
      ) {
        return fail("Enhance mode should return a full structured prompt with placeholders.");
      }
      break;
    case "refine_questions":
    case "few_shot_refine":
      if (
        data.needs_clarification !== true ||
        data.questions.length < 1 ||
        data.questions.length > 3 ||
        data.enhanced_prompt !== ""
      ) {
        return fail("Refine mode should return one to three questions instead of a rewrite.");
      }
      break;
    case "shorten":
    case "few_shot_shorten":
      if (
        data.needs_clarification ||
        data.enhanced_prompt.length >= String(vars.raw_prompt).length ||
        !data.constraints.some((item) => /recommendation|recommend/i.test(item))
      ) {
        return fail("Shorten mode should compress while preserving explicit constraints.");
      }
      break;
    case "few_shot":
      if (data.needs_clarification || data.questions.length !== 0 || !vars.few_shot_id) {
        return fail("Golden few-shot output should stay schema-valid and behavior-valid.");
      }
      break;
    default:
      return fail(`Unknown expected_behavior: ${vars.expected_behavior}`);
  }

  return pass(`Passed prompt-engine behavior regression for ${vars.case_id}.`);
};

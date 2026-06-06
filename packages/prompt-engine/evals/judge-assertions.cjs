const dimensions = new Set([
  "clarity",
  "context",
  "specificity",
  "output_format",
  "model_tool_fit",
  "safety_privacy",
  "concision",
]);

function fail(reason) {
  return { pass: false, score: 0, reason };
}

function pass(reason) {
  return { pass: true, score: 1, reason };
}

function hasScoreLikeText(text) {
  return (
    /\bstructure[_\s-]?score\b/i.test(text) ||
    /\b(scores?|grades?|ratings?|rated)\b[^.!?\n]{0,40}\b\d+(?:\.\d+)?\b/i.test(text) ||
    /\b\d+(?:\.\d+)?\s*(?:%|percent|\/\s*10|\/\s*100|out of\s+(?:10|100))\b/i.test(text)
  );
}

module.exports = (output, context) => {
  let data;

  try {
    data = JSON.parse(output);
  } catch {
    return fail("Judge output must be JSON.");
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return fail("Judge output must be a JSON object.");
  }

  const keys = Object.keys(data);
  if (keys.length !== 2 || !keys.includes("summary") || !keys.includes("suggestions")) {
    return fail("Judge output must contain only summary and suggestions.");
  }

  if (typeof data.summary !== "string" || !Array.isArray(data.suggestions)) {
    return fail("Judge output must be suggestion-shaped.");
  }

  if (data.suggestions.length > 5) {
    return fail("Judge output must keep suggestions concise.");
  }

  const strings = [data.summary];
  for (const [index, suggestion] of data.suggestions.entries()) {
    if (!suggestion || typeof suggestion !== "object" || Array.isArray(suggestion)) {
      return fail(`Suggestion ${index} must be an object.`);
    }

    const suggestionKeys = Object.keys(suggestion);
    if (
      suggestionKeys.length !== 3 ||
      !suggestionKeys.includes("dimension") ||
      !suggestionKeys.includes("weakness") ||
      !suggestionKeys.includes("improvement")
    ) {
      return fail("Judge suggestions must contain only dimension, weakness, and improvement.");
    }

    if (!dimensions.has(suggestion.dimension)) {
      return fail(`Unsupported judge dimension: ${suggestion.dimension}.`);
    }

    if (typeof suggestion.weakness !== "string" || typeof suggestion.improvement !== "string") {
      return fail("Judge weaknesses and improvements must be strings.");
    }

    strings.push(suggestion.weakness, suggestion.improvement);
  }

  if (strings.some(hasScoreLikeText)) {
    return fail("Judge output must not include numeric scores, grades, or percentages.");
  }

  const metadata = context.providerResponse?.metadata || {};
  if (!metadata.promptWrapsJudgeInputs) {
    return fail("Judge prompt must wrap original and enhanced prompts as data.");
  }

  return pass(`Passed quality judge regression for ${context.vars.case_id}.`);
};

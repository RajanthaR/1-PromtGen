export interface SecretDetectionFinding {
  type: "api_key" | "jwt" | "private_key" | "high_entropy_token";
  redacted: string;
}

const secretPatterns: Array<{
  type: SecretDetectionFinding["type"];
  pattern: RegExp;
}> = [
  {
    type: "private_key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    type: "api_key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    type: "api_key",
    pattern: /\b(?:sk|pk|rk)-(?:live|test|proj)?-?[0-9A-Za-z_-]{20,}\b/g,
  },
  {
    type: "api_key",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  },
  {
    type: "jwt",
    pattern: /\beyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\b/g,
  },
  {
    type: "high_entropy_token",
    pattern: /\b(?=[0-9A-Za-z+/=_-]{40,}\b)(?=[0-9A-Za-z+/=_-]*[A-Z])(?=[0-9A-Za-z+/=_-]*[a-z])(?=[0-9A-Za-z+/=_-]*\d)[0-9A-Za-z+/=_-]{40,}\b/g,
  },
];

export function detectSecrets(input: string): SecretDetectionFinding[] {
  const findings: SecretDetectionFinding[] = [];

  for (const { pattern, type } of secretPatterns) {
    for (const match of input.matchAll(pattern)) {
      if (!match[0]) {
        continue;
      }

      findings.push({
        type,
        redacted: redactSecret(match[0]),
      });
    }
  }

  return findings;
}

function redactSecret(value: string): string {
  if (value.length <= 8) {
    return "[REDACTED]";
  }

  return `${value.slice(0, 4)}...[REDACTED]...${value.slice(-4)}`;
}


import * as chrono from "chrono-node";

export interface ParseResult {
  text: string;
  dueAt: number | null;
  matchedText: string | null;
}

export function parseReminder(input: string, ref: Date = new Date()): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { text: "", dueAt: null, matchedText: null };
  }

  const results = chrono.parse(trimmed, ref, { forwardDate: true });

  if (results.length === 0) {
    return { text: trimmed, dueAt: null, matchedText: null };
  }

  const match = results[0];
  const dueAt = match.start.date().getTime();
  const matchedText = match.text;
  const text = stripMatchedPhrase(trimmed, matchedText).trim();

  return {
    text: text || trimmed,
    dueAt,
    matchedText,
  };
}

function stripMatchedPhrase(input: string, phrase: string): string {
  const connectors = /\s*(?:,|at|on|by|in|next|this|\s)+\s*$/i;
  const cleaned = input.replace(phrase, "").replace(/\s+/g, " ").trim();
  return cleaned.replace(connectors, "").trim();
}

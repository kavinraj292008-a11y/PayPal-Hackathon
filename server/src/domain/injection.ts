/**
 * Heuristic detection of instruction-like text inside UNTRUSTED evidence.
 * This is a defence-in-depth signal, not the primary defence (that is prompt
 * structure + server-side scoring). A hit never reveals the matched text; it
 * forces MANUAL_REVIEW and is shown to the client as a risk.
 */
const PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'attempts to override previous instructions', re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|system|all|any)\b[^.\n]{0,30}\b(instructions?|rules?|prompts?|guidelines?|directions?)\b/i },
  { label: 'instructs the auditor to mark criteria as met', re: /\b(mark|set|rate|score|treat|consider)\b[^.\n]{0,40}\b(all|every|each)\b[^.\n]{0,25}\bcriteri(a|on)\b[^.\n]{0,30}\b(satisfied|met|passed?|complete[d]?|compliant)\b/i },
  { label: 'dictates a score', re: /\b(give|assign|set|output|return)\b[^.\n]{0,30}\b(overall\s+)?score\b[^.\n]{0,15}\b(100|perfect|maximum|full)\b/i },
  { label: 'dictates a recommendation or approval', re: /\b(recommend(ation)?|verdict|decision)\b\s*(is|should be|=|:)?\s*["']?\s*approve/i },
  { label: 'asks to approve or release payment', re: /\b(approve|release|authori[sz]e|capture)\b[^.\n]{0,25}\b(this\s+)?(milestone|payment|funds?|submission)\b/i },
  { label: 'impersonates system or assistant messages', re: /(<\/?\s*(system|assistant|developer|instructions?)\s*>|\[\/?INST\]|\bBEGIN\s+(SYSTEM|INSTRUCTIONS?)\b|^\s*(system|assistant)\s*:)/im },
  { label: 'attempts to redefine the auditor role', re: /\byou\s+(are|must)\s+now\b|\bnew\s+(instructions?|rules?)\s*:|\bfrom\s+now\s+on\b[^.\n]{0,40}\byou\b/i },
  { label: 'dictates the output format or content', re: /\b(respond|reply|output|return)\s+(only\s+)?(with|the following)\b[^.\n]{0,30}\bjson\b/i },
];

export function detectInjectionAttempts(texts: Array<string | null | undefined>): string[] {
  const hits = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const p of PATTERNS) {
      if (p.re.test(text)) hits.add(p.label);
    }
  }
  return [...hits];
}

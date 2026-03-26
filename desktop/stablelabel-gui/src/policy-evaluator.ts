/**
 * Policy evaluator — TypeScript port of the Python policy engine.
 *
 * Evaluates files against classification-to-label policies. Pure logic,
 * no network or DB dependencies. Runs in Electron main process.
 */

// ── Types ────────────────────────────────────────────────────

export interface EntityMatch {
  entity_type: string;
  confidence: number;
  start: number;
  end: number;
}

export interface ClassificationResult {
  filename: string;
  entities: EntityMatch[];
  text_content: string;
  error?: string;
}

export interface PolicyRule {
  policy_id: string;
  policy_name: string;
  target_label_id: string;
  priority: number;
  rules: Record<string, unknown>;
}

export interface PolicyMatch {
  target_label_id: string;
  policy_id: string;
  policy_name: string;
  priority: number;
  confidence_level: number;
  matched_conditions: string[];
}

// ── Public API ───────────────────────────────────────────────

export function evaluatePolicies(
  policies: PolicyRule[],
  classification: ClassificationResult,
  filename: string = '',
): PolicyMatch | null {
  const sorted = [...policies].sort((a, b) => b.priority - a.priority);
  const matches: PolicyMatch[] = [];

  for (const policy of sorted) {
    const match = evaluateSinglePolicy(policy, classification, filename);
    if (match) matches.push(match);
  }

  if (matches.length === 0) return null;

  matches.sort((a, b) => b.priority - a.priority || b.confidence_level - a.confidence_level);
  return matches[0];
}

// ── Internal ─────────────────────────────────────────────────

function evaluateSinglePolicy(
  policy: PolicyRule,
  classification: ClassificationResult,
  filename: string,
): PolicyMatch | null {
  const rules = policy.rules || {};

  if ('patterns' in rules) {
    return evaluateSitPolicy(policy, rules, classification, filename);
  }
  return evaluateLegacyPolicy(policy, rules, classification, filename);
}

// ── SIT-aligned evaluation ───────────────────────────────────

function evaluateSitPolicy(
  policy: PolicyRule,
  rules: Record<string, unknown>,
  classification: ClassificationResult,
  filename: string,
): PolicyMatch | null {
  const patterns = (rules.patterns ?? []) as Array<Record<string, unknown>>;
  if (patterns.length === 0) return null;

  const fileScope = rules.file_scope as Record<string, unknown> | undefined;
  if (fileScope && !checkFileScope(fileScope, filename)) return null;

  const definitions = (rules.definitions ?? {}) as Record<string, Record<string, unknown>>;

  const sorted = [...patterns].sort(
    (a, b) => ((b.confidence_level as number) ?? 75) - ((a.confidence_level as number) ?? 75),
  );

  for (const pattern of sorted) {
    const confidence = (pattern.confidence_level as number) ?? 75;
    const primary = pattern.primary_match as Record<string, unknown> | undefined;
    if (!primary) continue;

    const primaryResult = evaluatePrimaryMatch(primary, classification);
    if (!primaryResult) continue;

    const [desc, positions] = primaryResult;
    const matched = [desc];

    const evidence = pattern.corroborative_evidence as Record<string, unknown> | undefined;
    if (evidence) {
      const proximity = (pattern.proximity as number) ?? 300;
      const evidenceResult = evaluateEvidence(evidence, definitions, classification, positions, proximity);
      if (!evidenceResult) continue;
      matched.push(...evidenceResult);
    }

    return {
      target_label_id: policy.target_label_id,
      policy_id: policy.policy_id,
      policy_name: policy.policy_name,
      priority: policy.priority,
      confidence_level: confidence,
      matched_conditions: matched,
    };
  }

  return null;
}

function checkFileScope(scope: Record<string, unknown>, filename: string): boolean {
  const patterns = (scope.file_patterns ?? []) as string[];
  if (patterns.length > 0 && filename) {
    const lower = filename.toLowerCase();
    if (!patterns.some((p) => matchGlob(lower, p.toLowerCase()))) return false;
  }
  return true;
}

function evaluatePrimaryMatch(
  primary: Record<string, unknown>,
  classification: ClassificationResult,
): [string, Array<[number, number]>] | null {
  const type = primary.type as string;

  if (type === 'entity') {
    const entityTypes = new Set((primary.entity_types ?? []) as string[]);
    const minConf = (primary.min_confidence as number) ?? 0.5;
    const minCount = (primary.min_count as number) ?? 1;

    const qualifying = classification.entities.filter(
      (e) => entityTypes.has(e.entity_type) && e.confidence >= minConf,
    );

    if (qualifying.length < minCount) return null;
    const positions: Array<[number, number]> = qualifying.map((e) => [e.start, e.end]);
    return [`entity: ${[...new Set(qualifying.map((e) => e.entity_type))]} (count=${qualifying.length})`, positions];
  }

  if (type === 'regex') {
    const patterns = (primary.patterns ?? []) as string[];
    const minCount = (primary.min_count as number) ?? 1;
    const text = classification.text_content;
    if (!patterns.length || !text) return null;

    const positions: Array<[number, number]> = [];
    const matched: string[] = [];
    const capped = text.slice(0, 500_000);

    for (const p of patterns) {
      try {
        const re = new RegExp(p, 'gim');
        let m: RegExpExecArray | null;
        while ((m = re.exec(capped)) !== null) {
          positions.push([m.index, m.index + m[0].length]);
          if (!matched.includes(p)) matched.push(p);
        }
      } catch { /* invalid regex */ }
    }

    if (positions.length < minCount) return null;
    return [`regex: ${matched} (count=${positions.length})`, positions];
  }

  return null;
}

function evaluateEvidence(
  evidence: Record<string, unknown>,
  definitions: Record<string, Record<string, unknown>>,
  classification: ClassificationResult,
  primaryPositions: Array<[number, number]>,
  proximity: number,
): string[] | null {
  const minMatches = (evidence.min_matches as number) ?? 1;
  const matches = (evidence.matches ?? []) as Array<Record<string, unknown>>;
  const satisfied: string[] = [];

  for (const match of matches) {
    const type = match.type as string;
    let keywords: string[] = [];
    let patterns: string[] = [];
    let caseSensitive = false;
    const refId = (match.id as string) ?? '';

    if (type === 'keyword_list' || type === 'inline_keyword') {
      const defn = type === 'keyword_list' ? definitions[refId] ?? {} : match;
      keywords = (defn.keywords ?? []) as string[];
      caseSensitive = (defn.case_sensitive as boolean) ?? false;
      if (keywordCheck(keywords, caseSensitive, classification.text_content, primaryPositions, proximity)) {
        satisfied.push(`${type}(${refId})`);
      }
    } else if (type === 'regex' || type === 'inline_regex') {
      const defn = type === 'regex' ? definitions[refId] ?? {} : match;
      patterns = (defn.patterns ?? []) as string[];
      if (regexCheck(patterns, classification.text_content, primaryPositions, proximity)) {
        satisfied.push(`${type}(${refId})`);
      }
    }
  }

  return satisfied.length >= minMatches ? satisfied : null;
}

// ── Legacy flat evaluation ───────────────────────────────────

function evaluateLegacyPolicy(
  policy: PolicyRule,
  rules: Record<string, unknown>,
  classification: ClassificationResult,
  filename: string,
): PolicyMatch | null {
  const conditions = (rules.conditions ?? []) as Array<Record<string, unknown>>;
  const matchMode = (rules.match_mode as string) ?? 'any';
  if (conditions.length === 0) return null;

  const results: Array<{ ok: boolean; desc: string }> = [];

  for (const cond of conditions) {
    const type = cond.type as string;
    if (type === 'entity_detected') {
      const types = new Set((cond.entity_types ?? []) as string[]);
      const minConf = (cond.min_confidence as number) ?? 0.5;
      const minCount = (cond.min_count as number) ?? 1;
      const qualifying = classification.entities.filter(
        (e) => types.has(e.entity_type) && e.confidence >= minConf,
      );
      results.push({ ok: qualifying.length >= minCount, desc: `entity: ${qualifying.length}` });
    } else if (type === 'keyword_match') {
      const keywords = (cond.keywords ?? []) as string[];
      const text = classification.text_content.toLowerCase();
      const found = keywords.filter((kw) => text.includes(kw.toLowerCase()));
      results.push({ ok: found.length > 0, desc: `keyword: ${found}` });
    } else if (type === 'regex_match') {
      const patterns = (cond.patterns ?? []) as string[];
      const text = classification.text_content.slice(0, 500_000);
      let matched = false;
      for (const p of patterns) {
        try { if (new RegExp(p, 'im').test(text)) { matched = true; break; } } catch { /* skip */ }
      }
      results.push({ ok: matched, desc: `regex` });
    } else if (type === 'file_pattern') {
      const patterns = (cond.patterns ?? []) as string[];
      const lower = filename.toLowerCase();
      const ok = patterns.some((p) => matchGlob(lower, p.toLowerCase()));
      results.push({ ok, desc: `file_pattern` });
    } else if (type === 'no_label') {
      results.push({ ok: true, desc: 'no_label' });
    }
  }

  const passed = results.filter((r) => r.ok).map((r) => r.desc);

  if (matchMode === 'all' && results.some((r) => !r.ok)) return null;
  if (matchMode !== 'all' && passed.length === 0) return null;

  return {
    target_label_id: policy.target_label_id,
    policy_id: policy.policy_id,
    policy_name: policy.policy_name,
    priority: policy.priority,
    confidence_level: 75,
    matched_conditions: passed,
  };
}

// ── Utility ──────────────────────────────────────────────────

function isWithinProximity(
  hitStart: number, hitEnd: number,
  positions: Array<[number, number]>,
  proximity: number,
): boolean {
  if (proximity <= 0) return true;
  for (const [pStart, pEnd] of positions) {
    if (hitStart <= pEnd + proximity && hitEnd >= pStart - proximity) return true;
  }
  return false;
}

function keywordCheck(
  keywords: string[], caseSensitive: boolean, text: string,
  positions: Array<[number, number]>, proximity: number,
): boolean {
  if (!keywords.length || !text) return false;
  const searchText = caseSensitive ? text : text.toLowerCase();
  for (const kw of keywords) {
    const needle = caseSensitive ? kw : kw.toLowerCase();
    let idx = searchText.indexOf(needle);
    while (idx !== -1) {
      if (isWithinProximity(idx, idx + needle.length, positions, proximity)) return true;
      idx = searchText.indexOf(needle, idx + 1);
    }
  }
  return false;
}

function regexCheck(
  patterns: string[], text: string,
  positions: Array<[number, number]>, proximity: number,
): boolean {
  if (!patterns.length || !text) return false;
  const capped = text.slice(0, 500_000);
  for (const p of patterns) {
    try {
      const re = new RegExp(p, 'gim');
      let m: RegExpExecArray | null;
      while ((m = re.exec(capped)) !== null) {
        if (isWithinProximity(m.index, m.index + m[0].length, positions, proximity)) return true;
      }
    } catch { /* skip invalid */ }
  }
  return false;
}

function matchGlob(str: string, pattern: string): boolean {
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${re}$`).test(str);
}

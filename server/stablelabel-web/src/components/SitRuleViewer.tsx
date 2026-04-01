/**
 * Read-only viewer for SIT-aligned policy rules.
 *
 * Renders the full pattern/evidence/proximity structure in a clear,
 * hierarchical layout so users can see exactly what a SIT definition
 * detects without touching raw JSON.
 */

import { ChevronDown, ChevronRight, Shield, Search, FileText } from 'lucide-react';
import { useState } from 'react';
import type { SitRules, SitPattern, SitEvidenceMatch, SitPatternDefinition } from '@/lib/types';

interface Props {
  rules: SitRules;
}

const CONFIDENCE_LABELS: Record<number, { label: string; color: string }> = {
  85: { label: 'High', color: 'text-green-400 bg-green-900/30 border-green-800' },
  75: { label: 'Medium', color: 'text-yellow-400 bg-yellow-900/30 border-yellow-800' },
  65: { label: 'Low', color: 'text-orange-400 bg-orange-900/30 border-orange-800' },
};

function confidenceBadge(level: number) {
  const preset = CONFIDENCE_LABELS[level] ?? {
    label: `${level}`,
    color: level >= 80
      ? 'text-green-400 bg-green-900/30 border-green-800'
      : level >= 70
        ? 'text-yellow-400 bg-yellow-900/30 border-yellow-800'
        : 'text-orange-400 bg-orange-900/30 border-orange-800',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border ${preset.color}`}>
      {preset.label} ({level})
    </span>
  );
}

function PrimaryMatchView({ match }: { match: SitPattern['primary_match'] }) {
  if (match.type === 'entity') {
    return (
      <div className="space-y-1">
        <div className="text-xs text-zinc-400">Primary — Entity Detection</div>
        <div className="flex flex-wrap gap-1">
          {match.entity_types.map((t) => (
            <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 border border-blue-800">
              {t}
            </span>
          ))}
        </div>
        <div className="text-xs text-zinc-500">
          Min confidence: {Math.round(match.min_confidence * 100)}% &middot; Min count: {match.min_count}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-xs text-zinc-400">Primary — Regex Pattern</div>
      <div className="space-y-0.5">
        {match.patterns.map((p, i) => (
          <code key={i} className="block text-xs text-purple-300 bg-zinc-800 px-2 py-0.5 rounded font-mono truncate">
            {p}
          </code>
        ))}
      </div>
      <div className="text-xs text-zinc-500">Min matches: {match.min_count}</div>
    </div>
  );
}

function EvidenceMatchView({
  match,
  definitions,
}: {
  match: SitEvidenceMatch;
  definitions: Record<string, SitPatternDefinition>;
}) {
  if (match.type === 'keyword_list') {
    const def = definitions[match.id];
    if (!def || def.type !== 'keyword_list') {
      return <span className="text-xs text-zinc-500">Keyword list: {match.id}</span>;
    }
    return (
      <div className="space-y-0.5">
        <div className="text-xs text-zinc-400">Keywords ({match.id})</div>
        <div className="flex flex-wrap gap-1">
          {def.keywords.slice(0, 8).map((kw) => (
            <span key={kw} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              {kw}
            </span>
          ))}
          {def.keywords.length > 8 && (
            <span className="text-xs text-zinc-500">+{def.keywords.length - 8} more</span>
          )}
        </div>
      </div>
    );
  }
  if (match.type === 'regex') {
    const def = definitions[match.id];
    if (!def || def.type !== 'regex') {
      return <span className="text-xs text-zinc-500">Regex: {match.id}</span>;
    }
    return (
      <div className="space-y-0.5">
        <div className="text-xs text-zinc-400">Regex ({match.id})</div>
        {def.patterns.map((p, i) => (
          <code key={i} className="block text-xs text-purple-300 bg-zinc-800 px-2 py-0.5 rounded font-mono truncate">
            {p}
          </code>
        ))}
      </div>
    );
  }
  if (match.type === 'inline_keyword') {
    return (
      <div className="space-y-0.5">
        <div className="text-xs text-zinc-400">Inline Keywords</div>
        <div className="flex flex-wrap gap-1">
          {match.keywords.map((kw) => (
            <span key={kw} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
              {kw}
            </span>
          ))}
        </div>
      </div>
    );
  }
  // inline_regex
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-zinc-400">Inline Regex</div>
      {match.patterns.map((p, i) => (
        <code key={i} className="block text-xs text-purple-300 bg-zinc-800 px-2 py-0.5 rounded font-mono truncate">
          {p}
        </code>
      ))}
    </div>
  );
}

function PatternView({
  pattern,
  index,
  definitions,
}: {
  pattern: SitPattern;
  index: number;
  definitions: Record<string, SitPatternDefinition>;
}) {
  const [open, setOpen] = useState(index === 0);
  const ev = pattern.corroborative_evidence;

  return (
    <div className="border border-zinc-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
      >
        {open ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        <span className="text-xs text-zinc-300 font-medium">Pattern {index + 1}</span>
        {confidenceBadge(pattern.confidence_level)}
        <span className="text-xs text-zinc-500 ml-auto">
          {pattern.primary_match.type === 'entity'
            ? `${pattern.primary_match.entity_types.length} entity type(s)`
            : `${pattern.primary_match.patterns.length} regex`}
          {ev ? ` + ${ev.matches.length} evidence` : ''}
        </span>
      </button>

      {open && (
        <div className="p-3 space-y-3">
          <PrimaryMatchView match={pattern.primary_match} />

          {ev && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Search size={12} className="text-zinc-500" />
                <span className="text-xs text-zinc-400">
                  Corroborative Evidence (need {ev.min_matches} of {ev.matches.length} within {pattern.proximity} chars)
                </span>
              </div>
              <div className="ml-4 space-y-2 border-l border-zinc-700 pl-3">
                {ev.matches.map((m, i) => (
                  <EvidenceMatchView key={i} match={m} definitions={definitions} />
                ))}
              </div>
            </div>
          )}

          {!ev && (
            <div className="text-xs text-zinc-500 italic">No corroborative evidence required</div>
          )}

          <div className="text-xs text-zinc-500 flex items-center gap-1">
            <Shield size={10} />
            Proximity window: {pattern.proximity} characters
          </div>
        </div>
      )}
    </div>
  );
}

export default function SitRuleViewer({ rules }: Props) {
  return (
    <div className="space-y-3">
      {/* File scope */}
      {rules.file_scope && (
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <FileText size={12} />
          {rules.file_scope.file_patterns && rules.file_scope.file_patterns.length > 0 && (
            <span>Files: {rules.file_scope.file_patterns.join(', ')}</span>
          )}
          {rules.file_scope.require_no_existing_label && (
            <span className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">Unlabelled only</span>
          )}
        </div>
      )}

      {/* Patterns */}
      <div className="space-y-2">
        {rules.patterns.map((p, i) => (
          <PatternView key={i} pattern={p} index={i} definitions={rules.definitions ?? {}} />
        ))}
      </div>

      {/* Definitions summary */}
      {Object.keys(rules.definitions ?? {}).length > 0 && (
        <div className="text-xs text-zinc-500 mt-2">
          {Object.keys(rules.definitions).length} shared definition(s): {Object.keys(rules.definitions).join(', ')}
        </div>
      )}
    </div>
  );
}

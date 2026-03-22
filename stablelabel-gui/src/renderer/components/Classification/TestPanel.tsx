import React, { useState } from 'react';
import type { ClassifierConfig, ClassifierEntity, ClassifierAnalyzeResult } from '../../lib/types';

interface TestPanelProps {
  config: ClassifierConfig;
}

const SAMPLE_TEXTS: Record<string, string> = {
  'US PII': 'My name is John Smith and my SSN is 123-45-6789. Reach me at john.smith@example.com or call 555-123-4567.',
  'Credit Cards': 'Please charge my Visa 4111-1111-1111-1111 or Mastercard 5500 0000 0000 0004. My Amex is 3782 822463 10005.',
  'Financial': 'Wire transfer to IBAN DE89370400440532013000. My bank account is 1234567890. Bitcoin address: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa.',
  'International': 'NHS number: 943 476 5919. Australian TFN: 123 456 782. Singapore NRIC: S1234567D.',
  'Mixed': 'Contact Dr. Jane Doe (medical license: AC12345) at 192.168.1.100. Passport: A12345678. Employee ID: EMP-123456.',
};

export default function TestPanel({ config }: TestPanelProps) {
  const [text, setText] = useState('');
  const [results, setResults] = useState<ClassifierEntity[] | null>(null);
  const [entityCounts, setEntityCounts] = useState<Record<string, number>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    if (!text.trim()) return;
    setAnalyzing(true);
    setError(null);
    setResults(null);

    try {
      const response = await window.stablelabel.classifierInvoke('analyze', {
        text,
        config,
      });

      if (response.success) {
        const data = response.data as ClassifierAnalyzeResult;
        setResults(data.results);
        setEntityCounts(data.entity_counts);
      } else {
        setError(response.error ?? 'Analysis failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    }

    setAnalyzing(false);
  };

  const loadSample = (key: string) => {
    setText(SAMPLE_TEXTS[key]);
    setResults(null);
  };

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-zinc-400">
        Test your classification configuration against sample text. Results reflect your current entity settings, thresholds, custom recognizers, and deny lists.
      </p>

      {/* Sample text buttons */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-500">Load sample:</span>
        {Object.keys(SAMPLE_TEXTS).map((key) => (
          <button
            key={key}
            onClick={() => loadSample(key)}
            className="px-2 py-1 text-[11px] text-zinc-400 bg-white/[0.04] hover:bg-white/[0.08] hover:text-zinc-200 rounded transition-colors"
          >
            {key}
          </button>
        ))}
      </div>

      {/* Text input */}
      <div>
        <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">Text to analyze</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Paste or type text to scan for PII..."
          className="w-full px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-y transition-colors font-mono"
        />
      </div>

      <button
        onClick={analyze}
        disabled={analyzing || !text.trim()}
        className="px-4 py-2 text-[13px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40"
      >
        {analyzing ? 'Analyzing...' : 'Analyze Text'}
      </button>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-[12px] text-red-300">
          {error}
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white/[0.03] rounded-xl p-4">
            <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Summary — {results.length} detection{results.length !== 1 ? 's' : ''}
            </h3>
            {Object.keys(entityCounts).length === 0 ? (
              <p className="text-[13px] text-zinc-500">No PII detected in the provided text.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(entityCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <span
                      key={type}
                      className="px-2 py-1 text-[11px] font-mono bg-blue-500/[0.12] text-blue-400 rounded"
                    >
                      {type}: {count}
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Annotated text */}
          {results.length > 0 && (
            <div className="bg-white/[0.03] rounded-xl p-4">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">
                Annotated Text
              </h3>
              <div className="text-[13px] text-zinc-200 leading-relaxed font-mono whitespace-pre-wrap">
                <AnnotatedText text={text} entities={results} />
              </div>
            </div>
          )}

          {/* Detailed results table */}
          {results.length > 0 && (
            <div className="bg-white/[0.03] rounded-xl p-4">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">
                Detections
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-zinc-500 border-b border-white/[0.06]">
                      <th className="text-left py-2 pr-3 font-medium">Entity Type</th>
                      <th className="text-left py-2 pr-3 font-medium">Value</th>
                      <th className="text-left py-2 pr-3 font-medium">Position</th>
                      <th className="text-left py-2 font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-b border-white/[0.03]">
                        <td className="py-1.5 pr-3 font-mono text-blue-400">{r.entity_type}</td>
                        <td className="py-1.5 pr-3 font-mono text-zinc-200">{r.text}</td>
                        <td className="py-1.5 pr-3 text-zinc-500">
                          {r.start}–{r.end}
                        </td>
                        <td className="py-1.5">
                          <ScoreBadge score={r.score} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Render text with highlighted PII entities */
function AnnotatedText({ text, entities }: { text: string; entities: ClassifierEntity[] }) {
  if (entities.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const entity of entities) {
    // Add text before this entity
    if (entity.start > lastEnd) {
      parts.push(text.slice(lastEnd, entity.start));
    }

    // Add highlighted entity
    parts.push(
      <span
        key={`${entity.start}-${entity.end}`}
        className="bg-red-500/20 text-red-300 border-b border-red-500/50 px-0.5"
        title={`${entity.entity_type} (${Math.round(entity.score * 100)}%)`}
      >
        {entity.text}
      </span>,
    );

    lastEnd = entity.end;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd));
  }

  return <>{parts}</>;
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80
      ? 'bg-emerald-500/[0.15] text-emerald-400'
      : pct >= 50
        ? 'bg-amber-500/[0.15] text-amber-400'
        : 'bg-zinc-500/[0.15] text-zinc-400';

  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded ${color}`}>
      {pct}%
    </span>
  );
}

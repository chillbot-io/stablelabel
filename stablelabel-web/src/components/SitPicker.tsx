/**
 * SIT picker for creating policies from pre-built Sensitive Information Types.
 *
 * Displays the SIT catalog grouped by category. Users pick a SIT, see a preview
 * of what it detects, then assign a target label. Optionally expand to see the
 * full SIT-aligned rule definition.
 */

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Shield, ChevronDown, ChevronRight, Zap } from 'lucide-react';
import SitRuleViewer from './SitRuleViewer';
import type { SitDefinition, SitRules } from '@/lib/types';

interface Props {
  onSelect: (sit: SitDefinition) => void;
  selected?: string | null;
}

const CATEGORY_ICONS: Record<string, string> = {
  Healthcare: '🏥',
  Financial: '💳',
  Privacy: '🔒',
  Security: '🔑',
  Business: '📄',
};

export default function SitPicker({ onSelect, selected }: Props) {
  const [catalog, setCatalog] = useState<SitDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSit, setExpandedSit] = useState<string | null>(null);

  useEffect(() => {
    api.get<SitDefinition[]>('/sit-catalog')
      .then(setCatalog)
      .catch(() => setCatalog([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-sm text-zinc-500 py-4 text-center">Loading SIT catalog...</div>;
  }

  // Group by category
  const categories = new Map<string, SitDefinition[]>();
  for (const sit of catalog) {
    const list = categories.get(sit.category) ?? [];
    list.push(sit);
    categories.set(sit.category, list);
  }

  return (
    <div className="space-y-4">
      {[...categories.entries()].map(([category, sits]) => (
        <div key={category}>
          <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span>{CATEGORY_ICONS[category] ?? '📋'}</span>
            {category}
          </div>

          <div className="space-y-1.5">
            {sits.map((sit) => {
              const isSelected = selected === sit.id;
              const isExpanded = expandedSit === sit.id;

              return (
                <div
                  key={sit.id}
                  className={`border rounded-lg transition-all ${
                    isSelected
                      ? 'border-blue-600 bg-blue-950/30'
                      : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                  }`}
                >
                  {/* Main row — click to select */}
                  <button
                    type="button"
                    onClick={() => onSelect(sit)}
                    className="w-full text-left px-3 py-2.5 flex items-start gap-3"
                  >
                    <div className={`mt-0.5 shrink-0 ${isSelected ? 'text-blue-400' : 'text-zinc-500'}`}>
                      <Shield size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isSelected ? 'text-blue-300' : 'text-zinc-200'}`}>
                          {sit.name}
                        </span>
                        {isSelected && <Zap size={12} className="text-blue-400" />}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{sit.description}</div>
                      {sit.regulations.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {sit.regulations.map((r) => (
                            <span
                              key={r}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 border border-zinc-700"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Pattern count badge */}
                    <span className="text-xs text-zinc-500 shrink-0 mt-0.5">
                      {sit.rules.patterns.length} pattern{sit.rules.patterns.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {/* Expand/collapse toggle for rule details */}
                  {isSelected && (
                    <div className="border-t border-zinc-700/50">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedSit(isExpanded ? null : sit.id);
                        }}
                        className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
                      >
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {isExpanded ? 'Hide detection rules' : 'View detection rules'}
                      </button>

                      {isExpanded && (
                        <div className="px-3 pb-3">
                          <SitRuleViewer rules={sit.rules as SitRules} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {catalog.length === 0 && (
        <div className="text-sm text-zinc-500 py-4 text-center">
          No SIT definitions available.
        </div>
      )}
    </div>
  );
}

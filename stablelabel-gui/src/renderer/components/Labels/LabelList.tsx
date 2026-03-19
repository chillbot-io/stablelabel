import React, { useEffect, useState } from 'react';
import { usePowerShell } from '../../hooks/usePowerShell';
import { usePagination } from '../../hooks/usePagination';
import type { LabelTreeNode } from '../../lib/types';

interface LabelListProps {
  onOpenLabel: (id: string, name: string) => void;
}

export default function LabelList({ onOpenLabel }: LabelListProps) {
  const { invoke } = usePowerShell();
  const [tree, setTree] = useState<LabelTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const fetchLabels = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<LabelTreeNode[]>('Get-SLLabel', { Tree: true });
      if (result.success && Array.isArray(result.data)) {
        setTree(result.data);
        // Auto-expand all parents that have sublabels
        const expanded = new Set<string>();
        result.data.forEach((node) => {
          if (node.SubLabels?.length > 0) expanded.add(node.Id);
        });
        setExpandedIds(expanded);
      } else {
        setError(result.error ?? 'Failed to load labels');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load labels');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLabels();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredTree = search.trim()
    ? tree.filter((node) => {
        const q = search.toLowerCase();
        if (node.Name.toLowerCase().includes(q)) return true;
        return node.SubLabels?.some((s) => s.Name.toLowerCase().includes(q));
      })
    : tree;

  const { visible: paginatedTree, hasMore, remaining, loadMore } = usePagination(filteredTree);

  if (loading) {
    return (
      <div className="p-4">
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-white/[0.06] rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="text-sm text-red-400 mb-2">{error}</div>
        <button onClick={fetchLabels} className="text-xs text-blue-400 hover:text-blue-300">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-2 border-b border-white/[0.06]">
        <input
          type="text"
          placeholder="Search labels..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs bg-white/[0.06] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Count */}
      <div className="px-3 py-1.5 text-xs text-zinc-500 border-b border-white/[0.04]">
        {tree.length} labels ({tree.reduce((n, t) => n + (t.SubLabels?.length ?? 0), 0)} sublabels)
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {paginatedTree.length === 0 ? (
          <p className="p-4 text-xs text-zinc-600">No labels found.</p>
        ) : (
          <>
          {paginatedTree.map((node) => (
            <LabelTreeItem
              key={node.Id}
              node={node}
              expanded={expandedIds.has(node.Id)}
              onToggle={() => toggleExpand(node.Id)}
              onOpen={onOpenLabel}
              searchQuery={search}
            />
          ))}
          {hasMore && (
            <button onClick={loadMore} className="w-full py-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-white/[0.04] transition-colors">
              Show {remaining} more...
            </button>
          )}
          </>
        )}
      </div>

      {/* Refresh */}
      <div className="p-2 border-t border-white/[0.06]">
        <button
          onClick={fetchLabels}
          className="w-full py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-white/[0.06] hover:bg-white/[0.08] rounded-lg transition-colors"
        >
          Refresh Labels
        </button>
      </div>
    </div>
  );
}

function LabelTreeItem({
  node,
  expanded,
  onToggle,
  onOpen,
  searchQuery,
}: {
  node: LabelTreeNode;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: string, name: string) => void;
  searchQuery: string;
}) {
  const hasChildren = node.SubLabels && node.SubLabels.length > 0;

  return (
    <div>
      <div className="flex items-center group">
        {/* Expand/collapse toggle */}
        <button
          onClick={hasChildren ? onToggle : undefined}
          className={`w-6 h-6 flex items-center justify-center text-zinc-500 flex-shrink-0 ${
            hasChildren ? 'hover:text-zinc-300 cursor-pointer' : 'cursor-default'
          }`}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : ' '}
        </button>

        {/* Label name — click to open */}
        <button
          onClick={() => onOpen(node.Id, node.Name)}
          className="flex-1 text-left px-1.5 py-1 text-sm text-zinc-200 hover:bg-white/[0.06] rounded-lg truncate flex items-center gap-2 group-hover:bg-white/[0.04]"
          title={node.Tooltip ?? node.Name}
        >
          <HighlightText text={node.Name} query={searchQuery} />
          {!node.IsActive && (
            <span className="text-[10px] px-1 py-0.5 bg-white/[0.08] text-zinc-400 rounded-lg">
              inactive
            </span>
          )}
          {hasChildren && (
            <span className="text-[10px] text-zinc-600">{node.SubLabels.length}</span>
          )}
        </button>
      </div>

      {/* Sublabels */}
      {expanded && hasChildren && (
        <div className="ml-4">
          {node.SubLabels.map((sub) => (
            <button
              key={sub.Id}
              onClick={() => onOpen(sub.Id, `${node.Name} / ${sub.Name}`)}
              className="w-full flex items-center gap-2 pl-4 pr-2 py-1 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] rounded-lg text-left group"
              title={sub.Tooltip ?? sub.Name}
            >
              <span className="w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" />
              <HighlightText text={sub.Name} query={searchQuery} />
              {!sub.IsActive && (
                <span className="text-[10px] px-1 py-0.5 bg-white/[0.08] text-zinc-400 rounded-lg">
                  inactive
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span className="truncate">{text}</span>;

  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span className="truncate">{text}</span>;

  return (
    <span className="truncate">
      {text.slice(0, idx)}
      <span className="bg-yellow-500/30 text-yellow-200">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </span>
  );
}

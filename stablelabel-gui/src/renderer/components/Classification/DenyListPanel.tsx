import React, { useState } from 'react';

interface DenyListPanelProps {
  denyLists: Record<string, string[]>;
  entityTypes: string[];
  onChange: (denyLists: Record<string, string[]>) => void;
}

export default function DenyListPanel({ denyLists, entityTypes, onChange }: DenyListPanelProps) {
  const [selectedEntity, setSelectedEntity] = useState(entityTypes[0] ?? '');
  const [input, setInput] = useState('');

  const currentList = denyLists[selectedEntity] ?? [];

  const addValue = () => {
    const val = input.trim();
    if (!val || !selectedEntity) return;
    if (currentList.includes(val)) {
      setInput('');
      return;
    }
    onChange({
      ...denyLists,
      [selectedEntity]: [...currentList, val],
    });
    setInput('');
  };

  const removeValue = (val: string) => {
    const updated = currentList.filter((v) => v !== val);
    const newLists = { ...denyLists };
    if (updated.length === 0) {
      delete newLists[selectedEntity];
    } else {
      newLists[selectedEntity] = updated;
    }
    onChange(newLists);
  };

  const clearAll = () => {
    const newLists = { ...denyLists };
    delete newLists[selectedEntity];
    onChange(newLists);
  };

  // Count total deny list entries across all entities
  const totalEntries = Object.values(denyLists).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-zinc-400">
        Values in deny lists will be ignored during analysis even if they match a pattern.
        Use this for known-safe test data, placeholder values, etc.
      </p>

      <div className="flex gap-4">
        {/* Entity type selector */}
        <div className="w-56 flex-shrink-0">
          <label className="block text-[12px] font-medium text-zinc-400 mb-1.5">Entity Type</label>
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 focus:outline-none focus:border-blue-500 transition-colors"
          >
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {t} {(denyLists[t]?.length ?? 0) > 0 ? `(${denyLists[t].length})` : ''}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-zinc-600 mt-1">{totalEntries} total deny list entries</p>
        </div>

        {/* Deny list values */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[12px] font-medium text-zinc-400">
              Denied values for {selectedEntity}
            </label>
            {currentList.length > 0 && (
              <button
                onClick={clearAll}
                className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="bg-white/[0.03] rounded-xl p-4 space-y-3">
            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addValue();
                  }
                }}
                placeholder="e.g., 000-00-0000"
                className="flex-1 px-3 py-2 text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              />
              <button
                onClick={addValue}
                disabled={!input.trim()}
                className="px-3 py-2 text-[12px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-40"
              >
                Add
              </button>
            </div>

            {/* List */}
            {currentList.length === 0 ? (
              <p className="text-[12px] text-zinc-600 text-center py-4">
                No denied values for {selectedEntity}
              </p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {currentList.map((val) => (
                  <div
                    key={val}
                    className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] rounded-lg"
                  >
                    <span className="text-[12px] font-mono text-zinc-300">{val}</span>
                    <button
                      onClick={() => removeValue(val)}
                      className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

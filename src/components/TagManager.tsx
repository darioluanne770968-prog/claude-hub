'use client';

import { useState, useEffect, useRef } from 'react';
import { Tag, Plus, X, Sparkles, Loader2 } from 'lucide-react';

interface TagManagerProps {
  sessionId: string;
  compact?: boolean;
}

export default function TagManager({ sessionId, compact = false }: TagManagerProps) {
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [autoTagging, setAutoTagging] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTags();
    fetchAllTags();
  }, [sessionId]);

  const fetchTags = async () => {
    try {
      const res = await fetch(`/api/tags?sessionId=${sessionId}`);
      const data = await res.json();
      setTags(data.tags || []);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  };

  const fetchAllTags = async () => {
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      setAllTags(data.allTags || []);
    } catch (error) {
      console.error('Failed to fetch all tags:', error);
    }
  };

  const addTag = async (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (!trimmedTag || tags.includes(trimmedTag)) return;

    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, tag: trimmedTag }),
      });
      const data = await res.json();
      if (data.success) {
        setTags(data.tags);
        if (!allTags.includes(trimmedTag)) {
          setAllTags([...allTags, trimmedTag].sort());
        }
      }
    } catch (error) {
      console.error('Failed to add tag:', error);
    }

    setNewTag('');
    setIsAdding(false);
    setSuggestions([]);
  };

  const removeTag = async (tag: string) => {
    try {
      const res = await fetch('/api/tags', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, tag }),
      });
      const data = await res.json();
      if (data.success) {
        setTags(data.tags);
      }
    } catch (error) {
      console.error('Failed to remove tag:', error);
    }
  };

  const handleInputChange = (value: string) => {
    setNewTag(value);
    if (value.trim()) {
      const filtered = allTags.filter(
        t => t.includes(value.toLowerCase()) && !tags.includes(t)
      );
      setSuggestions(filtered.slice(0, 5));
    } else {
      setSuggestions([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(newTag);
    } else if (e.key === 'Escape') {
      setIsAdding(false);
      setNewTag('');
      setSuggestions([]);
    }
  };

  const handleAutoTag = async () => {
    setAutoTagging(true);
    setSuggestedTags([]);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/auto-tag`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success && data.tags) {
        // Filter out tags that already exist
        const newTags = data.tags.filter((t: string) => !tags.includes(t));
        setSuggestedTags(newTags);
      }
    } catch (error) {
      console.error('Failed to auto-generate tags:', error);
    } finally {
      setAutoTagging(false);
    }
  };

  const acceptSuggestedTag = async (tag: string) => {
    await addTag(tag);
    setSuggestedTags(prev => prev.filter(t => t !== tag));
  };

  const dismissSuggestedTags = () => {
    setSuggestedTags([]);
  };

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  if (compact) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
          >
            {tag}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Tag size={14} className="text-zinc-400" />

      {tags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 group"
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity"
          >
            <X size={12} />
          </button>
        </span>
      ))}

      {isAdding ? (
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={newTag}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              setTimeout(() => {
                setIsAdding(false);
                setSuggestions([]);
              }, 200);
            }}
            placeholder="输入标签..."
            className="px-2 py-1 text-xs rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 focus:outline-none focus:border-amber-500 w-24"
          />
          {suggestions.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-10">
              {suggestions.map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => addTag(suggestion)}
                  className="block w-full text-left px-2 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <Plus size={12} />
            添加标签
          </button>
          <button
            onClick={handleAutoTag}
            disabled={autoTagging}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50"
            title="AI 自动生成标签"
          >
            {autoTagging ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            AI 标签
          </button>
        </>
      )}

      {/* Suggested tags from AI */}
      {suggestedTags.length > 0 && (
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-zinc-300 dark:border-zinc-600">
          <span className="text-xs text-zinc-500">建议:</span>
          {suggestedTags.map(tag => (
            <button
              key={tag}
              onClick={() => acceptSuggestedTag(tag)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
            >
              <Plus size={10} />
              {tag}
            </button>
          ))}
          <button
            onClick={dismissSuggestedTags}
            className="p-1 text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

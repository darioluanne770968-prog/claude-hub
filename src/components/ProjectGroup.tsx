'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import SessionCard from './SessionCard';

interface SessionSource {
  type: 'local' | 'remote';
  hostId?: string;
  hostName?: string;
}

interface SummaryWithTimestamp {
  text: string;
  timestamp: string;
}

interface Session {
  id: string;
  provider?: 'claude' | 'codex';
  projectPath: string;
  projectName: string;
  originalProjectPath?: string;
  summaries: string[];
  summariesWithTimestamps?: SummaryWithTimestamp[];
  customName?: string;
  lastModified: string;
  firstMessage?: string;
  messageCount: number;
  source?: SessionSource;
  tags?: string[];
  isIde?: boolean;
}

interface ProjectGroupProps {
  name: string;
  path: string;
  sessions: Session[];
  defaultExpanded?: boolean;
  onDeleteSession?: (id: string) => void;
  onRenameSession?: (id: string, newName: string) => void;
}

export default function ProjectGroup({
  name,
  path,
  sessions,
  defaultExpanded = true,
  onDeleteSession,
  onRenameSession,
}: ProjectGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        {expanded ? (
          <ChevronDown size={18} className="text-zinc-400" />
        ) : (
          <ChevronRight size={18} className="text-zinc-400" />
        )}
        <Folder size={18} className="text-amber-500" />
        <span className="font-medium text-zinc-900 dark:text-white group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
          {name}
        </span>
        <span className="text-sm text-zinc-500">({sessions.length} sessions)</span>
        <span className="text-xs text-zinc-400 dark:text-zinc-600 truncate ml-2">{path}</span>
      </button>

      {expanded && (
        <div className="grid gap-3 pl-6">
          {sessions.map((session) => (
            <SessionCard key={session.id} {...session} onDelete={onDeleteSession} onRename={onRenameSession} />
          ))}
        </div>
      )}
    </div>
  );
}

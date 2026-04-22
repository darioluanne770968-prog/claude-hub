'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { User, Bot, RefreshCw, MessageSquare, X } from 'lucide-react';

interface SessionSource {
    type: 'local' | 'remote';
    hostId?: string;
    hostName?: string;
}

interface ContentItem {
    type: string;
    text?: string;
    thinking?: string;
    commandResult?: string;
    summaryText?: string;
}

interface Message {
    type: string;
    uuid: string;
    timestamp: string;
    richContent: ContentItem[];
    role: string;
}

interface SessionPreviewData {
    id: string;
    projectName: string;
    messages: Message[];
    customName?: string;
    summaries: string[];
}

interface SessionPreviewProps {
    sessionId: string;
    projectPath: string;
    source?: SessionSource;
    anchorRect: DOMRect;
    onClose: () => void;
}

// Simple in-memory cache
const previewCache = new Map<string, SessionPreviewData>();

export default function SessionPreview({
    sessionId,
    projectPath,
    source,
    anchorRect,
    onClose,
}: SessionPreviewProps) {
    const [data, setData] = useState<SessionPreviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    // Calculate position - above the card, centered horizontally
    const getPosition = useCallback(() => {
        const padding = 8;
        const previewWidth = 400;
        const previewMaxHeight = 400;

        // Center horizontally relative to the card
        let left = anchorRect.left + (anchorRect.width / 2) - (previewWidth / 2);

        // Position above the card
        let top = anchorRect.top - previewMaxHeight - padding;

        // If not enough space above, show below the card
        if (top < padding) {
            top = anchorRect.bottom + padding;
        }

        // Ensure it doesn't go off the left edge
        if (left < padding) {
            left = padding;
        }

        // Ensure it doesn't go off the right edge
        if (left + previewWidth > window.innerWidth - padding) {
            left = window.innerWidth - previewWidth - padding;
        }

        return { left, top };
    }, [anchorRect]);

    // Fetch session data
    useEffect(() => {
        const cacheKey = `${sessionId}-${source?.hostId || 'local'}`;

        // Check cache first
        if (previewCache.has(cacheKey)) {
            setData(previewCache.get(cacheKey)!);
            setLoading(false);
            return;
        }

        const controller = new AbortController();

        const fetchData = async () => {
            try {
                let url = `/api/sessions/${sessionId}`;
                if (source?.type === 'remote' && source.hostId) {
                    url += `?hostId=${source.hostId}&projectPath=${encodeURIComponent(projectPath)}`;
                }

                const res = await fetch(url, { signal: controller.signal });
                if (!res.ok) throw new Error('Failed to load preview');

                const sessionData = await res.json();
                previewCache.set(cacheKey, sessionData);
                setData(sessionData);
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    setError('无法加载预览');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData();

        return () => controller.abort();
    }, [sessionId, projectPath, source]);

    // Handle ESC key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Extract text from content item
    const getTextContent = (item: ContentItem): string => {
        if (item.text) return item.text;
        if (item.thinking) return `[思考] ${item.thinking}`;
        if (item.commandResult) return `[命令结果] ${item.commandResult}`;
        if (item.summaryText) return `[上下文] ${item.summaryText}`;
        return '';
    };

    // Get message preview text
    const getMessagePreview = (message: Message): string => {
        const texts = message.richContent
            .map(getTextContent)
            .filter(Boolean);

        const fullText = texts.join(' ');
        if (fullText.length > 150) {
            return fullText.slice(0, 150) + '...';
        }
        return fullText || '(空消息)';
    };

    const position = getPosition();

    const content = (
        <div
            ref={previewRef}
            style={{
                position: 'fixed',
                left: position.left,
                top: position.top,
                zIndex: 9999,
            }}
            className="w-[400px] max-h-[400px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    <MessageSquare size={16} className="text-amber-500" />
                    <span>会话预览</span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3">
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <RefreshCw size={20} className="animate-spin text-zinc-400" />
                    </div>
                ) : error ? (
                    <div className="text-center py-8 text-zinc-500 text-sm">{error}</div>
                ) : data ? (
                    <div className="space-y-2">
                        {data.messages.slice(0, 300).map((message, index) => {
                            const isUser = message.role === 'user' && message.type !== 'tool-result';
                            const previewText = getMessagePreview(message);

                            if (!previewText || previewText === '(空消息)') return null;

                            return (
                                <div
                                    key={message.uuid || index}
                                    className={`flex gap-2 p-2 rounded-lg text-sm ${isUser
                                        ? 'bg-amber-50 dark:bg-amber-900/20'
                                        : 'bg-zinc-50 dark:bg-zinc-800/50'
                                        }`}
                                >
                                    <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isUser
                                        ? 'bg-amber-100 dark:bg-amber-800 text-amber-600 dark:text-amber-400'
                                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                                        }`}>
                                        {isUser ? <User size={12} /> : <Bot size={12} />}
                                    </div>
                                    <p className="flex-1 text-zinc-700 dark:text-zinc-300 leading-relaxed break-words">
                                        {previewText}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
            </div>

            {/* Footer */}
            {data && (
                <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50">
                    <p className="text-xs text-zinc-500 text-center">
                        共 {data.messages.length} 条消息 · 点击卡片查看完整对话
                    </p>
                </div>
            )}
        </div>
    );

    // Use portal to render outside of parent overflow constraints
    if (typeof window === 'undefined') return null;

    return createPortal(content, document.body);
}

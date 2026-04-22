'use client';

/**
 * 自动清理组件
 * 在应用启动时自动触发清理旧消息
 */

import { useEffect } from 'react';

export default function AutoCleanup() {
  useEffect(() => {
    // 延迟 3 秒后执行清理,避免阻塞应用启动
    const timer = setTimeout(() => {
      fetch('/api/cleanup', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.lastCleanup) {
            const { deleted_messages, deleted_sessions } = data.lastCleanup;
            if (deleted_messages > 0 || deleted_sessions > 0) {
              console.log(
                `[Auto Cleanup] Cleaned up ${deleted_messages} messages and ${deleted_sessions} sessions`
              );
            }
          }
        })
        .catch(error => {
          console.error('[Auto Cleanup] Error:', error);
        });
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  // 不渲染任何内容
  return null;
}

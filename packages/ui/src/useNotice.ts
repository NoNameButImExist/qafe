import { useEffect, useState } from 'react';

export interface NoticeMessage {
  tone: 'success' | 'error';
  text: string;
}

/** Short-lived message after an action; announced to screen readers. */
export function useNotice() {
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  return [notice, setNotice] as const;
}

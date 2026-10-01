import { useEffect, useState } from 'react';

/**
 * Text box state for a search kept in the URL: typing updates the box at once,
 * and `apply` runs after a short pause with the trimmed text.
 */
export function useSearchText(
  current: string | undefined,
  apply: (text: string | undefined) => void,
) {
  const [text, setText] = useState(current ?? '');
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = text.trim() || undefined;
      if (next !== current) apply(next);
    }, 300);
    return () => clearTimeout(timer);
  }, [text, current, apply]);
  return [text, setText] as const;
}

import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from './cn';
import type { NoticeMessage } from './useNotice';

export function Notice({
  notice,
  className,
}: {
  notice: NoticeMessage | null;
  className?: string;
}) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {notice && (
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-xl border px-4 py-3 text-[13px] font-medium',
            notice.tone === 'success'
              ? 'border-success/25 bg-success/8 text-success'
              : 'border-danger/25 bg-danger/8 text-danger',
            className,
          )}
        >
          {notice.tone === 'success' ? (
            <CircleCheck className="size-4 shrink-0" />
          ) : (
            <CircleAlert className="size-4 shrink-0" />
          )}
          {notice.text}
        </div>
      )}
    </div>
  );
}

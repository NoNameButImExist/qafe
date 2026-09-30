import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface PaginationProps {
  summary: string;
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}

export function Pagination({ summary, page, pageSize, total, onPage }: PaginationProps) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
      <span>{summary}</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline">{t('common.pageOf', { page, pages })}</span>
          <PageButton
            label={t('common.previous')}
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </PageButton>
          <PageButton
            label={t('common.next')}
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight className="size-4" />
          </PageButton>
        </div>
      )}
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink hover:bg-surface-2 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

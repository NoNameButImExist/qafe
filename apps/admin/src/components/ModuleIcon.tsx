import { Blocks, ChefHat, CreditCard, Languages, type LucideIcon } from 'lucide-react';
import { cn } from '@qafe/ui';

const ICONS: Record<string, LucideIcon> = {
  kds: ChefHat,
  online_payments: CreditCard,
  translations: Languages,
};

export function ModuleIcon({
  code,
  active = true,
  className,
}: {
  code: string;
  active?: boolean;
  className?: string;
}) {
  const Icon = ICONS[code] ?? Blocks;
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-xl transition-colors',
        active ? 'bg-primary/12 text-accent' : 'bg-surface-2 text-muted',
        className,
      )}
    >
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

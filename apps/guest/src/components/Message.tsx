import { Button } from '@qafe/ui';
import { LoaderCircle } from 'lucide-react';

/** A full-screen message: loading, an invalid QR code, a blocked device… */
export function Message({
  title,
  body,
  loading,
  action,
}: {
  title: string;
  body?: string;
  loading?: boolean;
  action?: { label: string; onClick: () => void; loading?: boolean };
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-6 text-center">
      <div className="flex max-w-sm flex-col items-center gap-3">
        {loading && <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden />}
        <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
        {body && <p className="text-sm text-muted">{body}</p>}
        {action && (
          <Button className="mt-2" onClick={action.onClick} loading={action.loading}>
            {action.label}
          </Button>
        )}
      </div>
    </main>
  );
}

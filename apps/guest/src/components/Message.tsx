import { Button } from '@qafe/ui';
import { m } from 'motion/react';

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
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex max-w-sm flex-col items-center gap-3"
      >
        {loading && (
          <span aria-hidden className="mb-2 flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <m.span
                key={i}
                className="size-3 rounded-full bg-primary"
                animate={{ y: [0, -10, 0], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
              />
            ))}
          </span>
        )}
        <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
        {body && <p className="text-sm text-muted">{body}</p>}
        {action && (
          <Button className="mt-2" onClick={action.onClick} loading={action.loading}>
            {action.label}
          </Button>
        )}
      </m.div>
    </main>
  );
}

import { ImagePlus, LoaderCircle, Trash } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cn } from '@qafe/ui';
import { errorKey } from '../lib/api';

interface ImageInputProps {
  url: string | null;
  /** Uploads the file and returns its URL. */
  onUpload: (file: File) => Promise<unknown>;
  onRemove: () => void;
  chooseLabel: string;
  changeLabel: string;
  removeLabel: string;
  hint: string;
  disabled?: boolean;
  className?: string;
}

/** Image preview with upload and remove; errors are shown under the preview. */
export function ImageInput({
  url,
  onUpload,
  onRemove,
  chooseLabel,
  changeLabel,
  removeLabel,
  hint,
  disabled,
  className,
}: ImageInputProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className={cn('flex items-start gap-4', className)}>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => input.current?.click()}
        className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface-2 text-muted transition-colors hover:border-primary hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={url ? changeLabel : chooseLabel}
      >
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-7" />
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-surface/70">
            <LoaderCircle className="size-6 animate-spin text-primary" />
          </span>
        )}
      </button>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled || busy}
            onClick={() => input.current?.click()}
            icon={<ImagePlus className="size-4" />}
          >
            {url ? changeLabel : chooseLabel}
          </Button>
          {url && (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || busy}
              onClick={onRemove}
              icon={<Trash className="size-4" />}
            >
              {removeLabel}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">{hint}</p>
        {error && <p className="text-xs font-medium text-danger">{error}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  );
}

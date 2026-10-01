import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { cn } from '@qafe/ui';

/**
 * QR code as inline SVG (sharp in print). Error correction "M" survives a small scratch
 * or a fold on a table card.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toString(value, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#0B1F3F', light: '#FFFFFF' },
    }).then((result) => {
      if (!cancelled) setSvg(result);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'aspect-square [&>svg]:size-full',
        !svg && 'animate-pulse rounded-lg bg-surface-2',
        className,
      )}
      // The SVG comes from the qrcode library for a URL we built; it contains no user markup.
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/** Label, control, hint and error, wired together for screen readers. */
export function Field({ label, hint, error, required, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const control =
  'rounded-xl border bg-surface text-sm text-ink placeholder:text-muted/70 transition-colors ' +
  'border-line hover:border-line-strong focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  trailing?: ReactNode;
}

export function Input({ icon, trailing, className, ...props }: InputProps) {
  return (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">
          {icon}
        </span>
      )}
      <input
        className={cn(
          control,
          'h-11 w-full',
          icon ? 'pl-10' : 'pl-3.5',
          trailing ? 'pr-11' : 'pr-3.5',
          className,
        )}
        {...props}
      />
      {trailing && (
        <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span>
      )}
    </div>
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, 'h-11 cursor-pointer px-3.5', className ?? 'w-full')} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(control, 'min-h-24 w-full resize-y px-3.5 py-2.5 leading-relaxed', className)}
      {...props}
    />
  );
}

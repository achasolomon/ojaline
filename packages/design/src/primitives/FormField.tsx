import type { ReactNode } from 'react';

export interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({ label, error, hint, children, className = '' }: FormFieldProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      <label className="mb-1.5 text-sm font-medium text-text">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-textSecondary">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from 'react';
import { colors, radius, spacing, type } from './tokens';

export function Button({
  variant = 'primary',
  style,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
}) {
  const base: CSSProperties = {
    fontFamily: type.family,
    fontSize: type.fontSize.base,
    fontWeight: type.weight.semibold,
    padding: `${spacing.sm} ${spacing.lg}`,
    borderRadius: radius.md,
    border: `1px solid ${colors.border}`,
    cursor: 'pointer',
  };
  const variants: Record<'primary' | 'ghost', CSSProperties> = {
    primary: { backgroundColor: colors.primary, color: colors.bg },
    ghost: { backgroundColor: 'transparent', color: colors.text },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {children}
    </button>
  );
}

export function Card({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <section
      style={{
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        padding: spacing.lg,
        ...style,
      }}
    >
      {title ? (
        <h2
          style={{
            margin: 0,
            marginBottom: spacing.md,
            color: colors.text,
            fontSize: type.fontSize.lg,
            fontWeight: type.weight.semibold,
          }}
        >
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

export function Input({
  style,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      style={{
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: type.family,
        fontSize: type.fontSize.base,
        color: colors.text,
        backgroundColor: colors.inputBg,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.md,
        padding: spacing.sm,
        ...style,
      }}
      {...rest}
    />
  );
}

export function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: 'block', marginBottom: spacing.md }}>
      <span
        style={{
          display: 'block',
          marginBottom: spacing.xs,
          color: colors.textMuted,
          fontSize: type.fontSize.sm,
          fontWeight: type.weight.medium,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
});

export function Price({ value }: { value: number }) {
  return (
    <span style={{ color: colors.primary, fontWeight: type.weight.bold }}>
      {naira.format(value)}
    </span>
  );
}

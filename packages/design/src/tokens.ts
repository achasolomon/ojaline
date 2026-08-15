export const colors = {
  bg: '#0f172a',
  surface: '#1e293b',
  surfaceHover: '#334155',
  border: '#334155',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  primary: '#f59e0b',
  primaryHover: '#d97706',
  success: '#22c55e',
  danger: '#ef4444',
  inputBg: '#0b1220',
} as const;

export const type = {
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.5rem',
    '2xl': '2rem',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  family:
    "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
} as const;

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '1rem',
  lg: '1.5rem',
  xl: '2rem',
  '2xl': '3rem',
} as const;

export const radius = {
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  full: '9999px',
} as const;

export type DesignTokens = {
  colors: typeof colors;
  type: typeof type;
  spacing: typeof spacing;
  radius: typeof radius;
};

export const tokens: DesignTokens = { colors, type, spacing, radius };

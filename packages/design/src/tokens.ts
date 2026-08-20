export const colors = {
  primary: '#008A3C',
  primaryDark: '#006B30',
  primaryLight: '#EAF7EF',
  bg: '#FFFFFF',
  bgSecondary: '#F7F8F7',
  text: '#171717',
  textSecondary: '#6B6B6B',
  border: '#E6E8E6',
  danger: '#D92D20',
  success: '#008A3C',
  gold: '#F5A623',
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.5)',
} as const;

export const type = {
  fontSize: {
    xs: '0.6875rem',
    sm: '0.75rem',
    base: '0.9375rem',
    lg: '1rem',
    xl: '1.375rem',
    '2xl': '1.5rem',
    '3xl': '1.625rem',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  family:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
  full: '9999px',
} as const;

export const shadow = {
  sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  md: '0 4px 12px rgba(0,0,0,0.08)',
} as const;

export const layout = {
  navHeight: '64px',
  headerHeight: '56px',
} as const;

export type DesignTokens = {
  colors: typeof colors;
  type: typeof type;
  spacing: typeof spacing;
  radius: typeof radius;
  shadow: typeof shadow;
  layout: typeof layout;
};

export const tokens: DesignTokens = { colors, type, spacing, radius, shadow, layout };

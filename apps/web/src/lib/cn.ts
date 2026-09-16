export type ClassValue = string | number | 0 | false | null | undefined | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const parts: string[] = [];

  const visit = (v: ClassValue): void => {
    if (!v) return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }
    parts.push(String(v));
  };

  for (const input of inputs) visit(input);
  return parts.join(' ');
}

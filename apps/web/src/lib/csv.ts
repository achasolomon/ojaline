function escapeField(value: unknown): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCSV(
  rows: Record<string, unknown>[],
  columns: Array<{ key: string; header: string }>,
): string {
  const header = columns.map((c) => escapeField(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escapeField(row[c.key])).join(',')
  );
  // BOM for UTF-8 Excel compatibility
  return '\uFEFF' + header + '\n' + lines.join('\n');
}

export function downloadCSV(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

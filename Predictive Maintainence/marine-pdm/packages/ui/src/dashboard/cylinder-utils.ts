export function cylName(idx: number): string {
  return idx < 10 ? `A${idx + 1}` : `B${idx - 9}`;
}

export function riskColor(risk: number): string {
  if (risk >= 75) return 'var(--risk-critical)';
  if (risk >= 50) return 'var(--risk-high)';
  if (risk >= 25) return 'var(--risk-warning)';
  return 'var(--risk-normal)';
}

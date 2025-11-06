export function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();

  // Split manually to avoid UTC conversion
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // local midnight
}

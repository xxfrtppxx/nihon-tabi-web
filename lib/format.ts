export function placeName(nameEn: string, nameJa: string): string {
  return `${nameEn} (${nameJa})`;
}

// dd/MM/yyyy, zero-padded — done by hand rather than via toLocaleDateString
// so it doesn't depend on the browser's locale/ICU data agreeing on the
// separator and padding.
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

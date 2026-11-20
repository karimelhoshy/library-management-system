/** ISBN helpers. We store ISBN-13 without dashes. */

function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(first9[i]);
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
}

function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

/** Strips spaces and dashes, upper-cases a trailing x. */
export function cleanIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

export function isValidIsbn(raw: string): boolean {
  const isbn = cleanIsbn(raw);
  if (/^\d{9}[\dX]$/.test(isbn)) return isbn10CheckDigit(isbn.slice(0, 9)) === isbn[9];
  if (/^\d{13}$/.test(isbn)) return isbn13CheckDigit(isbn.slice(0, 12)) === isbn[12];
  return false;
}

/** Returns a valid ISBN-13 (converting ISBN-10), or null if the input isn't a valid ISBN. */
export function toIsbn13(raw: string): string | null {
  const isbn = cleanIsbn(raw);
  if (!isValidIsbn(isbn)) return null;
  if (isbn.length === 13) return isbn;
  const first12 = `978${isbn.slice(0, 9)}`;
  return first12 + isbn13CheckDigit(first12);
}

/** Looks like the user typed an ISBN (used to route catalog search to an exact match). */
export function looksLikeIsbn(raw: string): boolean {
  return /^[\d\s-]{9,17}[\dXx]?$/.test(raw.trim()) && isValidIsbn(raw);
}

export function openLibraryCoverUrl(isbn13: string, size: "S" | "M" | "L" = "L"): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn13}-${size}.jpg`;
}

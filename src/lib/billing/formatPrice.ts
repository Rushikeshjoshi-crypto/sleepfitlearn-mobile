// The currency's own decimals ($4.99, £3.99 — maximumFractionDigits: 0 used to
// show those as "$5" / "£4"), with .00 dropped for whole amounts (₹399). A
// missing/invalid currency code makes Intl throw — fall back to the number.
export function formatPrice(amount: number, currency: string | null | undefined, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency as string,
      trailingZeroDisplay: "stripIfInteger",
    } as Intl.NumberFormatOptions).format(amount);
  } catch {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
  }
}

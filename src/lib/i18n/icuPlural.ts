// Web's messages/*.json embeds a few counted strings using next-intl's ICU
// MessageFormat plural syntax directly, e.g.
// "{count, plural, one {# session} other {# sessions}}" — next-intl parses
// ICU natively, but react-i18next does not (it has its own _one/_other key
// suffix convention instead). Rather than pull in a full ICU MessageFormat
// dependency for the handful of strings that use this, this parses just
// that one constrained shape: a single `{count, plural, ...}` block (each
// branch's body is plain text with a literal `#` placeholder for the
// count), optionally followed by trailing text outside the block.
//
// Intl.PluralRules (not a hardcoded count===1 check) is what makes this
// correct across languages — French treats 0 as "one" too, for instance.
//
// Some Hermes builds ship without Intl.PluralRules at all (the constructor
// is `undefined`, not just missing a locale), which crashed every screen
// using a counted string. This app only ships 7 locales, so rather than pull
// in a full CLDR plural-rules polyfill, the fallback below hardcodes each
// locale's cardinal rule directly — all 7 are two-category (one/other)
// systems, differing only in whether 0 counts as "one".
const ZERO_IS_ONE_LOCALES = new Set(["fr", "hi", "bn"]);

function pluralCategory(count: number, language: string): "one" | "other" {
  if (typeof Intl.PluralRules === "function") {
    try {
      return new Intl.PluralRules(language).select(count) as "one" | "other";
    } catch {
      // Fall through to the manual rule below.
    }
  }
  const base = language.split("-")[0].toLowerCase();
  const isOne = count === 1 || (count === 0 && ZERO_IS_ONE_LOCALES.has(base));
  return isOne ? "one" : "other";
}

export function formatIcuPlural(template: string, count: number, language: string): string {
  return template.replace(/\{count,\s*plural,\s*((?:\w+\s*\{[^}]*\}\s*)+)\}/g, (_, branchesStr: string) => {
    const branches: Record<string, string> = {};
    const branchRe = /(\w+)\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = branchRe.exec(branchesStr))) {
      branches[m[1]] = m[2];
    }
    const category = pluralCategory(count, language);
    const chosen = branches[category] ?? branches.other ?? "";
    return chosen.replace(/#/g, String(count));
  });
}

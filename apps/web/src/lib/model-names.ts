// Model display grouping (2026-10-31 operator call): the same model id
// arrives with casing drift across collectors and app versions —
// "GLM-5.3-Flash" (zcode's earlier builds) vs "glm-5.3-flash" (zcode now,
// plus pi/workbuddy/zed) splits ~13.3B tokens into two rows on every model
// list. Aggregations group by the folded key and present the variant that
// carried the most tokens — the vendor's own spelling wins in practice.
// Display-only: the wire's bucket upsert key and the database keep the
// collector-reported strings.

export function modelGroupKey(model: string): string {
  const key = String(model ?? "")
    .trim()
    .toLowerCase();

  return key || "unknown";
}

/**
 * Token-weighted display-name resolver for one model group. The variant with
 * the largest token sum wins; ties keep the first-seen spelling.
 */
export class ModelDisplayName {
  private variants = new Map<string, number>();
  private best: string | null = null;
  private bestTokens = -1;

  add(raw: string, tokens: number): void {
    const name =
      String(raw ?? "")
        .trim()
        .slice(0, 200) || "unknown";
    const weighted = Math.max(0, Number(tokens) || 0);
    const next = (this.variants.get(name) ?? 0) + weighted;

    this.variants.set(name, next);
    if (next > this.bestTokens) {
      this.best = name;
      this.bestTokens = next;
    }
  }

  resolve(): string {
    return this.best ?? "unknown";
  }
}

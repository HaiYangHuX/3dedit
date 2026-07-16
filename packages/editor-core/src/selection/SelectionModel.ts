export interface SelectionSnapshot {
  ids: string[];
  primaryId: string | null;
}

export type SelectionListener = (snapshot: SelectionSnapshot) => void;

/** 无框架依赖的选择模型，维护多选集合与唯一主选择对象。 */
export class SelectionModel {
  private selected = new Set<string>();
  private primary: string | null = null;
  private readonly listeners = new Set<SelectionListener>();

  get ids(): string[] {
    return [...this.selected];
  }

  get primaryId(): string | null {
    return this.primary;
  }

  set(ids: Iterable<string>, primaryId?: string): void {
    const next = new Set(ids);
    const nextPrimary =
      primaryId && next.has(primaryId)
        ? primaryId
        : (Array.from(next).at(-1) ?? null);
    if (this.equals(next, nextPrimary)) return;
    this.selected = next;
    this.primary = nextPrimary;
    this.emit();
  }

  toggle(id: string): void {
    const next = new Set(this.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.set(
      next,
      next.has(this.primary ?? '') ? (this.primary ?? undefined) : id,
    );
  }

  remove(ids: Iterable<string>): void {
    const next = new Set(this.selected);
    for (const id of ids) next.delete(id);
    this.set(
      next,
      next.has(this.primary ?? '') ? (this.primary ?? undefined) : undefined,
    );
  }

  clear(): void {
    this.set([]);
  }

  subscribe(listener: SelectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private equals(next: Set<string>, primary: string | null): boolean {
    return (
      primary === this.primary &&
      next.size === this.selected.size &&
      [...next].every((id) => this.selected.has(id))
    );
  }

  private emit(): void {
    const snapshot = { ids: this.ids, primaryId: this.primary };
    for (const listener of this.listeners) listener(snapshot);
  }
}

export interface EditorCommand<TContext> {
  readonly label: string;
  execute(context: TContext): void | Promise<void>;
  undo(context: TContext): void | Promise<void>;
  merge?(next: EditorCommand<TContext>): EditorCommand<TContext> | undefined;
}

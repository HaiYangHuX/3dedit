import type { EditorCommand } from './types';

/**
 * 命令历史只记录已经成功执行的命令。执行或撤销抛错时游标保持不变，
 * 避免文档状态与历史索引失去同步。
 */
export class CommandHistory<TContext> {
  private commands: EditorCommand<TContext>[] = [];
  private cursor = 0;
  private savedCursor = 0;

  constructor(private readonly context: TContext) {}

  get isDirty(): boolean {
    return this.cursor !== this.savedCursor;
  }

  get canUndo(): boolean {
    return this.cursor > 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.commands.length;
  }

  async execute(command: EditorCommand<TContext>): Promise<void> {
    await command.execute(this.context);
    this.commands.splice(this.cursor);
    const previous = this.commands[this.commands.length - 1];
    const merged = previous?.merge?.(command);
    if (merged) {
      this.commands[this.commands.length - 1] = merged;
    } else {
      this.commands.push(command);
    }
    this.cursor = this.commands.length;
  }

  async undo(): Promise<void> {
    if (this.cursor === 0) return;
    const command = this.commands[this.cursor - 1];
    if (!command) return;
    await command.undo(this.context);
    this.cursor -= 1;
  }

  async redo(): Promise<void> {
    const command = this.commands[this.cursor];
    if (!command) return;
    await command.execute(this.context);
    this.cursor += 1;
  }

  markSaved(): void {
    this.savedCursor = this.cursor;
  }
}

// A FIFO queue that plays items strictly in order, one at a time. The player is
// injected so this stays pure and testable: the real hook passes a function that
// decodes + plays an MP3 chunk through a Web Audio AnalyserNode, but a test can
// pass a fake. Sentence-streamed TTS enqueues clips as they arrive; this makes
// them play back-to-back without overlap or reordering.

export type PlayFn<T> = (item: T) => Promise<void>;

export class AudioQueue<T> {
  private items: T[] = [];
  private playing = false;
  private stopped = false;
  private readonly play: PlayFn<T>;
  private readonly onDrained?: () => void;

  constructor(play: PlayFn<T>, onDrained?: () => void) {
    this.play = play;
    this.onDrained = onDrained;
  }

  /** Number of items waiting (not counting the one currently playing). */
  get pending(): number {
    return this.items.length;
  }

  /** True while an item is playing or items remain queued. */
  get isActive(): boolean {
    return this.playing || this.items.length > 0;
  }

  /** Add an item and start the pump if idle. */
  enqueue(item: T): void {
    if (this.stopped) return;
    this.items.push(item);
    if (!this.playing) void this.pump();
  }

  /** Stop playback, drop everything queued, and prevent further enqueues. */
  stop(): void {
    this.stopped = true;
    this.items = [];
    this.playing = false;
  }

  private async pump(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    while (this.items.length > 0 && !this.stopped) {
      const next = this.items.shift() as T;
      try {
        await this.play(next);
      } catch {
        // A failed clip shouldn't wedge the queue; skip it and continue.
      }
    }
    this.playing = false;
    if (!this.stopped && this.items.length === 0) this.onDrained?.();
  }
}

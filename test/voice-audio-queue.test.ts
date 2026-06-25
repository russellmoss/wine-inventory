import { describe, it, expect, vi } from "vitest";
import { AudioQueue } from "@/lib/voice/audio-queue";

// A controllable fake player: each play() returns a promise we resolve manually,
// so we can assert ordering and "one at a time" without real timers.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("AudioQueue", () => {
  it("plays items strictly in FIFO order, one at a time", async () => {
    const started: string[] = [];
    const gates: Record<string, ReturnType<typeof deferred>> = {};
    const play = vi.fn((item: string) => {
      started.push(item);
      gates[item] = deferred();
      return gates[item].promise;
    });

    const q = new AudioQueue<string>(play);
    q.enqueue("a");
    q.enqueue("b");
    q.enqueue("c");

    // Only the first should have started (serialized).
    await Promise.resolve();
    expect(started).toEqual(["a"]);

    gates["a"].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(["a", "b"]);

    gates["b"].resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(["a", "b", "c"]);
  });

  it("fires onDrained once the queue empties", async () => {
    const onDrained = vi.fn();
    const q = new AudioQueue<number>(async () => {}, onDrained);
    q.enqueue(1);
    q.enqueue(2);
    // Let the microtask pump run to completion.
    await new Promise((r) => setTimeout(r, 0));
    expect(onDrained).toHaveBeenCalledTimes(1);
  });

  it("continues past a failing clip without wedging", async () => {
    const played: number[] = [];
    const q = new AudioQueue<number>(async (n) => {
      if (n === 2) throw new Error("decode failed");
      played.push(n);
    });
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    await new Promise((r) => setTimeout(r, 0));
    expect(played).toEqual([1, 3]);
  });

  it("stop() drops queued items and blocks further enqueues", async () => {
    const played: number[] = [];
    const gate = deferred();
    let first = true;
    const q = new AudioQueue<number>(async (n) => {
      played.push(n);
      if (first) {
        first = false;
        await gate.promise; // hold on the first item
      }
    });
    q.enqueue(1);
    q.enqueue(2);
    await Promise.resolve();
    expect(played).toEqual([1]);

    q.stop();
    gate.resolve();
    await new Promise((r) => setTimeout(r, 0));

    expect(played).toEqual([1]); // 2 was dropped
    q.enqueue(3);
    await new Promise((r) => setTimeout(r, 0));
    expect(played).toEqual([1]); // enqueue after stop is a no-op
    expect(q.isActive).toBe(false);
  });
});

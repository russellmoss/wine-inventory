// Phase 6 Unit 7: a startup probe for hostile storage (iOS private mode rejects IndexedDB
// writes; iOS ITP evicts after ~7 idle days). If the probe fails, the Round UI warns LOUDLY and
// falls back to in-memory with a "don't close this tab" banner. We also request persistent
// storage best-effort (iOS may ignore it). Pure browser API; no deps.

export type StorageProbe = {
  ok: boolean; // can we durably write IndexedDB?
  persisted: boolean; // did navigator.storage.persist() grant persistence?
  reason?: string;
};

/** Open a throwaway IndexedDB, write+read+delete it, and ask for persistence. */
export async function probeStorage(): Promise<StorageProbe> {
  if (typeof indexedDB === "undefined") return { ok: false, persisted: false, reason: "no-indexeddb" };

  const canWrite = await new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (v: boolean) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const req = indexedDB.open("cellar-probe", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("p");
      req.onerror = () => done(false);
      req.onblocked = () => done(false);
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction("p", "readwrite");
          tx.objectStore("p").put(1, "k");
          tx.oncomplete = () => {
            db.close();
            try {
              indexedDB.deleteDatabase("cellar-probe");
            } catch {
              /* best-effort cleanup */
            }
            done(true);
          };
          tx.onerror = () => {
            db.close();
            done(false);
          };
        } catch {
          done(false);
        }
      };
    } catch {
      done(false);
    }
  });

  let persisted = false;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      persisted = await navigator.storage.persist();
    }
  } catch {
    persisted = false;
  }

  return { ok: canWrite, persisted, reason: canWrite ? undefined : "write-rejected" };
}

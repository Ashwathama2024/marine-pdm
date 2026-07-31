// Durable local store for training data.
//
// Before this, nothing the simulator produced survived a reload: the chart buffer holds 120 ticks,
// the degradation-regression ring holds 600, alert history holds 100 — all useRef/module-level — and
// localStorage held only four small config blobs. So the fault instances this simulator can generate
// on demand could never accumulate into a dataset.
//
// IndexedDB rather than a server: the app is a pure Vite SPA with no write path off the browser, and
// IndexedDB gives hundreds of MB with zero new infrastructure. The TrainingStore interface is the
// seam — when real OPC-UA IPMS arrives it needs a Node process anyway (node-opcua cannot run in the
// browser), and an HTTP/SQLite backend can implement this same interface without touching callers.
//
// KEY DESIGN POINT — the compound key. `samples` is keyed ['runId', 't'], so writing the same tick
// twice is an idempotent overwrite rather than a duplicate row. That matters because React.StrictMode
// is enabled (main.tsx) and double-invokes effects in dev, offering every snapshot.timestamp twice.

export const DB_NAME = 'marine-pdm-training';
export const DB_VERSION = 1;
// Bump when the sample row shape changes.
//   1 → initial schema
//   2 → added rulQuality_<key> per forecast key. Version-1 rows carry rulTrue_* with NO statement of
//       whether the label was solved from a settled baseline, so they cannot be distinguished from
//       trustworthy version-2 rows on content alone. Filter on schemaVersion before training.
//   3 → added rulLabelErrMin_<key>, the continuous label-error minutes that rulQuality_* is
//       thresholded from. Version-2 rows carry the verdict but not the quantity, so the tolerance
//       (LABEL_ERROR_TOLERANCE_MIN) cannot be re-validated or re-chosen from them — only v3 rows
//       support that analysis.
export const SCHEMA_VERSION = 3;

export interface TrainingRun {
  runId: string;
  startedAt: number;
  endedAt: number | null;
  sampleCount: number;
  schemaVersion: number;
  engineModel: string;
  /** Whether severity ramping was on for this run — a run recorded without it has no incipient phase. */
  rampMode: boolean;
  notes?: string;
}

/** One tick. Flat by design: every value is a CSV column, no nesting to flatten at export time. */
export interface TrainingSample {
  runId: string;
  t: number;                       // snapshot.timestamp — the compound key's second half
  /** SCHEMA_VERSION at write time. Per-row so exports stay self-describing — see the note above. */
  schemaVersion: number;
  [column: string]: number | string | null;
}

/** A resolved alert episode — the closest thing to a labelled event the app already produced. */
export interface TrainingEpisode {
  id: string;
  runId: string | null;
  [field: string]: unknown;
}

export interface RunStats {
  run: TrainingRun;
  /** Row count per faultClass — the class balance that decides whether the set is trainable. */
  classBalance: Record<string, number>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('runs')) {
        db.createObjectStore('runs', { keyPath: 'runId' });
      }
      if (!db.objectStoreNames.contains('samples')) {
        const s = db.createObjectStore('samples', { keyPath: ['runId', 't'] });
        s.createIndex('runId', 'runId');
        s.createIndex('faultClass', 'faultClass');
      }
      if (!db.objectStoreNames.contains('episodes')) {
        const e = db.createObjectStore('episodes', { keyPath: 'id' });
        e.createIndex('runId', 'runId');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
  });
  return dbPromise;
}

function tx<T>(store: string | string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result: T;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error ?? new Error('transaction failed'));
    t.onabort = () => reject(t.error ?? new Error('transaction aborted'));
    Promise.resolve(fn(t)).then(v => { result = v; }).catch(reject);
  }));
}

const wrap = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('request failed'));
  });

// ── Runs ──────────────────────────────────────────────────────────────────────────

export async function putRun(run: TrainingRun): Promise<void> {
  await tx('runs', 'readwrite', t => wrap(t.objectStore('runs').put(run)));
}

export async function listRuns(): Promise<TrainingRun[]> {
  const runs = await tx('runs', 'readonly', t => wrap(t.objectStore('runs').getAll() as IDBRequest<TrainingRun[]>));
  return runs.sort((a, b) => b.startedAt - a.startedAt);
}

export async function getRun(runId: string): Promise<TrainingRun | undefined> {
  return tx('runs', 'readonly', t => wrap(t.objectStore('runs').get(runId) as IDBRequest<TrainingRun | undefined>));
}

// ── Samples ───────────────────────────────────────────────────────────────────────

/** Batched write — one transaction for the whole buffer, ~1 write per 30 ticks. */
export async function putSamples(rows: TrainingSample[]): Promise<void> {
  if (rows.length === 0) return;
  await tx('samples', 'readwrite', t => {
    const store = t.objectStore('samples');
    for (const row of rows) store.put(row);
  });
}

export async function countSamples(runId: string): Promise<number> {
  return tx('samples', 'readonly', t =>
    wrap(t.objectStore('samples').index('runId').count(IDBKeyRange.only(runId))));
}

export async function getSamples(runId: string): Promise<TrainingSample[]> {
  return tx('samples', 'readonly', t =>
    wrap(t.objectStore('samples').index('runId').getAll(IDBKeyRange.only(runId)) as IDBRequest<TrainingSample[]>));
}

/**
 * Stream one run's samples in key order, a chunk at a time. Export uses this so a multi-hour run
 * never has to be materialised as one array (or one string) in memory.
 */
export async function eachSampleChunk(
  runId: string,
  chunkSize: number,
  onChunk: (rows: TrainingSample[]) => void | Promise<void>,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction('samples', 'readonly');
    const req = t.objectStore('samples').index('runId').openCursor(IDBKeyRange.only(runId));
    let buf: TrainingSample[] = [];
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) {
        Promise.resolve(buf.length ? onChunk(buf) : undefined).then(() => resolve()).catch(reject);
        return;
      }
      buf.push(cur.value as TrainingSample);
      if (buf.length >= chunkSize) {
        const out = buf; buf = [];
        // The cursor must advance synchronously to keep the transaction alive, so the consumer is
        // called synchronously too — it appends to an array, it does not await.
        void onChunk(out);
      }
      cur.continue();
    };
    req.onerror = () => reject(req.error ?? new Error('cursor failed'));
    t.onerror = () => reject(t.error ?? new Error('transaction failed'));
  });
}

export async function runStats(runId: string): Promise<Record<string, number>> {
  const balance: Record<string, number> = {};
  await eachSampleChunk(runId, 500, rows => {
    for (const r of rows) {
      const c = String(r.faultClass ?? 'UNKNOWN');
      balance[c] = (balance[c] ?? 0) + 1;
    }
  });
  return balance;
}

// ── Episodes ──────────────────────────────────────────────────────────────────────

export async function putEpisodes(rows: TrainingEpisode[]): Promise<void> {
  if (rows.length === 0) return;
  await tx('episodes', 'readwrite', t => {
    const store = t.objectStore('episodes');
    for (const row of rows) store.put(row);
  });
}

export async function listEpisodes(): Promise<TrainingEpisode[]> {
  return tx('episodes', 'readonly', t =>
    wrap(t.objectStore('episodes').getAll() as IDBRequest<TrainingEpisode[]>));
}

// ── Arbitrary small persisted values (pattern feedback counters, etc.) ────────────

export async function putMeta(key: string, value: unknown): Promise<void> {
  await tx('meta', 'readwrite', t => wrap(t.objectStore('meta').put({ key, value })));
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await tx('meta', 'readonly', t =>
    wrap(t.objectStore('meta').get(key) as IDBRequest<{ key: string; value: T } | undefined>));
  return row?.value;
}

// ── Deletion ──────────────────────────────────────────────────────────────────────

export async function deleteRun(runId: string): Promise<void> {
  await tx(['runs', 'samples', 'episodes'], 'readwrite', t => {
    t.objectStore('runs').delete(runId);
    const cur = t.objectStore('samples').index('runId').openCursor(IDBKeyRange.only(runId));
    cur.onsuccess = () => { const c = cur.result; if (c) { c.delete(); c.continue(); } };
    const ecur = t.objectStore('episodes').index('runId').openCursor(IDBKeyRange.only(runId));
    ecur.onsuccess = () => { const c = ecur.result; if (c) { c.delete(); c.continue(); } };
  });
}

// ── Recovery ──────────────────────────────────────────────────────────────────────

/**
 * Repair runs left open by a previous session, and prune empty ones.
 *
 * A run is closed by endRun() on the engine's running→stopped edge. A page reload, a tab close or a
 * Vite HMR module swap fires no such edge, so the run row keeps `endedAt: null` forever. Nothing was
 * corrupt, but two things read wrong: the training page's duration column computed `now − startedAt`
 * and grew without bound (a run from this morning showing 200+ minutes), and a run whose buffered tail
 * never reached the flush threshold showed 0 rows.
 *
 * `endedAt` is recovered from the LAST SAMPLE ACTUALLY WRITTEN, never Date.now() — the run may have
 * been orphaned hours ago, and stamping "now" would invent a duration that never happened. This also
 * re-derives sampleCount from the samples themselves, so a count that drifted from an interrupted
 * flush is corrected rather than trusted.
 *
 * Call once at startup, BEFORE the first startRun(): at that moment every open run in the database is
 * by definition stale, so no live run can be closed by mistake.
 */
export async function reconcileOpenRuns(): Promise<{ closed: number; pruned: number }> {
  const runs = await listRuns();
  let closed = 0, pruned = 0;
  for (const run of runs) {
    if (run.endedAt !== null) continue;
    let maxT = 0, count = 0;
    await eachSampleChunk(run.runId, 500, rows => {
      for (const row of rows) {
        count++;
        const t = Number(row.t);
        if (Number.isFinite(t) && t > maxT) maxT = t;
      }
    });
    if (count === 0) {
      // An empty orphan carries no data and only clutters the run list.
      await deleteRun(run.runId);
      pruned++;
      continue;
    }
    await putRun({ ...run, endedAt: maxT || run.startedAt, sampleCount: count });
    closed++;
  }
  return { closed, pruned };
}

export async function wipeDatabase(): Promise<void> {
  const db = await openDb();
  db.close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('deleteDatabase failed'));
    req.onblocked = () => resolve();   // another tab holds it; it will drop when that tab closes
  });
}

/** Browser-reported quota usage, for the storage readout on the training page. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}

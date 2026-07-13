export interface VersionedSaveSnapshot<T> {
  value: T;
  signature: string;
}

export type VersionedSaveResult<TRemote> =
  | { status: 'saved'; version: number }
  | { status: 'conflict'; version: number; remote: TRemote }
  | { status: 'failed' };

interface LatestVersionedSaveQueueOptions<TValue, TRemote> {
  save: (
    snapshot: VersionedSaveSnapshot<TValue>,
    expectedVersion: number
  ) => Promise<VersionedSaveResult<TRemote>>;
  onSaved: (
    snapshot: VersionedSaveSnapshot<TValue>,
    version: number
  ) => void;
  onConflict: (remote: TRemote, version: number) => void;
}

export class LatestVersionedSaveQueue<TValue, TRemote> {
  private active: Promise<void> | null = null;
  private currentVersion: number | null = null;
  private readonly idleWaiters: Array<() => void> = [];
  private pending: VersionedSaveSnapshot<TValue> | null = null;

  public constructor(
    private readonly options: LatestVersionedSaveQueueOptions<TValue, TRemote>
  ) {}

  public setVersion(version: number): void {
    this.currentVersion = version;
    this.startIfReady();
  }

  public enqueue(snapshot: VersionedSaveSnapshot<TValue>): Promise<void> {
    this.pending = snapshot;
    this.startIfReady();
    return this.flush();
  }

  public flush(): Promise<void> {
    if (!this.active && !this.pending) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  private startIfReady(): void {
    if (this.active || this.currentVersion === null || !this.pending) {
      return;
    }

    const active = this.drain();
    this.active = active;
    void active.finally(() => {
      if (this.active === active) {
        this.active = null;
      }

      if (this.pending && this.currentVersion !== null) {
        this.startIfReady();
        return;
      }

      if (!this.pending) {
        this.resolveIdleWaiters();
      }
    });
  }

  private async drain(): Promise<void> {
    while (this.pending && this.currentVersion !== null) {
      const snapshot = this.pending;
      const expectedVersion = this.currentVersion;
      this.pending = null;

      let result: VersionedSaveResult<TRemote>;
      try {
        result = await this.options.save(snapshot, expectedVersion);
      } catch {
        return;
      }

      if (result.status === 'saved') {
        this.currentVersion = result.version;
        this.options.onSaved(snapshot, result.version);
        continue;
      }

      if (result.status === 'conflict') {
        this.currentVersion = result.version;
        this.pending = null;
        this.options.onConflict(result.remote, result.version);
      }

      return;
    }
  }

  private resolveIdleWaiters(): void {
    for (const resolve of this.idleWaiters.splice(0)) {
      resolve();
    }
  }
}

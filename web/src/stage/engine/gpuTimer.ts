// Optional GPU frame timing through EXT_disjoint_timer_query_webgl2, used by the debug overlay only.
// Results arrive a few frames late; a small ring of queries keeps the pipeline unstalled. When the
// extension is missing (most browsers outside a trusted context, some drivers) `ms` stays null.

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export class GpuTimer {
  ms: number | null = null;
  private readonly gl: WebGL2RenderingContext;
  private ext: TimerExt | null;
  private readonly pool: WebGLQuery[] = [];
  private readonly pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private avg = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  }

  get supported(): boolean {
    return this.ext !== null;
  }

  /** A lost context takes every query with it: forget them and fetch the extension again. */
  invalidate(): void {
    this.pool.length = 0;
    this.pending.length = 0;
    this.active = null;
    this.avg = 0;
    this.ms = null;
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
  }

  begin(): void {
    if (!this.ext || this.active) return;
    const q = this.pool.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
    this.poll();
  }

  private poll(): void {
    const ext = this.ext;
    if (!ext) return;
    const gl = this.gl;
    while (this.pending.length > 0) {
      const q = this.pending[0]!;
      const ready = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) as boolean;
      if (!ready) break;
      this.pending.shift();
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
      if (!disjoint) {
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
        const ms = ns / 1e6;
        this.avg = this.avg === 0 ? ms : this.avg + (ms - this.avg) * 0.1;
        this.ms = this.avg;
      }
      this.pool.push(q);
    }
    // Never let the backlog grow without bound.
    while (this.pending.length > 6) this.pool.push(this.pending.shift()!);
  }

  dispose(): void {
    for (const q of [...this.pool, ...this.pending]) this.gl.deleteQuery(q);
    this.pool.length = 0;
    this.pending.length = 0;
  }
}

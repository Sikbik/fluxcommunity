/**
 * Capacity formatting. The network reports RAM and SSD in terabytes; past a thousand of them a petabyte
 * reads better and keeps the big number short. Framework-free.
 */

export interface StorageFigure {
  value: number;
  unit: 'TB' | 'PB';
  /** Decimal places that keep three significant digits. */
  decimals: number;
}

export function formatStorage(tb: number): StorageFigure {
  if (!Number.isFinite(tb) || tb < 0) return { value: 0, unit: 'TB', decimals: 0 };
  if (tb >= 1000) {
    const pb = tb / 1000;
    return { value: pb, unit: 'PB', decimals: pb >= 100 ? 0 : pb >= 10 ? 1 : 2 };
  }
  return { value: tb, unit: 'TB', decimals: tb >= 100 ? 0 : tb >= 10 ? 1 : 2 };
}

export interface PerNode {
  cores: number;
  /** GB of RAM per node. */
  ramGb: number;
  /** GB of SSD per node. */
  ssdGb: number;
}

/**
 * The average capacity of one benchmarked node: the totals over the nodes they were summed from.
 * Null unless the server says how many nodes that was.
 */
export function perNode(
  capacity: { cores: number; ramTb: number; ssdTb: number; reporting?: number } | null,
): PerNode | null {
  if (!capacity || capacity.reporting === undefined || !(capacity.reporting > 0)) return null;
  return {
    cores: capacity.cores / capacity.reporting,
    ramGb: (capacity.ramTb * 1000) / capacity.reporting,
    ssdGb: (capacity.ssdTb * 1000) / capacity.reporting,
  };
}

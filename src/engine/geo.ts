// Motorun coğrafya yardımcıları. Düzlem yaklaşımı İstanbul enlemi için yeterlidir.

import type { Konum } from "./schema.ts";

export const M_PER_DEG_LAT = 111_320;
export const M_PER_DEG_LON = 111_320 * Math.cos((41.0 * Math.PI) / 180);

export function mesafeM(a: Konum, b: Konum): number {
  const dx = (a[0] - b[0]) * M_PER_DEG_LON;
  const dy = (a[1] - b[1]) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

/** Kuzeyden saat yönünde derece. */
export function yonDerece(a: Konum, b: Konum): number {
  const dx = (b[0] - a[0]) * M_PER_DEG_LON;
  const dy = (b[1] - a[1]) * M_PER_DEG_LAT;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

export function halkaIcinde(n: Konum, halka: Konum[]): boolean {
  const [x, y] = n;
  let icinde = false;
  for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
    const [xi, yi] = halka[i];
    const [xj, yj] = halka[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) icinde = !icinde;
  }
  return icinde;
}

export type Cokgenler = Konum[][][]; // MultiPolygon biçimi: çokgen -> halka -> nokta

export function cokgenlerIcinde(n: Konum, cokgenler: Cokgenler): boolean {
  for (const cg of cokgenler) {
    if (!halkaIcinde(n, cg[0])) continue;
    let delikte = false;
    for (let i = 1; i < cg.length; i++) if (halkaIcinde(n, cg[i])) { delikte = true; break; }
    if (!delikte) return true;
  }
  return false;
}

export function kutu(cokgenler: Cokgenler): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const cg of cokgenler) for (const h of cg) for (const [x, y] of h) {
    if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y;
  }
  return [a, b, c, d];
}

export function kutuIcinde(n: Konum, k: [number, number, number, number]): boolean {
  return n[0] >= k[0] && n[0] <= k[2] && n[1] >= k[1] && n[1] <= k[3];
}

/** Koni içinde mi: kameradan bakış yönü ± açı/2 ve menzil içinde. */
export function koniIcinde(kamera: Konum, yon: number, aci: number, menzil: number, n: Konum): boolean {
  if (mesafeM(kamera, n) > menzil) return false;
  const fark = Math.abs(((yonDerece(kamera, n) - yon + 540) % 360) - 180);
  return fark <= aci / 2;
}

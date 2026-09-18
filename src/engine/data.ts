// Motorun veri modeli ve indeksleri. Ham GeoJSON nesnelerinden kurulur, dosya okumaz.
// Node için okuyucu data-node.ts içinde, tarayıcı için ileride fetch tabanlı okuyucu gelir.

import type { Konum, Yaka } from "./schema.ts";
import { cokgenlerIcinde, kutu, kutuIcinde, mesafeM, type Cokgenler } from "./geo.ts";

export interface Poi { id: string; kategori: string; ad: string | null; ilce: string; mahalle: string | null; konum: Konum; kaynak: string }
export interface Durak { id: string; ad: string; ilce: string; konum: Konum; tip: "durak" | "istasyon"; hat_turu: string | null }
export interface Kamera { kod: string; tur: string; konum: Konum; yon: number; koni: number; menzil: number; ilce: string; yol_adi: string | null }
export interface Hucre { kod: string; ilce: string; alan_km2: number; komsular: string[]; cokgenler: Cokgenler; kutu: [number, number, number, number] }
export interface Gecis { id: string; ad: string; tip: string; konum: Konum }
export interface Isimler { adlar: string[]; soyadlar: string[] }

export interface Veri {
  poiler: Poi[];
  poiMap: Map<string, Poi>;
  kategoriye: Map<string, Poi[]>;
  duraklar: Durak[];
  durakMap: Map<string, Durak>;
  kameralar: Kamera[];
  kameraMap: Map<string, Kamera>;
  hucreler: Hucre[];
  hucreMap: Map<string, Hucre>;
  gecisler: Gecis[];
  gecisMap: Map<string, Gecis>;
  isimler: Isimler;
  ilceler: string[];
}

/** Ham GeoJSON dosyaları, okuyucudan gelir. */
export interface HamVeri {
  poi: GeoJSON;
  istasyonlar: GeoJSON;
  duraklar: GeoJSON;
  kameralar: GeoJSON;
  bazHucreleri: GeoJSON;
  gecisler: { gecisler: Gecis[] };
  isimler: Isimler;
}

interface GeoJSON { features: { geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }[] }

const ANADOLU = new Set(["Adalar", "Ataşehir", "Beykoz", "Çekmeköy", "Kadıköy", "Kartal", "Maltepe", "Pendik", "Sancaktepe", "Sultanbeyli", "Şile", "Tuzla", "Ümraniye", "Üsküdar"]);

export function yaka(ilce: string): Yaka {
  return ANADOLU.has(ilce) ? "anadolu" : "avrupa";
}

export function veriKur(ham: HamVeri): Veri {
  const poiler: Poi[] = ham.poi.features.map((f) => ({
    id: String(f.properties.id), kategori: String(f.properties.kategori), ad: (f.properties.ad as string | null) ?? null,
    ilce: String(f.properties.ilce), mahalle: (f.properties.mahalle as string | null) ?? null,
    konum: f.geometry.coordinates as Konum, kaynak: String(f.properties.kaynak),
  }));
  const kategoriye = new Map<string, Poi[]>();
  for (const p of poiler) { if (!kategoriye.has(p.kategori)) kategoriye.set(p.kategori, []); kategoriye.get(p.kategori)!.push(p); }

  const duraklar: Durak[] = [
    ...ham.duraklar.features.map((f) => ({ id: String(f.properties.id), ad: String(f.properties.ad), ilce: String(f.properties.ilce), konum: f.geometry.coordinates as Konum, tip: "durak" as const, hat_turu: null })),
    ...ham.istasyonlar.features.map((f) => ({ id: String(f.properties.id), ad: String(f.properties.ad), ilce: String(f.properties.ilce), konum: f.geometry.coordinates as Konum, tip: "istasyon" as const, hat_turu: String(f.properties.hat_turu) })),
  ];

  const kameralar: Kamera[] = ham.kameralar.features.map((f) => ({
    kod: String(f.properties.kamera_kodu), tur: String(f.properties.tur), konum: f.geometry.coordinates as Konum,
    yon: Number(f.properties.yon), koni: Number(f.properties.koni_acisi), menzil: Number(f.properties.menzil_m),
    ilce: String(f.properties.ilce), yol_adi: (f.properties.yol_adi as string | null) ?? null,
  }));

  const hucreler: Hucre[] = ham.bazHucreleri.features.map((f) => {
    const cokgenler = (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as Cokgenler;
    return { kod: String(f.properties.hucre_kodu), ilce: String(f.properties.ilce), alan_km2: Number(f.properties.alan_km2), komsular: f.properties.komsular as string[], cokgenler, kutu: kutu(cokgenler) };
  });

  const ilceler = [...new Set(poiler.map((p) => p.ilce))].sort();
  return {
    poiler, poiMap: new Map(poiler.map((p) => [p.id, p])), kategoriye,
    duraklar, durakMap: new Map(duraklar.map((d) => [d.id, d])),
    kameralar, kameraMap: new Map(kameralar.map((k) => [k.kod, k])),
    hucreler, hucreMap: new Map(hucreler.map((h) => [h.kod, h])),
    gecisler: ham.gecisler.gecisler, gecisMap: new Map(ham.gecisler.gecisler.map((g) => [g.id, g])),
    isimler: ham.isimler, ilceler,
  };
}

export function hucreBul(veri: Veri, konum: Konum): Hucre | null {
  for (const h of veri.hucreler) if (kutuIcinde(konum, h.kutu) && cokgenlerIcinde(konum, h.cokgenler)) return h;
  // Kıyı kırpması yüzünden dışarıda kalan noktalar için en yakın hücre merkezi yerine en yakın köşe kullanılır.
  let enIyi: Hucre | null = null, enIyiM = Infinity;
  for (const h of veri.hucreler) for (const cg of h.cokgenler) for (const n of cg[0]) {
    const m = mesafeM(konum, n);
    if (m < enIyiM) { enIyiM = m; enIyi = h; }
  }
  return enIyi;
}

export function enYakin<T extends { konum: Konum }>(liste: readonly T[], konum: Konum, azamiM = Infinity, disla?: (t: T) => boolean): T | null {
  let enIyi: T | null = null, enIyiM = azamiM;
  for (const t of liste) {
    if (disla?.(t)) continue;
    const m = mesafeM(konum, t.konum);
    if (m <= enIyiM) { enIyiM = m; enIyi = t; }
  }
  return enIyi;
}

export function yakinlar<T extends { konum: Konum }>(liste: readonly T[], konum: Konum, azamiM: number): T[] {
  return liste.filter((t) => mesafeM(konum, t.konum) <= azamiM);
}

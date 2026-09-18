// Tohumlu, deterministik rastgele sayı üretici (mulberry32). Aynı tohum aynı diziyi verir.
// Günlük dava bu üreticiye dayanır; Math.random motorun hiçbir yerinde kullanılmaz.

export interface Rng {
  /** [0, 1) aralığında sayı. */
  sayi(): number;
  /** [min, max] arası tam sayı, uçlar dahil. */
  tam(min: number, max: number): number;
  /** Olasılıkla evet. */
  sans(olasilik: number): boolean;
  /** Diziden bir öge. Boş dizide hata. */
  sec<T>(dizi: readonly T[]): T;
  /** Ağırlıklı seçim: [öge, ağırlık] çiftleri. */
  agirlikli<T>(cifler: readonly (readonly [T, number])[]): T;
  /** Kopya üzerinde karıştırma. */
  karistir<T>(dizi: readonly T[]): T[];
  /** Alt üretici: ana diziyi bozmadan bağımsız akış (ör. gürültü için). */
  dal(etiket: string): Rng;
}

export function rngOlustur(tohum: number): Rng {
  let a = tohum >>> 0;
  const sayi = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    sayi,
    tam: (min, max) => min + Math.floor(sayi() * (max - min + 1)),
    sans: (p) => sayi() < p,
    sec: (dizi) => {
      if (!dizi.length) throw new Error("boş diziden seçim");
      return dizi[Math.floor(sayi() * dizi.length)];
    },
    agirlikli: (cifler) => {
      const toplam = cifler.reduce((s, [, w]) => s + w, 0);
      let r = sayi() * toplam;
      for (const [oge, w] of cifler) { r -= w; if (r <= 0) return oge; }
      return cifler[cifler.length - 1][0];
    },
    karistir: (dizi) => {
      const d = dizi.slice();
      for (let i = d.length - 1; i > 0; i--) {
        const j = Math.floor(sayi() * (i + 1));
        [d[i], d[j]] = [d[j], d[i]];
      }
      return d;
    },
    dal: (etiket) => rngOlustur((tohum ^ metinTohumu(etiket)) >>> 0),
  };
  return rng;
}

/** Metinden 32 bit tohum (FNV-1a). */
export function metinTohumu(metin: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < metin.length; i++) {
    h ^= metin.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

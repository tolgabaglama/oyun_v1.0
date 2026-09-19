// Puanlama ve tur durumu. Tavan 1.000, her sorgu maliyetini düşer, yanlış tahmin 250 ceza,
// ikinci yanlışta tur biter, 150 metre içi doğru sayılır. Tur sonu özeti buradan üretilir.
// Saf fonksiyonlar: durum nesnesi alır, yeni durum döndürür.

import type { Dava, Konum, SensorKatalogu, Zorluk } from "./schema.ts";
import type { Veri } from "./data.ts";
import { mesafeM } from "./geo.ts";
import { sorgula, type SorguParametreleri, type SorguSonucu } from "./query.ts";
import { kisitHesapla, kisitlariUygula, DOGRU_YARICAP_M } from "./oracle.ts";

export const TAVAN_PUAN = 1000;
export const YANLIS_CEZASI = 250;
export const AZAMI_YANLIS = 2;
export { DOGRU_YARICAP_M };

export type TurSonucu = "devam" | "dogru" | "kaybetti";

export interface SorguKaydi {
  sira: number;
  sensor_id: string;
  parametreler: SorguParametreleri;
  maliyet: number;
  /** Aynı sorgu tekrar açıldıysa ücret alınmaz. */
  ucretsiz_tekrar: boolean;
  kayit_idler: string[];
}

export interface Tahmin {
  konum: Konum;
  mesafe_m: number;
  dogru: boolean;
}

export interface TurDurumu {
  dava: Dava;
  puan: number;
  sorgular: SorguKaydi[];
  tahminler: Tahmin[];
  sonuc: TurSonucu;
}

export function turBaslat(dava: Dava): TurDurumu {
  return { dava, puan: TAVAN_PUAN, sorgular: [], tahminler: [], sonuc: "devam" };
}

function sorguAnahtari(sensorId: string, p: SorguParametreleri): string {
  return `${sensorId}|${Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join("&")}`;
}

/** Sorgu yapar, maliyeti düşer (tekrar sorgular ücretsiz), yeni durumu ve sonucu döndürür. */
export function sorguYap(durum: TurDurumu, veri: Veri, katalog: SensorKatalogu, sensorId: string, parametreler: SorguParametreleri = {}): { durum: TurDurumu; sonuc: SorguSonucu } {
  if (durum.sonuc !== "devam") throw new Error("Tur bitti, sorgu yapılamaz");
  const sonuc = sorgula(durum.dava, veri, katalog, sensorId, parametreler);
  const anahtar = sorguAnahtari(sensorId, parametreler);
  const tekrar = durum.sorgular.some((s) => sorguAnahtari(s.sensor_id, s.parametreler) === anahtar);
  const kayit: SorguKaydi = {
    sira: durum.sorgular.length + 1, sensor_id: sensorId, parametreler, maliyet: tekrar ? 0 : sonuc.maliyet,
    ucretsiz_tekrar: tekrar, kayit_idler: sonuc.kayitlar.map((k) => k.id),
  };
  return {
    durum: { ...durum, puan: Math.max(0, durum.puan - kayit.maliyet), sorgular: [...durum.sorgular, kayit] },
    sonuc,
  };
}

/** Haritaya uzun basma: tahmin. 150 m içi doğru; yanlışta 250 ceza, ikinci yanlışta tur kapanır. */
export function tahminYap(durum: TurDurumu, konum: Konum): { durum: TurDurumu; tahmin: Tahmin } {
  if (durum.sonuc !== "devam") throw new Error("Tur bitti, tahmin yapılamaz");
  const mesafe = mesafeM(konum, durum.dava.gercek.su_anki_konum.konum);
  const dogru = mesafe <= DOGRU_YARICAP_M;
  const tahmin: Tahmin = { konum, mesafe_m: Math.round(mesafe), dogru };
  const tahminler = [...durum.tahminler, tahmin];
  if (dogru) return { durum: { ...durum, tahminler, sonuc: "dogru" }, tahmin };
  const yanlisSayisi = tahminler.filter((t) => !t.dogru).length;
  const puan = Math.max(0, durum.puan - YANLIS_CEZASI);
  const sonuc: TurSonucu = yanlisSayisi >= AZAMI_YANLIS ? "kaybetti" : "devam";
  return { durum: { ...durum, tahminler, puan: sonuc === "kaybetti" ? 0 : puan, sonuc }, tahmin };
}

/** Kolay modda gösterilen kalan aday sayısı: yapılmış sorguların sert kısıtları, gizli gerçeğe bakmadan. */
export function adaySayisi(durum: TurDurumu, veri: Veri, katalog: SensorKatalogu): number | null {
  if (durum.dava.zorluk !== "kolay") return null;
  const sensorIdler = new Set(durum.sorgular.map((s) => s.sensor_id));
  const kisitlar = katalog.sensorler
    .filter((s) => sensorIdler.has(s.id))
    .map((s) => kisitHesapla(durum.dava, veri, s, false))
    .filter((k): k is NonNullable<typeof k> => k !== null);
  return kisitlariUygula(veri, kisitlar).size;
}

export interface TurOzeti {
  sonuc: TurSonucu;
  puan: number;
  par: number;
  par_farki: number;
  sorgu_sayisi: number;
  sorgu_maliyeti: number;
  yanlis_tahmin: number;
  toplam_kayit: number;
  kullanilan_kayit: number;
  kaynaga_gore: { sensor_id: string; kurum: string; toplam: number; kullanilan: number }[];
  cumle: string;
  zorluk: Zorluk;
}

/** Tur sonu ekranı için özet. "Bu kişi 14 günde N kayıt bıraktı. Sen K tanesiyle buldun." */
export function turOzeti(durum: TurDurumu, katalog: SensorKatalogu): TurOzeti {
  const dava = durum.dava;
  const kullanilan = new Set<string>();
  for (const s of durum.sorgular) for (const id of s.kayit_idler) kullanilan.add(id);
  const kaynaga = new Map<string, { toplam: number; kullanilan: number }>();
  for (const k of dava.kayitlar) {
    const g = kaynaga.get(k.sensor_id) ?? { toplam: 0, kullanilan: 0 };
    g.toplam++;
    if (kullanilan.has(k.id)) g.kullanilan++;
    kaynaga.set(k.sensor_id, g);
  }
  const kurum = new Map(katalog.sensorler.map((s) => [s.id, s.kurum]));
  const sorguMaliyeti = durum.sorgular.reduce((s, q) => s + q.maliyet, 0);
  const yanlis = durum.tahminler.filter((t) => !t.dogru).length;
  const cumle = durum.sonuc === "dogru"
    ? `Bu kişi 14 günde ${dava.ozet.toplam_kayit} kayıt bıraktı. Sen ${kullanilan.size} tanesiyle buldun.`
    : `Bu kişi 14 günde ${dava.ozet.toplam_kayit} kayıt bıraktı. ${kullanilan.size} tanesine baktın, bulamadın.`;
  return {
    sonuc: durum.sonuc, puan: durum.puan, par: dava.par.deger, par_farki: TAVAN_PUAN - sorguMaliyeti - yanlis * YANLIS_CEZASI - (TAVAN_PUAN - dava.par.deger),
    sorgu_sayisi: durum.sorgular.length, sorgu_maliyeti: sorguMaliyeti, yanlis_tahmin: yanlis,
    toplam_kayit: dava.ozet.toplam_kayit, kullanilan_kayit: kullanilan.size,
    kaynaga_gore: [...kaynaga.entries()].sort((a, b) => b[1].toplam - a[1].toplam).map(([id, g]) => ({ sensor_id: id, kurum: kurum.get(id) ?? "", ...g })),
    cumle, zorluk: dava.zorluk,
  };
}

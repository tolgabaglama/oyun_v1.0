// Zaman ekseni denetimi. Üretilen dosyada kayıtların fiziksel olarak mümkün olması gerekir:
// hiçbir kayıt şu andan sonrasına ait olamaz, hedef aynı anda iki yerde olamaz ve ardışık
// iki konum arasındaki mesafe aradaki sürede makul hızda kat edilebilmelidir.

import type { Dava, Kayit, Konum, SensorKatalogu } from "./schema.ts";
import { zamanDakika } from "./schema.ts";
import type { Veri } from "./data.ts";
import { mesafeM } from "./geo.ts";

/** Şehir içi azami makul hız: 72 km/s. Metro ve çevre yolu dahil üst sınırdır. */
export const AZAMI_HIZ_M_DK = 1200;
/** Aynı dakikada iki kayıt arasındaki kabul edilebilir uzaklık. */
export const AYNI_AN_TOLERANSI_M = 200;

/** Kaydın işaret ettiği fiziksel nokta. Hücre ve mahalle gibi alan kayıtları nokta vermez. */
export function kayitKonumu(veri: Veri, k: Kayit): Konum | null {
  const g = k.geometri;
  if (!g) return null;
  switch (g.tip) {
    case "poi": return veri.poiMap.get(g.id)?.konum ?? null;
    case "durak": case "istasyon": return veri.durakMap.get(g.id)?.konum ?? null;
    case "kamera": return veri.kameraMap.get(g.id)?.konum ?? null;
    case "gecis": return veri.gecisMap.get(g.id)?.konum ?? null;
    default: return null;
  }
}

/**
 * Kaydın konum belirsizliği. Kamera kişiyi menzili içinde görür, kişi kameranın tam
 * noktasında değildir; bu yüzden kamera kayıtlarına menzil kadar tolerans tanınır.
 */
function belirsizlikM(veri: Veri, katalog: SensorKatalogu, k: Kayit): number {
  const sensor = katalog.sensorler.find((s) => s.id === k.sensor_id);
  if (!sensor) return 0;
  if (sensor.ayak_izi === "koni") return sensor.yakalama_yaricapi_m ?? 250;
  return sensor.belirsizlik_m ?? 0;
}

export interface ZamanIhlali {
  tip: "gelecek" | "ayni_an" | "hiz";
  aciklama: string;
}

export function zamanDenetle(dava: Dava, veri: Veri, katalog: SensorKatalogu): ZamanIhlali[] {
  const ihlaller: ZamanIhlali[] = [];
  const t0 = zamanDakika(dava.gercek.su_anki_zaman);

  for (const k of dava.kayitlar) {
    if (zamanDakika(k.zaman) > t0) {
      ihlaller.push({ tip: "gelecek", aciklama: `${k.id} (${k.sensor_id}) şu andan sonrasına ait` });
    }
  }

  // Adres bildiren sensörler hedefin orada bulunduğunu söylemez, fiziksel tutarlılığa girmez.
  const konumKaniti = new Map(katalog.sensorler.map((s) => [s.id, s.konum_kaniti !== false]));
  // Aynı olaydan türeyen kayıtlar aynı anın farklı görünümleridir, birbiriyle çelişmez.
  const noktalar = dava.kayitlar
    .filter((k) => k.gurultu === null && konumKaniti.get(k.sensor_id) !== false)
    .map((k) => ({ k, konum: kayitKonumu(veri, k), dk: zamanDakika(k.zaman), tolerans: belirsizlikM(veri, katalog, k) }))
    .filter((x): x is { k: Kayit; konum: Konum; dk: number; tolerans: number } => x.konum !== null)
    .sort((a, b) => a.dk - b.dk);

  for (let i = 1; i < noktalar.length; i++) {
    const a = noktalar[i - 1], b = noktalar[i];
    if (a.k.olay_id !== null && a.k.olay_id === b.k.olay_id) continue;
    const pay = a.tolerans + b.tolerans;
    const m = Math.max(0, mesafeM(a.konum, b.konum) - pay);
    const dk = b.dk - a.dk;
    if (dk === 0) {
      if (m > AYNI_AN_TOLERANSI_M) {
        ihlaller.push({ tip: "ayni_an", aciklama: `${a.k.id} ve ${b.k.id} aynı dakikada ${Math.round(m)} m arayla` });
      }
      continue;
    }
    if (m / dk > AZAMI_HIZ_M_DK) {
      ihlaller.push({ tip: "hiz", aciklama: `${a.k.id} -> ${b.k.id}: ${Math.round(m)} m / ${dk} dk` });
    }
  }
  return ihlaller;
}

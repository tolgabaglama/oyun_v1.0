// Sorgu motoru. sorgula(dava, sensorId, parametreler) çağrısı sensörün kayıtlarını oyuncuya
// görünür biçimde (olay bağı ve gürültü etiketi gizli) ve harita katmanı geometrisini döndürür.
// Sensöre özel kod yoktur; ayak izi tipine göre katman kurulur, parametreler tipine göre süzer.

import type { Dava, Kayit, Konum, SensorKatalogu, SensorTanimi, Zaman, Zorluk } from "./schema.ts";
import { zamanDakika, zamanMetni } from "./schema.ts";
import type { Veri } from "./data.ts";
import { koniCokgen } from "./geo.ts";

export type SorguParametreleri = Record<string, string | number>;

export interface GorunurKayit {
  id: string;
  sensor_id: string;
  zaman: Zaman;
  alanlar: Kayit["alanlar"];
  /** Kart metni şablonu doldurulmuş hali. */
  metin: string;
  /** Kaydın işaret ettiği ilçe ve mahalle. */
  konum_metni: string | null;
  gorece_zaman: string | null;
  geometri: Kayit["geometri"];
}

export interface KatmanOzelligi {
  type: "Feature";
  geometry: { type: "Point"; coordinates: Konum } | { type: "LineString"; coordinates: Konum[] } | { type: "Polygon"; coordinates: Konum[][] } | { type: "MultiPolygon"; coordinates: Konum[][][] };
  properties: Record<string, string | number | boolean | null>;
}

export interface Katman {
  type: "FeatureCollection";
  features: KatmanOzelligi[];
}

export interface SorguSonucu {
  sensor_id: string;
  sensor_adi: string;
  kurum: string;
  ayak_izi: SensorTanimi["ayak_izi"];
  maliyet: number;
  parametreler: SorguParametreleri;
  kayitlar: GorunurKayit[];
  katman: Katman;
  bos: boolean;
  aciklama: string;
}

export class SorguHatasi extends Error {
  kod: string;
  constructor(kod: string, mesaj: string) {
    super(mesaj);
    this.kod = kod;
  }
}

export function sensorBul(katalog: SensorKatalogu, sensorId: string): SensorTanimi {
  const s = katalog.sensorler.find((x) => x.id === sensorId);
  if (!s) throw new SorguHatasi("sensor_yok", `Bilinmeyen sensör: ${sensorId}`);
  return s;
}

/** Zorluğa göre açık sensörler. Uzmanda kademe 4 kapalıdır. */
export function kullanilabilirSensorler(katalog: SensorKatalogu, zorluk: Zorluk): SensorTanimi[] {
  return katalog.sensorler.filter((s) => !(zorluk === "uzman" && s.kademe === 4));
}

function saatDakika(metin: string): number {
  const [s, d] = String(metin).split(":").map(Number);
  return s * 60 + (d || 0);
}

/** Kayıt anlamlı bilgi taşımıyor mu (ör. araç yokken tescil kaydı). */
export function bosKayit(sensor: SensorTanimi, kayit: Kayit): boolean {
  const k = sensor.bos_kosulu;
  return Boolean(k && kayit.alanlar[k.alan] === k.deger);
}

export function kartMetni(sensor: SensorTanimi, kayit: Kayit): string {
  if (bosKayit(sensor, kayit)) return sensor.bos_metni ?? "Kayıt yok.";
  return sensor.kart_metni.replace(/\{(\w+)\}/g, (_, alan: string) => {
    const v = kayit.alanlar[alan];
    return v === null || v === undefined ? "bilinmiyor" : String(v);
  });
}

/** Kaydın işaret ettiği yerin idari adı. Oyuncu durak veya nokta adından ilçeyi bilemez. */
export function konumMetni(veri: Veri, kayit: Kayit): string | null {
  const alanIlce = kayit.alanlar.ilce as string | null | undefined;
  const alanMahalle = kayit.alanlar.mahalle as string | null | undefined;
  if (alanIlce) return alanMahalle ? `${alanIlce} / ${alanMahalle}` : alanIlce;

  const g = kayit.geometri;
  if (!g) return null;
  switch (g.tip) {
    case "poi": {
      const p = veri.poiMap.get(g.id);
      return p ? (p.mahalle ? `${p.ilce} / ${p.mahalle}` : p.ilce) : null;
    }
    case "durak": case "istasyon": {
      const d = veri.durakMap.get(g.id);
      return d ? d.ilce : null;
    }
    case "kamera": {
      const k = veri.kameraMap.get(g.id);
      return k ? k.ilce : null;
    }
    case "hucre": {
      const h = veri.hucreMap.get(g.id);
      return h ? `${h.ilce} çevresi` : null;
    }
    case "gecis": {
      const gc = veri.gecisMap.get(g.id);
      return gc ? gc.ad : null;
    }
    default:
      return null;
  }
}

/** Şu ana göre okunur zaman. Sabit kayıtların (nüfus, tescil) zamanı anlamsızdır, null döner. */
export function goreceZaman(kayit: Zaman, suAn: Zaman): string {
  const saat = `${String(kayit.saat).padStart(2, "0")}:${String(kayit.dakika).padStart(2, "0")}`;
  const fark = suAn.gun - kayit.gun;
  if (fark <= 0) return `bugün ${saat}`;
  if (fark === 1) return `dün ${saat}`;
  return `${fark} gün önce ${saat}`;
}

function gorunur(sensor: SensorTanimi, k: Kayit, veri: Veri, suAn: Zaman): GorunurKayit {
  const bos = bosKayit(sensor, k);
  return {
    id: k.id, sensor_id: k.sensor_id, zaman: k.zaman, alanlar: k.alanlar,
    metin: kartMetni(sensor, k),
    konum_metni: bos ? null : konumMetni(veri, k),
    gorece_zaman: sensor.kapsam.tip === "sabit" ? null : goreceZaman(k.zaman, suAn),
    // Anlamsız kayıt haritada yer kaplamaz.
    geometri: bos ? null : k.geometri,
  };
}

/** Parametreleri denetler ve kayıtları parametre tipine göre süzer. */
function parametreleriUygula(sensor: SensorTanimi, veri: Veri, kayitlar: Kayit[], p: SorguParametreleri): Kayit[] {
  for (const tanim of sensor.parametreler) {
    if (tanim.zorunlu && !(tanim.ad in p)) throw new SorguHatasi("parametre_eksik", `${sensor.ad} için ${tanim.ad} gerekli`);
  }
  let out = kayitlar;
  for (const tanim of sensor.parametreler) {
    const deger = p[tanim.ad];
    if (deger === undefined) continue;
    switch (tanim.tip) {
      case "kamera": {
        if (!veri.kameraMap.has(String(deger))) throw new SorguHatasi("kamera_yok", `Kamera bulunamadı: ${deger}`);
        out = out.filter((k) => k.alanlar.kamera_kodu === deger);
        break;
      }
      case "poi": {
        if (!veri.poiMap.has(String(deger))) throw new SorguHatasi("poi_yok", `Nokta bulunamadı: ${deger}`);
        out = out.filter((k) => k.alanlar.poi_id === deger);
        break;
      }
      case "ilce": {
        if (!veri.ilceler.includes(String(deger))) throw new SorguHatasi("ilce_yok", `İlçe bulunamadı: ${deger}`);
        out = out.filter((k) => veri.kameraMap.get(String(k.alanlar.kamera_kodu))?.ilce === deger);
        break;
      }
      case "gun": {
        out = out.filter((k) => k.zaman.gun === Number(deger));
        break;
      }
      case "saat": {
        const dk = saatDakika(String(deger));
        out = out.filter((k) => (tanim.ad === "saat_baslangic" ? k.zaman.saat * 60 + k.zaman.dakika >= dk : k.zaman.saat * 60 + k.zaman.dakika <= dk));
        break;
      }
    }
  }
  return out;
}

// ---- Katman kurucular, ayak izi tipine göre ------------------------------------------------------

type KatmanKurucu = (sensor: SensorTanimi, veri: Veri, kayitlar: Kayit[], p: SorguParametreleri) => KatmanOzelligi[];

function poiNoktasi(veri: Veri, poiId: string, props: KatmanOzelligi["properties"]): KatmanOzelligi | null {
  const poi = veri.poiMap.get(poiId);
  if (!poi) return null;
  return { type: "Feature", geometry: { type: "Point", coordinates: poi.konum }, properties: { poi_id: poi.id, kategori: poi.kategori, ilce: poi.ilce, ...props } };
}

function bolgeCokgeni(veri: Veri, tip: "mahalle" | "ilce", ilce: string | null, ad: string | null, props: KatmanOzelligi["properties"]): KatmanOzelligi | null {
  const b = tip === "ilce" ? (ilce ? veri.ilceBolgeleri.get(ilce) : undefined) : (ilce && ad ? veri.mahalleBolgeleri.get(`${ilce}|${ad}`) : undefined);
  if (!b) return null;
  return { type: "Feature", geometry: { type: "MultiPolygon", coordinates: b.cokgenler }, properties: { ad: b.ad, ilce: b.ilce, ...props } };
}

const KATMAN_KURUCULAR: Record<SensorTanimi["ayak_izi"], KatmanKurucu> = {
  nokta(sensor, veri, kayitlar, p) {
    const out: KatmanOzelligi[] = [];
    if (typeof p.poi_id === "string" && !kayitlar.length) {
      const f = poiNoktasi(veri, p.poi_id, { sensor_id: sensor.id, eslesme: "yok" });
      if (f) out.push(f);
    }
    for (const k of kayitlar) {
      const props = { kayit_id: k.id, sensor_id: sensor.id, zaman: zamanMetni(k.zaman) };
      if (k.geometri?.tip === "poi") { const f = poiNoktasi(veri, k.geometri.id, props); if (f) out.push(f); }
      else if (typeof k.alanlar.kaba_konum === "string") {
        const [lon, lat] = k.alanlar.kaba_konum.split(",").map(Number);
        out.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { ...props, yaricap_m: sensor.belirsizlik_m ?? 500 } });
      }
    }
    return out;
  },
  adres(sensor, veri, kayitlar) {
    const out: KatmanOzelligi[] = [];
    for (const k of kayitlar) {
      const props = { kayit_id: k.id, sensor_id: sensor.id, zaman: zamanMetni(k.zaman) };
      const ilce = k.alanlar.ilce as string | null, mahalle = k.alanlar.mahalle as string | null;
      if (sensor.hassasiyet === "nokta" && k.geometri?.tip === "poi") { const f = poiNoktasi(veri, k.geometri.id, props); if (f) out.push(f); }
      else if (sensor.hassasiyet === "mahalle") { const f = bolgeCokgeni(veri, "mahalle", ilce, mahalle, props) ?? bolgeCokgeni(veri, "ilce", ilce, null, props); if (f) out.push(f); }
      else if (sensor.hassasiyet === "ilce") { const f = bolgeCokgeni(veri, "ilce", ilce, null, props); if (f) out.push(f); }
    }
    return out;
  },
  hucre(sensor, veri, kayitlar) {
    const sayim = new Map<string, number>();
    for (const k of kayitlar) sayim.set(String(k.alanlar.hucre_kodu), (sayim.get(String(k.alanlar.hucre_kodu)) ?? 0) + 1);
    const out: KatmanOzelligi[] = [];
    for (const [kod, n] of sayim) {
      const h = veri.hucreMap.get(kod);
      if (h) out.push({ type: "Feature", geometry: { type: "MultiPolygon", coordinates: h.cokgenler }, properties: { hucre_kodu: kod, kayit_sayisi: n, ilce: h.ilce, sensor_id: sensor.id } });
    }
    return out;
  },
  koni(sensor, veri, kayitlar, p) {
    // Tekil sorguda seçilen kamera her durumda çizilir (eşleşme yoksa da koni görünür).
    const kodlar = new Set<string>(kayitlar.map((k) => String(k.alanlar.kamera_kodu)));
    if (typeof p.kamera_kodu === "string") kodlar.add(p.kamera_kodu);
    const out: KatmanOzelligi[] = [];
    for (const kod of kodlar) {
      const kam = veri.kameraMap.get(kod);
      if (!kam) continue;
      const eslesme = kayitlar.filter((k) => k.alanlar.kamera_kodu === kod).length;
      const props = { kamera_kodu: kod, tur: kam.tur, eslesme_sayisi: eslesme, yon: kam.yon, sensor_id: sensor.id };
      out.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [koniCokgen(kam.konum, kam.yon, kam.koni, kam.menzil)] }, properties: props });
      out.push({ type: "Feature", geometry: { type: "Point", coordinates: kam.konum }, properties: props });
    }
    return out;
  },
  guzergah(sensor, veri, kayitlar) {
    const out: KatmanOzelligi[] = [];
    const sirali = kayitlar.slice().sort((a, b) => zamanDakika(a.zaman) - zamanDakika(b.zaman));
    const gunler = new Map<number, Konum[]>();
    for (const k of sirali) {
      let konum: Konum | null = null, ad: string | null = null;
      if (k.geometri?.tip === "durak" || k.geometri?.tip === "istasyon") { const d = veri.durakMap.get(k.geometri.id); if (d) { konum = d.konum; ad = d.ad; } }
      if (k.geometri?.tip === "gecis") { const g = veri.gecisMap.get(k.geometri.id); if (g) { konum = g.konum; ad = g.ad; } }
      if (!konum) continue;
      out.push({ type: "Feature", geometry: { type: "Point", coordinates: konum }, properties: { kayit_id: k.id, ad, zaman: zamanMetni(k.zaman), yon: (k.alanlar.yon as string) ?? null, sensor_id: sensor.id } });
      if (!gunler.has(k.zaman.gun)) gunler.set(k.zaman.gun, []);
      gunler.get(k.zaman.gun)!.push(konum);
    }
    for (const [gun, noktalar] of gunler) if (noktalar.length >= 2) out.push({ type: "Feature", geometry: { type: "LineString", coordinates: noktalar }, properties: { gun, sensor_id: sensor.id } });
    return out;
  },
};

// ---- Ana giriş ------------------------------------------------------------------------------------------

export function sorgula(dava: Dava, veri: Veri, katalog: SensorKatalogu, sensorId: string, parametreler: SorguParametreleri = {}): SorguSonucu {
  const sensor = sensorBul(katalog, sensorId);
  if (dava.zorluk === "uzman" && sensor.kademe === 4) throw new SorguHatasi("kademe_kapali", "Uzman zorlukta kademe 4 sensörler kapalıdır");

  const ham = dava.kayitlar.filter((k) => k.sensor_id === sensorId);
  const kayitlar = parametreleriUygula(sensor, veri, ham, parametreler).slice().sort((a, b) => zamanDakika(a.zaman) - zamanDakika(b.zaman));
  // Anlamsız kayıtlar (ör. araç yok) haritaya çizilmez.
  const cizilecek = kayitlar.filter((k) => !bosKayit(sensor, k));
  const katman: Katman = { type: "FeatureCollection", features: KATMAN_KURUCULAR[sensor.ayak_izi](sensor, veri, cizilecek, parametreler) };
  const bos = kayitlar.length === 0;
  const aciklama = bos
    ? (sensor.ayak_izi === "koni" ? "Eşleşme yok." : "Kayıt bulunamadı.")
    : `${kayitlar.length} kayıt.`;

  return {
    sensor_id: sensor.id, sensor_adi: sensor.ad, kurum: sensor.kurum, ayak_izi: sensor.ayak_izi, maliyet: sensor.maliyet,
    parametreler, kayitlar: kayitlar.map((k) => gorunur(sensor, k, veri, dava.gercek.su_anki_zaman)), katman, bos, aciklama,
  };
}

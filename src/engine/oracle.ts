// Oracle: dava çözülebilir mi, en ucuz yol nedir? Sadece sensörlerin sert kısıtlarını kullanır.
// Davranışsal çıkarım (aynı ATM'nin tekrarı, sabah biniş durağı) oracle'a girmez; o oyuncunun alanıdır.
//
// Kısıt mantığı:
//   Konumlayıcılar (hücre, yarıçap, yaka) aday kümesini kesişimle daraltır.
//   Daraltıcılar (aday_yer) birleştirilir, sonra konumlayıcı bölgesiyle kesişir.
//   Bir yol en az bir konumlayıcı içermelidir; tek sensörle çözülen dava reddedilir.
//   Arama: en fazla 4 sensörlü tüm birleşimler maliyete göre denenir, deterministiktir.

import type { Dava, Kayit, Konum, Par, ParAdimi, SensorKatalogu, SensorTanimi, Zorluk } from "./schema.ts";
import { zamanDakika } from "./schema.ts";
import { type Veri, yaka as ilceYakasi } from "./data.ts";
import { mesafeM } from "./geo.ts";
import { davaUret, UretimReddi } from "./generator.ts";
import { kullanilabilirSensorler } from "./query.ts";

export const DOGRU_YARICAP_M = 150;
const AZAMI_DERINLIK = 4;

export class OracleReddi extends Error {
  neden: string;
  constructor(neden: string, mesaj?: string) {
    super(mesaj ?? neden);
    this.neden = neden;
  }
}

const KONUMLAYICILAR = new Set(["hucre", "yaricap", "yaka"]);
/** Doğrulayıcı adımın ekonomik olduğu en büyük aday sayısı. Üstünde arama yapılmaz. */
const AZAMI_DOGRULAMA_ADAYI = 10;
/**
 * Çevre çıkarımı: daraltıcı izler bir noktanın kendisini değil çevresini gösterebilir.
 * Öğle aralarında aynı üç dükkânda ödeme yapan biri o civarda çalışıyordur; oyuncu da bu
 * çıkarımı yapıp civardaki noktalara doğrulama sorusu sorar. Sıfır, çıkarım yapmadan kesişimdir.
 */
const CEVRE_YARICAPLARI_M = [0, 300];

/** Bir sensörün kısıtı: aday POI kimlikleri kümesi; uygulanamıyorsa null. */
export interface Kisit {
  sensor_id: string;
  tip: string;
  konumlayici: boolean;
  adaylar: Set<string>;
}

/**
 * Doğrulayıcı sensör: oyuncu hangi noktayı soracağını bilmez, bu yüzden tek başına daraltmaz.
 * Aday kümesi daraldıktan sonra kalan adaylara tek tek sorulur; en kötü durumda aday sayısı
 * eksi bir sorgu gerekir (son aday elemeyle bulunur).
 */
export interface Dogrulayici {
  sensor_id: string;
  maliyet: number;
  /** Gerçek konumda yakın zamanlı bir eşleşme var mı; yoksa doğrulama sonuç vermez. */
  gercekte_eslesme: boolean;
  /** Eşleşme veren POI kimlikleri; bir adayda eşleşme yoksa o aday elenir. */
  eslesen: Set<string>;
}

function sonKayit(kayitlar: Kayit[]): Kayit | null {
  return kayitlar.length ? kayitlar.reduce((a, b) => (zamanDakika(b.zaman) >= zamanDakika(a.zaman) ? b : a)) : null;
}

function yakinMi(k: Kayit, dava: Dava, saat: number): boolean {
  return zamanDakika(dava.gercek.su_anki_zaman) - zamanDakika(k.zaman) <= saat * 60;
}

function hucreAdaylari(veri: Veri, kodlar: Iterable<string>, komsularDahil: boolean): Set<string> {
  const hucreler = new Set<string>();
  for (const kod of kodlar) {
    hucreler.add(kod);
    if (komsularDahil) for (const k of veri.hucreMap.get(kod)?.komsular ?? []) hucreler.add(k);
  }
  const out = new Set<string>();
  for (const p of veri.poiler) if (hucreler.has(poiHucre(veri, p.id))) out.add(p.id);
  return out;
}

// POI hücre eşlemesi bir kez hesaplanır.
const hucreOnbellek = new WeakMap<Veri, Map<string, string>>();
function poiHucre(veri: Veri, poiId: string): string {
  let m = hucreOnbellek.get(veri);
  if (!m) {
    m = new Map();
    // Tembel: ilk çağrıda tüm POI'ler hücreye atanır.
    for (const p of veri.poiler) {
      let bulunan = "";
      for (const h of veri.hucreler) {
        const [a, b, c, d] = h.kutu;
        if (p.konum[0] < a || p.konum[0] > c || p.konum[1] < b || p.konum[1] > d) continue;
        if (hucreIcinde(p.konum, h.cokgenler)) { bulunan = h.kod; break; }
      }
      m.set(p.id, bulunan);
    }
    hucreOnbellek.set(veri, m);
  }
  return m.get(poiId) ?? "";
}
function hucreIcinde(n: Konum, cokgenler: Konum[][][]): boolean {
  for (const cg of cokgenler) {
    const h = cg[0];
    let icinde = false;
    for (let i = 0, j = h.length - 1; i < h.length; j = i++) {
      const [xi, yi] = h[i], [xj, yj] = h[j];
      if (yi > n[1] !== yj > n[1] && n[0] < ((xj - xi) * (n[1] - yi)) / (yj - yi) + xi) icinde = !icinde;
    }
    if (icinde) return true;
  }
  return false;
}

/**
 * Sensörün sert kısıtını hesaplar. gercekKullan false ise gizli gerçeğe bakan koşullar (ör. HGS için
 * ulaşım modu) uygulanmaz; arayüzün kolay moddaki aday sayacı bu biçimde çağırır.
 */
export function kisitHesapla(dava: Dava, veri: Veri, sensor: SensorTanimi, gercekKullan = true): Kisit | null {
  const sk = sensor.sert_kisit;
  if (!sk) return null;
  const kayitlar = dava.kayitlar.filter((k) => k.sensor_id === sensor.id);
  if (!kayitlar.length) return null;
  if (sk.kosul?.ulasim) {
    if (!gercekKullan) return null;
    if (!sk.kosul.ulasim.includes(dava.gercek.ulasim)) return null;
  }
  if (sk.tip === "dogrulayici") return null;
  let adaylar: Set<string> | null = null;
  switch (sk.tip) {
    case "hucre": {
      if (sk.tum_kayitlar) adaylar = hucreAdaylari(veri, kayitlar.map((k) => String(k.alanlar.hucre_kodu)), sk.komsular_dahil ?? false);
      else {
        const son = sonKayit(kayitlar)!;
        if (sk.yakinlik_saat !== undefined && !yakinMi(son, dava, sk.yakinlik_saat)) return null;
        adaylar = hucreAdaylari(veri, [String(son.alanlar.hucre_kodu)], sk.komsular_dahil ?? false);
      }
      break;
    }
    case "yaka": {
      const son = sonKayit(kayitlar)!;
      const yon = String(son.alanlar.yon);
      adaylar = new Set(veri.poiler.filter((p) => ilceYakasi(p.ilce) === yon).map((p) => p.id));
      break;
    }
    case "yaricap": {
      const son = sonKayit(kayitlar)!;
      if (sk.yakinlik_saat !== undefined && !yakinMi(son, dava, sk.yakinlik_saat)) return null;
      const merkez: Konum | null = son.geometri?.tip === "poi" ? (veri.poiMap.get(son.geometri.id)?.konum ?? null)
        : typeof son.alanlar.kaba_konum === "string" ? (son.alanlar.kaba_konum.split(",").map(Number) as Konum) : null;
      if (!merkez) return null;
      adaylar = new Set(veri.poiler.filter((p) => mesafeM(p.konum, merkez) <= (sk.metre ?? 500)).map((p) => p.id));
      break;
    }
    case "aday_yer": {
      adaylar = new Set<string>();
      for (const k of kayitlar) {
        // Bir kayıt birden çok yere işaret edebilir (taksi yolculuğunun iki ucu gibi).
        let eklendi = false;
        for (const alan of ["uc_poi_1", "uc_poi_2"]) {
          if (typeof k.alanlar[alan] === "string") { adaylar.add(k.alanlar[alan] as string); eklendi = true; }
        }
        if (eklendi) continue;
        if (k.geometri?.tip === "poi") adaylar.add(k.geometri.id);
        else if (typeof k.alanlar.poi_id === "string") adaylar.add(k.alanlar.poi_id);
        else if (typeof k.alanlar.adres_poi === "string") adaylar.add(k.alanlar.adres_poi);
      }
      if (!adaylar.size) return null;
      break;
    }
  }
  return adaylar ? { sensor_id: sensor.id, tip: sk.tip, konumlayici: KONUMLAYICILAR.has(sk.tip), adaylar } : null;
}

/** Doğrulayıcı sensörün durumunu hesaplar: hangi noktalarda yakın zamanlı eşleşme var. */
export function dogrulayiciHesapla(dava: Dava, veri: Veri, sensor: SensorTanimi): Dogrulayici | null {
  const sk = sensor.sert_kisit;
  if (!sk || sk.tip !== "dogrulayici") return null;
  const eslesen = new Set<string>();
  for (const k of dava.kayitlar) {
    if (k.sensor_id !== sensor.id || k.gurultu !== null) continue;
    if (k.alanlar.eslesme !== "var") continue;
    if (sk.yakinlik_saat !== undefined && !yakinMi(k, dava, sk.yakinlik_saat)) continue;
    if (typeof k.alanlar.poi_id === "string") eslesen.add(k.alanlar.poi_id);
  }
  return { sensor_id: sensor.id, maliyet: sensor.maliyet, gercekte_eslesme: eslesen.has(dava.gercek.su_anki_konum.poi_id), eslesen };
}

/**
 * Kısıt listesini uygular: konumlayıcılar kesişir, daraltıcılar birleşip kesişir.
 * cevreM sıfırdan büyükse daraltıcı izlerin o yarıçaptaki komşuları da adaylığa girer.
 */
export function kisitlariUygula(veri: Veri, kisitlar: Kisit[], cevreM = 0): Set<string> {
  let adaylar = new Set(veri.poiler.map((p) => p.id));
  const konumlayicilar = kisitlar.filter((k) => k.konumlayici);
  const daralticilar = kisitlar.filter((k) => !k.konumlayici);
  for (const k of konumlayicilar) adaylar = new Set([...adaylar].filter((id) => k.adaylar.has(id)));
  if (daralticilar.length) {
    const birlesim = new Set<string>();
    for (const k of daralticilar) for (const id of k.adaylar) birlesim.add(id);
    if (cevreM > 0) {
      const merkezler = [...birlesim].map((id) => veri.poiMap.get(id)!.konum);
      for (const p of veri.poiler) {
        if (birlesim.has(p.id)) continue;
        if (merkezler.some((m) => mesafeM(p.konum, m) <= cevreM)) birlesim.add(p.id);
      }
    }
    adaylar = new Set([...adaylar].filter((id) => birlesim.has(id)));
  }
  return adaylar;
}

/** Aday küme tek noktaya inmiş mi: hepsi 150 m yarıçaplı bir daireye sığıyor mu. */
export function tekNoktaMi(veri: Veri, adaylar: Set<string>): boolean {
  if (adaylar.size === 0) return false;
  const konumlar = [...adaylar].map((id) => veri.poiMap.get(id)!.konum);
  const merkez: Konum = [konumlar.reduce((s, k) => s + k[0], 0) / konumlar.length, konumlar.reduce((s, k) => s + k[1], 0) / konumlar.length];
  return konumlar.every((k) => mesafeM(k, merkez) <= DOGRU_YARICAP_M);
}

function* birlesimler<T>(dizi: T[], boyut: number, bas = 0, secili: T[] = []): Generator<T[]> {
  if (secili.length === boyut) { yield secili; return; }
  for (let i = bas; i < dizi.length; i++) yield* birlesimler(dizi, boyut, i + 1, [...secili, dizi[i]]);
}

export interface OracleSonucu {
  par: Par;
  /** Yol boyunca aday sayıları, adım adım. */
  adimlar: { sensor_id: string; kalan: number }[];
}

/**
 * Par hesabı. Çözülemezse OracleReddi("cozulemez"), tek sorguyla çözülürse OracleReddi("tek_sorgu"),
 * bir kısıt gerçeği dışlıyorsa OracleReddi("kisit_hatasi") fırlatır.
 */
export function parHesapla(dava: Dava, veri: Veri, katalog: SensorKatalogu): Par {
  const gercekId = dava.gercek.su_anki_konum.poi_id;
  const sensorler = kullanilabilirSensorler(katalog, dava.zorluk)
    .filter((s) => s.sert_kisit)
    .sort((a, b) => a.maliyet - b.maliyet || a.id.localeCompare(b.id));

  const kisitlar: Kisit[] = [];
  for (const s of sensorler) {
    const k = kisitHesapla(dava, veri, s, true);
    if (!k) continue;
    // Konumlayıcı kısıt gerçeği dışlıyorsa üretici ile oracle tutarsız demektir.
    if (k.konumlayici && !k.adaylar.has(gercekId)) throw new OracleReddi("kisit_hatasi", `${s.id} kısıtı gerçek konumu dışlıyor`);
    kisitlar.push(k);
  }
  const maliyet = new Map(sensorler.map((s) => [s.id, s.maliyet]));

  // Tek sorgu kontrolü.
  for (const k of kisitlar) {
    if (!k.konumlayici) continue;
    const adaylar = kisitlariUygula(veri, [k]);
    if (adaylar.has(gercekId) && tekNoktaMi(veri, adaylar)) throw new OracleReddi("tek_sorgu", `${k.sensor_id} tek başına çözüyor`);
  }

  // Doğrulayıcı sensörler: kalan adaylara tek tek sorularak konum kesinleştirilir.
  const dogrulayicilar = kullanilabilirSensorler(katalog, dava.zorluk)
    .map((s) => dogrulayiciHesapla(dava, veri, s))
    .filter((d): d is Dogrulayici => d !== null && d.gercekte_eslesme)
    .sort((a, b) => a.maliyet - b.maliyet || a.sensor_id.localeCompare(b.sensor_id));

  let enIyi: { yol: Kisit[]; toplam: number; cevre: number; dogrulama: { sensor: Dogrulayici; sorgu: number; kalan: number } | null } | null = null;
  for (let boyut = 1; boyut <= Math.min(AZAMI_DERINLIK, kisitlar.length); boyut++) {
    for (const yol of birlesimler(kisitlar, boyut)) {
      if (!yol.some((k) => k.konumlayici)) continue;
      const temel = yol.reduce((s, k) => s + maliyet.get(k.sensor_id)!, 0);
      if (enIyi && temel >= enIyi.toplam) continue;
      for (const cevre of CEVRE_YARICAPLARI_M) {
        const adaylar = kisitlariUygula(veri, yol, cevre);
        if (!adaylar.has(gercekId)) continue;
        // Kesin çözüm: kısıtlar tek noktaya indi, doğrulamaya gerek yok.
        if (cevre === 0 && boyut >= 2 && tekNoktaMi(veri, adaylar)) {
          if (!enIyi || temel < enIyi.toplam) enIyi = { yol, toplam: temel, cevre, dogrulama: null };
          continue;
        }
        // Doğrulayıcı ile kapatma: kalan adaylara tek tek sorulur, en kötü durum sorgu sayısı.
        if (adaylar.size > AZAMI_DOGRULAMA_ADAYI) continue;
        for (const d of dogrulayicilar) {
          const sorgu = Math.max(1, adaylar.size - 1);
          const toplam = temel + sorgu * d.maliyet;
          if (enIyi && toplam >= enIyi.toplam) continue;
          enIyi = { yol, toplam, cevre, dogrulama: { sensor: d, sorgu, kalan: adaylar.size } };
        }
      }
    }
  }
  if (!enIyi) throw new OracleReddi("cozulemez", "sert kısıtlarla tek noktaya inmiyor");

  // Yol sırası: konumlayıcılar önce (ucuzdan pahalıya), sonra daraltıcılar.
  const sirali = [...enIyi.yol].sort((a, b) => Number(b.konumlayici) - Number(a.konumlayici) || maliyet.get(a.sensor_id)! - maliyet.get(b.sensor_id)! || a.sensor_id.localeCompare(b.sensor_id));
  const adimlar: ParAdimi[] = [];
  const uygulanan: Kisit[] = [];
  for (const k of sirali) {
    uygulanan.push(k);
    adimlar.push({ sensor_id: k.sensor_id, parametreler: null, maliyet: maliyet.get(k.sensor_id)!, kalan_aday: kisitlariUygula(veri, uygulanan, enIyi.cevre).size });
  }
  if (enIyi.dogrulama) {
    const { sensor, sorgu, kalan } = enIyi.dogrulama;
    for (let i = 0; i < sorgu; i++) {
      const p: Record<string, string | number> = { aday_sirasi: i + 1 };
      if (enIyi.cevre > 0) p.cevre_m = enIyi.cevre;
      adimlar.push({ sensor_id: sensor.sensor_id, parametreler: p, maliyet: sensor.maliyet, kalan_aday: Math.max(1, kalan - i - 1) });
    }
  }
  return { deger: enIyi.toplam, baslangic_aday: veri.poiler.length, yol: adimlar };
}

/** Üretici ve oracle bir arada: kabul edilen dava par değeriyle döner, aksi halde UretimReddi veya OracleReddi fırlatır. */
export function davaKur(seed: number, zorluk: Zorluk, veri: Veri, katalog: SensorKatalogu): Dava {
  const dava = davaUret(seed, zorluk, veri, katalog);
  dava.par = parHesapla(dava, veri, katalog);
  return dava;
}

export { UretimReddi };

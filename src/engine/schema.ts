// Dava dosyası şeması. Üretici ve ileride el yazımı davalar aynı biçimi kullanır.
// Burada TypeScript tipleri ve semantik denetleyici var; yapısal şema dava.schema.json içinde.
// DOM'a bağımlı değildir, Node'da çalışır.

// ---- Temel sözlükler ----------------------------------------------------------------------

export type Zorluk = "kolay" | "standart" | "uzman";
export type UlasimModu = "arac" | "toplu_tasima" | "karisik" | "taksi";
export type OdemeDisiplini = "hep_kart" | "hep_nakit" | "doviz_sonrasi_nakit";
export type TelefonDisiplini = "hep_acik" | "geceleri_kapali" | "son_3_gun_kapali";
export type YerRolu = "ev" | "is" | "ucuncu" | "rutin_disi";
export type Yaka = "avrupa" | "anadolu";
export type Odeme = "kart" | "nakit";

export const ZORLUKLAR: readonly Zorluk[] = ["kolay", "standart", "uzman"];
export const ULASIM_MODLARI: readonly UlasimModu[] = ["arac", "toplu_tasima", "karisik", "taksi"];
export const ODEME_DISIPLINLERI: readonly OdemeDisiplini[] = ["hep_kart", "hep_nakit", "doviz_sonrasi_nakit"];
export const TELEFON_DISIPLINLERI: readonly TelefonDisiplini[] = ["hep_acik", "geceleri_kapali", "son_3_gun_kapali"];

/** Dava içi zaman. Gün 1 ile 14 arası, 14 bugündür. Saat 0 ile 23, dakika 0 ile 59. */
export interface Zaman {
  gun: number;
  saat: number;
  dakika: number;
}

/** [boylam, enlem] */
export type Konum = [number, number];

// ---- Sensör kataloğu tipleri (sensors.json) ------------------------------------------------

export type AyakIziTipi = "nokta" | "koni" | "hucre" | "adres" | "guzergah";
export type SertKisitTipi = "hucre" | "yaka" | "yaricap" | "aday_yer" | "dogrulayici";

export interface SensorKapsam {
  tip: "sabit" | "son" | "pencere_gun";
  gun?: number;
}

export interface GurultuKurali {
  tip: string;
  olasilik?: number;
  /** Doğruysa kural en son kayda uygulanmaz; o kayıt kanıt sayılır. */
  son_kayit_haric?: boolean;
  /** Saklama süresi kuralları için gün aralığı. */
  gun_en_az?: number;
  gun_en_cok?: number;
}

/** Kaydın anlamlı bilgi taşımadığı durum: bu alan bu değerdeyse yalnızca kısa metin gösterilir. */
export interface BosKosulu {
  alan: string;
  deger: string | number | boolean;
}

/** Sensörün yalnızca belirli POI kategorilerinde kayıt bırakması. Oran POI başına bir kez çözülür. */
export interface Kapsama {
  alan: "kategori";
  oranlar: Record<string, number>;
  varsayilan: number;
  aciklama?: string;
}

export interface SertKisit {
  tip: SertKisitTipi;
  komsular_dahil?: boolean;
  tum_kayitlar?: boolean;
  yakinlik_saat?: number;
  metre?: number;
  /**
   * Kısıtın geçerli olduğu koşul. ulasim gizli gerçeğe bakar; alan ve deger ise kaydın
   * kendi alanına bakar, yani oyuncunun da görebildiği bir bilgidir.
   */
  kosul?: { ulasim?: UlasimModu[]; alan?: string; deger?: string | number | boolean };
}

export interface SensorParametre {
  ad: string;
  tip: "kamera" | "ilce" | "gun" | "saat" | "poi";
  zorunlu: boolean;
}

export interface SensorTanimi {
  id: string;
  ad: string;
  kurum: string;
  kademe: 1 | 2 | 3 | 4;
  maliyet: number;
  ayak_izi: AyakIziTipi;
  hassasiyet?: "mahalle" | "ilce" | "nokta";
  varyant: "tek" | "dar" | "genis";
  es_varyant: string | string[] | null;
  kapsam: SensorKapsam;
  olaylar: string[];
  roller?: YerRolu[];
  modlar?: UlasimModu[];
  telefon_gerekir?: boolean;
  odeme_gerekir?: Odeme;
  birlesik?: string[];
  yakalama_olasiligi: number;
  /** Kayıt hedefin o anda orada bulunduğunu gösterir mi. Adres bildiren sensörlerde false. */
  konum_kaniti?: boolean;
  kapsama?: Kapsama;
  yakalama_yaricapi_m?: number;
  belirsizlik_m?: number;
  alanlar: string[];
  /** Sensöre özel tutar aralıkları; yoksa genel banka aralıkları kullanılır. */
  tutar_araliklari?: string[];
  gurultu: GurultuKurali[];
  bos_kosulu?: BosKosulu;
  bos_metni?: string;
  sert_kisit: SertKisit | null;
  parametreler: SensorParametre[];
  kart_metni: string;
}

export interface SensorKatalogu {
  surum: number;
  aciklama: string;
  kademeler: Record<string, { ad: string; maliyet: number }>;
  ayak_izi_tipleri: Record<string, string>;
  olay_turleri: Record<string, string>;
  gurultu_tipleri: Record<string, string>;
  sert_kisit_tipleri: Record<string, string>;
  sensorler: SensorTanimi[];
}

// ---- Dava ---------------------------------------------------------------------------------

export interface HedefProfili {
  ad: string;
  soyad: string;
  yas: number;
  /** Kısa ihbar notu. Bilgi eksik ve bazen yanlış olabilir. */
  ihbar_notu: string;
}

/** Hedefin hayatındaki bir yer. Hepsi gerçek POI noktalarıdır. */
export interface Yer {
  poi_id: string;
  rol: YerRolu;
  kategori: string;
  ilce: string;
  mahalle: string | null;
  konum: Konum;
  hucre_kodu: string;
  yaka: Yaka;
}

export interface GizliGercek {
  ev: Yer;
  is: Yer;
  ucuncu: Yer;
  ulasim: UlasimModu;
  odeme: OdemeDisiplini;
  telefon: TelefonDisiplini;
  arac_var: boolean;
  plaka: string | null;
  /** Üçüncü noktası spor salonu olan hedefin üyeliği vardır; turnike kaydı bundan doğar. */
  spor_salonu_uyesi: boolean;
  /** Kayıtlı ikamet farklıysa (eski adres gürültüsü için) buraya yazılır, yoksa null. */
  kayitli_adres_poi_id: string | null;
  su_anki_konum: Yer;
  su_anki_zaman: Zaman;
}

export interface Yolculuk {
  nereden_poi_id: string;
  nereye_poi_id: string;
  mod: UlasimModu;
  /** Toplu taşımada biniş durakları veya istasyonlar, sırayla. */
  duraklar: string[];
  /** Araçta köprü veya tünel geçişleri. */
  gecisler: { gecis_id: string; yon: Yaka }[];
}

export interface Olay {
  id: string;
  /** sensors.json olay_turleri anahtarlarından biri. */
  tur: string;
  zaman: Zaman;
  bitis: Zaman | null;
  yer_poi_id: string | null;
  rol: YerRolu | null;
  yolculuk: Yolculuk | null;
  odeme: Odeme | null;
  telefon_acik: boolean;
}

export interface GeometriRef {
  tip: "poi" | "kamera" | "hucre" | "mahalle" | "durak" | "istasyon" | "gecis";
  id: string;
}

export interface Kayit {
  id: string;
  sensor_id: string;
  /** Türediği olay. Gürültü kayıtlarında null. */
  olay_id: string | null;
  /** Gürültü tipi (sensors.json gurultu_tipleri). Gerçek kayıtlarda null. */
  gurultu: string | null;
  zaman: Zaman;
  /** Sensörün alanlar listesine karşılık gelen değerler. */
  alanlar: Record<string, string | number | boolean | null>;
  geometri: GeometriRef | null;
}

export interface ParAdimi {
  sensor_id: string;
  parametreler: Record<string, string | number> | null;
  maliyet: number;
  /** Bu adımdan sonra kalan aday sayısı. */
  kalan_aday: number;
}

export interface Par {
  deger: number;
  baslangic_aday: number;
  yol: ParAdimi[];
}

export interface DavaOzeti {
  toplam_kayit: number;
  gurultu_kayit: number;
  sensor_basina: Record<string, number>;
}

export interface Dava {
  surum: 1;
  kaynak: "uretici" | "el_yazimi";
  /** Üretici sürümü; aynı seed ve aynı sürüm aynı davayı verir. */
  uretici_surumu: string;
  seed: number;
  zorluk: Zorluk;
  profil: HedefProfili;
  gercek: GizliGercek;
  olaylar: Olay[];
  kayitlar: Kayit[];
  par: Par;
  ozet: DavaOzeti;
}

// ---- Yardımcılar ----------------------------------------------------------------------------

export function zamanDakika(z: Zaman): number {
  return (z.gun - 1) * 1440 + z.saat * 60 + z.dakika;
}

export function zamanMetni(z: Zaman): string {
  return `${z.gun}. gün ${String(z.saat).padStart(2, "0")}:${String(z.dakika).padStart(2, "0")}`;
}

// ---- Semantik denetleyici ----------------------------------------------------------------------
// JSON Şema yapıyı denetler; buradaki kurallar referans bütünlüğü ve oyun mantığı içindir.

export function davaDogrula(dava: Dava, katalog: SensorKatalogu): string[] {
  const hatalar: string[] = [];
  const sensorler = new Map(katalog.sensorler.map((s) => [s.id, s]));
  const olaylar = new Map<string, Olay>();

  if (dava.surum !== 1) hatalar.push("surum 1 olmalı");
  if (!ZORLUKLAR.includes(dava.zorluk)) hatalar.push(`bilinmeyen zorluk: ${dava.zorluk}`);
  if (!Number.isInteger(dava.seed)) hatalar.push("seed tam sayı olmalı");

  const zamanKontrol = (z: Zaman, nerede: string) => {
    if (z.gun < 1 || z.gun > 14) hatalar.push(`${nerede}: gün 1 ile 14 arası olmalı (${z.gun})`);
    if (z.saat < 0 || z.saat > 23) hatalar.push(`${nerede}: saat 0 ile 23 arası olmalı (${z.saat})`);
    if (z.dakika < 0 || z.dakika > 59) hatalar.push(`${nerede}: dakika 0 ile 59 arası olmalı`);
  };

  const g = dava.gercek;
  for (const [ad, yer] of [["ev", g.ev], ["is", g.is], ["ucuncu", g.ucuncu], ["su_anki_konum", g.su_anki_konum]] as const) {
    if (!yer?.poi_id) hatalar.push(`gercek.${ad}: poi_id eksik`);
  }
  if (g.ev?.poi_id === g.is?.poi_id) hatalar.push("ev ve iş aynı POI olamaz");
  if (!ULASIM_MODLARI.includes(g.ulasim)) hatalar.push(`bilinmeyen ulaşım modu: ${g.ulasim}`);
  if (!ODEME_DISIPLINLERI.includes(g.odeme)) hatalar.push(`bilinmeyen ödeme disiplini: ${g.odeme}`);
  if (!TELEFON_DISIPLINLERI.includes(g.telefon)) hatalar.push(`bilinmeyen telefon disiplini: ${g.telefon}`);
  if (g.ulasim === "arac" && !g.arac_var) hatalar.push("araç modunda arac_var true olmalı");
  zamanKontrol(g.su_anki_zaman, "su_anki_zaman");

  for (const o of dava.olaylar) {
    if (olaylar.has(o.id)) hatalar.push(`olay kimliği tekrar: ${o.id}`);
    olaylar.set(o.id, o);
    if (!katalog.olay_turleri[o.tur]) hatalar.push(`${o.id}: bilinmeyen olay türü ${o.tur}`);
    zamanKontrol(o.zaman, o.id);
    if (o.tur === "yolculuk" && !o.yolculuk) hatalar.push(`${o.id}: yolculuk olayında yolculuk alanı eksik`);
    if (o.tur !== "yolculuk" && !o.yer_poi_id) hatalar.push(`${o.id}: yer_poi_id eksik`);
  }

  const kayitIdler = new Set<string>();
  for (const k of dava.kayitlar) {
    if (kayitIdler.has(k.id)) hatalar.push(`kayıt kimliği tekrar: ${k.id}`);
    kayitIdler.add(k.id);
    const s = sensorler.get(k.sensor_id);
    if (!s) { hatalar.push(`${k.id}: bilinmeyen sensör ${k.sensor_id}`); continue; }
    // Her kayıt ya bir olaya bağlıdır ya gürültü etiketlidir, ikisi birden değil.
    if ((k.olay_id === null) === (k.gurultu === null)) hatalar.push(`${k.id}: olay_id ve gurultu alanlarından tam olarak biri dolu olmalı`);
    if (k.olay_id !== null && !olaylar.has(k.olay_id)) hatalar.push(`${k.id}: olay bulunamadı ${k.olay_id}`);
    if (k.gurultu !== null && !katalog.gurultu_tipleri[k.gurultu]) hatalar.push(`${k.id}: bilinmeyen gürültü tipi ${k.gurultu}`);
    for (const alan of s.alanlar) if (!(alan in k.alanlar)) hatalar.push(`${k.id}: ${k.sensor_id} alanı eksik: ${alan}`);
    zamanKontrol(k.zaman, k.id);
  }

  let toplam = 0;
  for (const adim of dava.par.yol) {
    const s = sensorler.get(adim.sensor_id);
    if (!s) hatalar.push(`par yolu: bilinmeyen sensör ${adim.sensor_id}`);
    else if (s.maliyet !== adim.maliyet) hatalar.push(`par yolu: ${adim.sensor_id} maliyeti katalogla uyumsuz`);
    toplam += adim.maliyet;
  }
  if (toplam !== dava.par.deger) hatalar.push(`par değeri ${dava.par.deger}, yol toplamı ${toplam}`);
  // Par yolunun sonunda kalan adaylar tek noktaya sayılır: hepsi doğru tahmin yarıçapına sığar.
  if (dava.par.yol.length > 0 && dava.par.yol.at(-1)!.kalan_aday < 1) hatalar.push("par yolunun sonunda en az bir aday kalmalı");

  if (dava.ozet.toplam_kayit !== dava.kayitlar.length) hatalar.push("ozet.toplam_kayit kayıt sayısıyla uyumsuz");
  const gurultuSayisi = dava.kayitlar.filter((k) => k.gurultu !== null).length;
  if (dava.ozet.gurultu_kayit !== gurultuSayisi) hatalar.push("ozet.gurultu_kayit uyumsuz");

  return hatalar;
}

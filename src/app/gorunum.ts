// Arayüzün gördüğü sade tipler. Arayüz motorun iç tiplerine (Dava, Kayit, Kisit) bağlanmaz;
// yalnızca bu dosyadaki görünümleri kullanır. Motor değişirse burası uyarlanır, ekranlar değil.

export type Zorluk = "kolay" | "standart" | "uzman";
export type TurSonucu = "devam" | "dogru" | "kaybetti";
export type Konum = [number, number];

/** Üst şeritte duran özet. */
export interface UstSerit {
  puan: number;
  sorgu_sayisi: number;
  zorluk: Zorluk;
  zorluk_adi: string;
  /** Yalnızca kolay modda dolu. */
  aday_sayisi: number | null;
  yanlis_tahmin: number;
  sonuc: TurSonucu;
}

export interface DosyaGorunumu {
  ad: string;
  yas: number;
  ihbar_notu: string;
  seed: number;
  zorluk_adi: string;
  /** "14. gün, saat 18:23" biçiminde şu anki zaman. */
  su_an_metni: string;
  su_an_gun: number;
}

/** Sorgu sekmesindeki bir sensör satırı. */
export interface SensorGorunumu {
  id: string;
  ad: string;
  kurum: string;
  kademe: number;
  maliyet: number;
  /** "tek", "dar" veya "geniş" etiketi; eş varyantın adı ve maliyeti. */
  varyant: string;
  /** Sorgunun neyi kapsadığı, ör. "son kayıt" veya "son 14 gün". */
  kapsam_metni: string;
  /** Haritada nasıl görüneceği, ör. "nokta" veya "baz hücresi". */
  ayak_izi_metni: string;
  es_varyant: { id: string; ad: string; maliyet: number } | null;
  /** Sorgudan önce doldurulması gereken alanlar. */
  parametreler: ParametreGorunumu[];
  /** Parametresiz sensör daha önce sorulduysa tekrarı ücretsizdir. */
  sorulmus: boolean;
  /** Parametreli sensörde kaç farklı sorgu yapıldığı; her yeni parametre tam ücrete tabidir. */
  yapilan_sorgu_sayisi: number;
  /** Zorluk yüzünden kapalıysa sebebi. */
  kapali_sebep: string | null;
}

export const KADEME_ADLARI: Record<number, string> = {
  1: "Açık ve idari kayıt",
  2: "Hizmet kayıtları",
  3: "Mahrem veri",
  4: "Ağır döküm",
};

export interface ParametreGorunumu {
  ad: string;
  etiket: string;
  tip: "kamera" | "ilce" | "gun" | "saat" | "poi";
  zorunlu: boolean;
  /** Seçim listesi olan parametrelerde seçenekler. */
  secenekler?: { deger: string; etiket: string }[];
  /** Listede önceden seçili gelecek değer. */
  varsayilan?: string;
}

export interface KayitGorunumu {
  id: string;
  metin: string;
  gun: number;
  saat: string;
  /** Şu ana göre okunur zaman: "bugün 14:20", "dün 09:15". Sabit kayıtlarda null. */
  gorece_zaman: string | null;
  /** Kaydın işaret ettiği yer: "Kadıköy / Caferağa Mahallesi" gibi. Yoksa null. */
  konum_metni: string | null;
  sensor_id: string;
}

/** Bir sorgunun sonucu: pano satırları ve harita katmanı. */
export interface SonucGorunumu {
  sorgu_id: string;
  sensor_id: string;
  sensor_adi: string;
  kurum: string;
  kademe: number;
  maliyet: number;
  ucretsiz_tekrar: boolean;
  parametre_metni: string;
  aciklama: string;
  bos: boolean;
  kayitlar: KayitGorunumu[];
  /** MapLibre'ye verilecek GeoJSON ve çizim biçimi. */
  katman: {
    id: string;
    ad: string;
    ayak_izi: "nokta" | "koni" | "hucre" | "adres" | "guzergah";
    renk: string;
    gorunur: boolean;
    veri: unknown;
  };
}

export interface TahminGorunumu {
  dogru: boolean;
  mesafe_m: number;
  kalan_hak: number;
  sonuc: TurSonucu;
  puan: number;
}

export interface Raptiye {
  id: string;
  konum: Konum;
  not: string;
}

export interface DislamaDairesi {
  id: string;
  merkez: Konum;
  yaricap_m: number;
}

export interface KaynakSatiri {
  kurum: string;
  sensor_adi: string;
  toplam: number;
  kullanilan: number;
}

export interface TurSonuGorunumu {
  sonuc: TurSonucu;
  puan: number;
  par: number;
  par_metni: string;
  sorgu_sayisi: number;
  sorgu_maliyeti: number;
  yanlis_tahmin: number;
  ceza: number;
  toplam_kayit: number;
  kullanilan_kayit: number;
  farkindalik_cumlesi: string;
  kaynaga_gore: KaynakSatiri[];
  /** Gerçek konum, tur bitince haritada gösterilir. */
  gercek_konum: Konum;
  gercek_yer_metni: string;
  par_yolu: { sensor_adi: string; maliyet: number; kalan_aday: number }[];
}

/** Harita üzerinde nokta seçimi için sade POI görünümü. */
export interface NoktaGorunumu {
  id: string;
  kategori: string;
  kategori_adi: string;
  ilce: string;
  mahalle: string | null;
  konum: Konum;
  /** Özel kamera talebinin bu kategoride sonuç verme ihtimali. */
  kamera_durumu: string;
}

/** ŞEHİRGÖZ kamerası, haritadan seçim ve bilgi balonu için. */
export interface KameraGorunumu {
  kod: string;
  tur: string;
  tur_adi: string;
  ilce: string;
  yol_adi: string | null;
  yon: number;
  konum: Konum;
}

export const KAMERA_TUR_ADLARI: Record<string, string> = {
  kavsak: "Kavşak kamerası",
  durak: "Durak kamerası",
  okul: "Okul girişi kamerası",
  meydan: "Meydan kamerası",
};

export const ZORLUK_ADLARI: Record<Zorluk, string> = {
  kolay: "Kolay",
  standart: "Standart",
  uzman: "Uzman",
};

export const KATEGORI_ADLARI: Record<string, string> = {
  market: "Zincir market",
  eczane: "Eczane",
  atm: "ATM",
  doviz: "Döviz bürosu",
  benzinlik: "Benzinlik",
  kargo: "Kargo şubesi",
  cami: "Cami",
  kahvehane: "Kahvehane",
  spor_salonu: "Spor salonu",
  otopark: "Otopark",
};

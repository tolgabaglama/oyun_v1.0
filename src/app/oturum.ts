// Oyun oturumu: motor ile arayüz arasındaki ince katman.
// Arayüz yalnızca bu sınıfı ve gorunum.ts tiplerini kullanır; motorun iç tiplerini görmez.
// Dava seed ve zorluktan yeniden üretilebildiği için kayıt küçüktür: yalnızca oyuncunun yaptıkları saklanır.

import type { Dava, SensorKatalogu, SensorTanimi, Zorluk as MotorZorluk } from "../engine/schema.ts";
import type { Veri } from "../engine/data.ts";
import { davaUret, UretimReddi, URETICI_SURUMU } from "../engine/generator.ts";
import { parHesapla, OracleReddi } from "../engine/oracle.ts";
import { kullanilabilirSensorler, sensorBul, SorguHatasi, type SorguParametreleri } from "../engine/query.ts";
import { adaySayisi, sorguYap, tahminYap, turBaslat, turOzeti, TAVAN_PUAN, YANLIS_CEZASI, type TurDurumu } from "../engine/scoring.ts";
import {
  KATEGORI_ADLARI, ZORLUK_ADLARI,
  type DislamaDairesi, type DosyaGorunumu, type Konum, type NoktaGorunumu, type ParametreGorunumu,
  type Raptiye, type SensorGorunumu, type SonucGorunumu, type TahminGorunumu, type TurSonuGorunumu,
  type UstSerit, type Zorluk,
} from "./gorunum.ts";

/** localStorage'a yazılan biçim. Dava saklanmaz, seed'den yeniden üretilir. */
export interface KayitliOturum {
  surum: 2;
  uretici_surumu: string;
  seed: number;
  zorluk: Zorluk;
  sorgular: { sensor_id: string; parametreler: SorguParametreleri }[];
  tahminler: Konum[];
  notlar: string;
  raptiyeler: Raptiye[];
  dislamalar: DislamaDairesi[];
  gizli_katmanlar: string[];
  aktif_sekme: string;
}

export class DavaBulunamadi extends Error {}

const AYAK_IZI_RENKLERI: Record<string, string> = {
  nokta: "#1565c0",
  adres: "#6a1b9a",
  hucre: "#7e57c2",
  koni: "#c62828",
  guzergah: "#00695c",
};

const PARAMETRE_ETIKETLERI: Record<string, string> = {
  kamera_kodu: "Kamera kodu",
  ilce: "İlçe",
  poi_id: "Nokta",
  gun: "Gün",
  saat_baslangic: "Başlangıç saati",
  saat_bitis: "Bitiş saati",
};

const VARYANT_ADLARI: Record<string, string> = { tek: "tek sorgu", dar: "dar", genis: "geniş" };

export class Oturum {
  private durum: TurDurumu;
  private sonuclar: SonucGorunumu[] = [];
  notlar = "";
  raptiyeler: Raptiye[] = [];
  dislamalar: DislamaDairesi[] = [];
  gizliKatmanlar = new Set<string>();
  aktifSekme = "dosya";

  private dava: Dava;
  private veri: Veri;
  private katalog: SensorKatalogu;

  private constructor(dava: Dava, veri: Veri, katalog: SensorKatalogu) {
    this.dava = dava;
    this.veri = veri;
    this.katalog = katalog;
    this.durum = turBaslat(dava);
  }

  // ---- Kuruluş ------------------------------------------------------------------------------

  /** Verilen seed kabul edilmezse sonraki seed denenir; kaç deneme yapıldığı da döner. */
  static baslat(seed: number, zorluk: Zorluk, veri: Veri, katalog: SensorKatalogu): Oturum {
    for (let i = 0; i < 60; i++) {
      const denenen = seed + i;
      try {
        const dava = davaUret(denenen, zorluk as MotorZorluk, veri, katalog);
        dava.par = parHesapla(dava, veri, katalog);
        return new Oturum(dava, veri, katalog);
      } catch (e) {
        if (e instanceof UretimReddi || e instanceof OracleReddi) continue;
        throw e;
      }
    }
    throw new DavaBulunamadi("Bu seed civarında çözülebilir dava üretilemedi.");
  }

  /** Kayıttan geri yükler: davayı yeniden üretir, sorguları ve tahminleri tekrar oynar. */
  static yukle(kayit: KayitliOturum, veri: Veri, katalog: SensorKatalogu): Oturum {
    if (kayit.uretici_surumu !== URETICI_SURUMU) throw new DavaBulunamadi("Kayıt eski bir üretici sürümüne ait.");
    const dava = davaUret(kayit.seed, kayit.zorluk as MotorZorluk, veri, katalog);
    dava.par = parHesapla(dava, veri, katalog);
    const o = new Oturum(dava, veri, katalog);
    for (const s of kayit.sorgular) {
      try { o.sorgula(s.sensor_id, s.parametreler); } catch { /* sensör kalktıysa atlanır */ }
    }
    for (const t of kayit.tahminler) if (o.durum.sonuc === "devam") o.tahmin(t);
    o.notlar = kayit.notlar;
    o.raptiyeler = kayit.raptiyeler;
    o.dislamalar = kayit.dislamalar;
    o.gizliKatmanlar = new Set(kayit.gizli_katmanlar);
    o.aktifSekme = kayit.aktif_sekme;
    return o;
  }

  kaydet(): KayitliOturum {
    return {
      surum: 2,
      uretici_surumu: URETICI_SURUMU,
      seed: this.dava.seed,
      zorluk: this.dava.zorluk as Zorluk,
      sorgular: this.durum.sorgular.map((s) => ({ sensor_id: s.sensor_id, parametreler: s.parametreler })),
      tahminler: this.durum.tahminler.map((t) => t.konum),
      notlar: this.notlar,
      raptiyeler: this.raptiyeler,
      dislamalar: this.dislamalar,
      gizli_katmanlar: [...this.gizliKatmanlar],
      aktif_sekme: this.aktifSekme,
    };
  }

  // ---- Görünümler ---------------------------------------------------------------------------

  ustSerit(): UstSerit {
    const zorluk = this.dava.zorluk as Zorluk;
    return {
      puan: this.durum.puan,
      sorgu_sayisi: this.durum.sorgular.length,
      zorluk,
      zorluk_adi: ZORLUK_ADLARI[zorluk],
      aday_sayisi: adaySayisi(this.durum, this.veri, this.katalog),
      yanlis_tahmin: this.durum.tahminler.filter((t) => !t.dogru).length,
      sonuc: this.durum.sonuc,
    };
  }

  dosya(): DosyaGorunumu {
    const p = this.dava.profil;
    return {
      ad: `${p.ad} ${p.soyad}`,
      yas: p.yas,
      ihbar_notu: p.ihbar_notu,
      seed: this.dava.seed,
      zorluk_adi: ZORLUK_ADLARI[this.dava.zorluk as Zorluk],
    };
  }

  private parametreGorunumu(s: SensorTanimi): ParametreGorunumu[] {
    return s.parametreler.map((p) => {
      const g: ParametreGorunumu = {
        ad: p.ad,
        etiket: PARAMETRE_ETIKETLERI[p.ad] ?? p.ad,
        tip: p.tip,
        zorunlu: p.zorunlu,
      };
      if (p.tip === "ilce") g.secenekler = this.veri.ilceler.map((i) => ({ deger: i, etiket: i }));
      if (p.tip === "gun") g.secenekler = Array.from({ length: 14 }, (_, i) => ({ deger: String(i + 1), etiket: `${i + 1}. gün` }));
      if (p.tip === "saat") g.secenekler = Array.from({ length: 25 }, (_, i) => {
        const s = String(Math.min(23, i)).padStart(2, "0");
        return { deger: i === 24 ? "23:59" : `${s}:00`, etiket: i === 24 ? "23:59" : `${s}:00` };
      });
      return g;
    });
  }

  /** Sorgu sekmesi listesi, kademe sırasına göre. */
  sensorler(): SensorGorunumu[] {
    const acik = new Set(kullanilabilirSensorler(this.katalog, this.dava.zorluk).map((s) => s.id));
    const sorulmusIdler = new Set(this.durum.sorgular.map((s) => s.sensor_id));
    return this.katalog.sensorler.map((s) => {
      const esId = Array.isArray(s.es_varyant) ? null : s.es_varyant;
      const es = esId ? this.katalog.sensorler.find((x) => x.id === esId) : null;
      return {
        id: s.id,
        ad: s.ad,
        kurum: s.kurum,
        kademe: s.kademe,
        maliyet: s.maliyet,
        varyant: VARYANT_ADLARI[s.varyant] ?? s.varyant,
        es_varyant: es ? { id: es.id, ad: es.ad, maliyet: es.maliyet } : null,
        parametreler: this.parametreGorunumu(s),
        sorulmus: sorulmusIdler.has(s.id),
        kapali_sebep: acik.has(s.id) ? null : "Uzman zorlukta kademe 4 kapalıdır",
      };
    });
  }

  /** Yapılmış sorguların sonuçları, en yeniden eskiye. */
  gecmis(): SonucGorunumu[] {
    return this.sonuclar;
  }

  noktalar(): NoktaGorunumu[] {
    return this.veri.poiler.map((p) => ({
      id: p.id,
      kategori: p.kategori,
      kategori_adi: KATEGORI_ADLARI[p.kategori] ?? p.kategori,
      ilce: p.ilce,
      mahalle: p.mahalle,
      konum: p.konum,
    }));
  }

  // ---- Eylemler ------------------------------------------------------------------------------

  private parametreMetni(p: SorguParametreleri): string {
    const parcalar = Object.entries(p).map(([k, v]) => {
      if (k === "poi_id") {
        const poi = this.veri.poiMap.get(String(v));
        return poi ? `${KATEGORI_ADLARI[poi.kategori] ?? poi.kategori}, ${poi.ilce}` : String(v);
      }
      return `${PARAMETRE_ETIKETLERI[k] ?? k}: ${v}`;
    });
    return parcalar.join(", ");
  }

  sorgula(sensorId: string, parametreler: SorguParametreleri = {}): SonucGorunumu {
    const sensor = sensorBul(this.katalog, sensorId);
    const { durum, sonuc } = sorguYap(this.durum, this.veri, this.katalog, sensorId, parametreler);
    this.durum = durum;
    const kayit = durum.sorgular.at(-1)!;
    const sorguId = `Q${String(kayit.sira).padStart(2, "0")}`;
    const gorunum: SonucGorunumu = {
      sorgu_id: sorguId,
      sensor_id: sensorId,
      sensor_adi: sonuc.sensor_adi,
      kurum: sonuc.kurum,
      kademe: sensor.kademe,
      maliyet: kayit.maliyet,
      ucretsiz_tekrar: kayit.ucretsiz_tekrar,
      parametre_metni: this.parametreMetni(parametreler),
      aciklama: sonuc.aciklama,
      bos: sonuc.bos,
      kayitlar: sonuc.kayitlar.map((k) => ({
        id: k.id,
        metin: k.metin,
        gun: k.zaman.gun,
        saat: `${String(k.zaman.saat).padStart(2, "0")}:${String(k.zaman.dakika).padStart(2, "0")}`,
        sensor_id: k.sensor_id,
      })),
      katman: {
        id: sorguId,
        ad: `${sorguId} ${sonuc.sensor_adi}`,
        ayak_izi: sonuc.ayak_izi,
        renk: AYAK_IZI_RENKLERI[sonuc.ayak_izi] ?? "#333333",
        gorunur: true,
        veri: sonuc.katman,
      },
    };
    this.sonuclar = [gorunum, ...this.sonuclar];
    return gorunum;
  }

  tahmin(konum: Konum): TahminGorunumu {
    const { durum, tahmin } = tahminYap(this.durum, konum);
    this.durum = durum;
    return {
      dogru: tahmin.dogru,
      mesafe_m: tahmin.mesafe_m,
      kalan_hak: Math.max(0, 2 - durum.tahminler.filter((t) => !t.dogru).length),
      sonuc: durum.sonuc,
      puan: durum.puan,
    };
  }

  bitti(): boolean {
    return this.durum.sonuc !== "devam";
  }

  turSonu(): TurSonuGorunumu {
    const o = turOzeti(this.durum, this.katalog);
    const g = this.dava.gercek.su_anki_konum;
    const sensorAdi = new Map(this.katalog.sensorler.map((s) => [s.id, s.ad]));
    const fark = o.puan - (TAVAN_PUAN - o.par);
    return {
      sonuc: o.sonuc,
      puan: o.puan,
      par: o.par,
      par_metni: fark === 0 ? "Par ile aynı" : fark > 0 ? `Par'ın ${fark} puan üstünde` : `Par'ın ${-fark} puan altında`,
      sorgu_sayisi: o.sorgu_sayisi,
      sorgu_maliyeti: o.sorgu_maliyeti,
      yanlis_tahmin: o.yanlis_tahmin,
      ceza: o.yanlis_tahmin * YANLIS_CEZASI,
      toplam_kayit: o.toplam_kayit,
      kullanilan_kayit: o.kullanilan_kayit,
      farkindalik_cumlesi: o.cumle,
      kaynaga_gore: o.kaynaga_gore.map((k) => ({
        kurum: k.kurum,
        sensor_adi: sensorAdi.get(k.sensor_id) ?? k.sensor_id,
        toplam: k.toplam,
        kullanilan: k.kullanilan,
      })),
      gercek_konum: g.konum,
      gercek_yer_metni: `${KATEGORI_ADLARI[g.kategori] ?? g.kategori}, ${g.ilce} / ${g.mahalle ?? "-"}`,
      par_yolu: this.dava.par.yol.map((a) => ({
        sensor_adi: sensorAdi.get(a.sensor_id) ?? a.sensor_id,
        maliyet: a.maliyet,
        kalan_aday: a.kalan_aday,
      })),
    };
  }
}

export { SorguHatasi, TAVAN_PUAN };

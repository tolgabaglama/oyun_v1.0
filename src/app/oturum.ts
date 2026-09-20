// Oyun oturumu: motor ile arayüz arasındaki ince katman.
// Arayüz yalnızca bu sınıfı ve gorunum.ts tiplerini kullanır; motorun iç tiplerini görmez.
// Dava seed ve zorluktan yeniden üretilebildiği için kayıt küçüktür: yalnızca oyuncunun yaptıkları saklanır.

import type { Dava, SensorKatalogu, SensorTanimi, Zorluk as MotorZorluk } from "../engine/schema.ts";
import type { Veri } from "../engine/data.ts";
import { davaUret, UretimReddi, URETICI_SURUMU } from "../engine/generator.ts";
import { parHesapla, NITELIKLI_HEDEF_ESIGI, OracleReddi } from "../engine/oracle.ts";
import { kullanilabilirSensorler, sensorBul, SorguHatasi, type SorguParametreleri } from "../engine/query.ts";
import { adaySayisi, sorguYap, tahminYap, turBaslat, turOzeti, TAVAN_PUAN, YANLIS_CEZASI, type TurDurumu } from "../engine/scoring.ts";
import {
  KAMERA_TUR_ADLARI, KATEGORI_ADLARI, ZORLUK_ADLARI,
  type DislamaDairesi, type DosyaGorunumu, type Konum, type NoktaGorunumu, type ParametreGorunumu,
  type KameraGorunumu, type Raptiye, type SensorGorunumu, type SonucGorunumu, type TahminGorunumu,
  type TurKaydi, type TurSonuGorunumu,
  type UstSerit, type Zorluk,
} from "./gorunum.ts";

/** localStorage'a yazılan biçim. Dava saklanmaz, seed'den yeniden üretilir. */
export interface KayitliOturum {
  surum: 2;
  uretici_surumu: string;
  seed: number;
  zorluk: Zorluk;
  sorgular: { sensor_id: string; parametreler: SorguParametreleri }[];
  /** Turun açılış anı; süre hesabı yarım kalan turda da doğru kalsın diye saklanır. */
  baslangic_ms: number;
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

const AYAK_IZI_ADLARI: Record<string, string> = {
  nokta: "nokta",
  adres: "adres",
  hucre: "baz hücresi",
  koni: "kamera konisi",
  guzergah: "güzergâh",
};

function kapsamMetni(s: SensorTanimi): string {
  if (s.kapsam.tip === "sabit") return "sabit kayıt";
  if (s.kapsam.tip === "son") return "yalnızca son kayıt";
  return `son ${s.kapsam.gun ?? 14} gün`;
}

export class Oturum {
  private durum: TurDurumu;
  private sonuclar: SonucGorunumu[] = [];
  notlar = "";
  raptiyeler: Raptiye[] = [];
  dislamalar: DislamaDairesi[] = [];
  gizliKatmanlar = new Set<string>();
  aktifSekme = "dosya";
  private baslangicMs = Date.now();

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
    throw new DavaBulunamadi("Bu numara civarında çözülebilir dosya üretilemedi.");
  }

  /** Kayıttan geri yükler: davayı yeniden üretir, sorguları ve tahminleri tekrar oynar. */
  static yukle(kayit: KayitliOturum, veri: Veri, katalog: SensorKatalogu): Oturum {
    if (kayit.uretici_surumu !== URETICI_SURUMU) throw new DavaBulunamadi("Kayıt eski bir sürüme ait, dosya açılamıyor.");
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
    if (kayit.baslangic_ms) o.baslangicMs = kayit.baslangic_ms;
    return o;
  }

  kaydet(): KayitliOturum {
    return {
      surum: 2,
      uretici_surumu: URETICI_SURUMU,
      seed: this.dava.seed,
      zorluk: this.dava.zorluk as Zorluk,
      sorgular: this.durum.sorgular.map((s) => ({ sensor_id: s.sensor_id, parametreler: s.parametreler })),
      baslangic_ms: this.baslangicMs,
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
    const z = this.dava.gercek.su_anki_zaman;
    return {
      ad: `${p.ad} ${p.soyad}`,
      yas: p.yas,
      ihbar_notu: p.ihbar_notu,
      seed: this.dava.seed,
      zorluk_adi: ZORLUK_ADLARI[this.dava.zorluk as Zorluk],
      su_an_metni: `${z.gun}. gün, saat ${String(z.saat).padStart(2, "0")}:${String(z.dakika).padStart(2, "0")}`,
      su_an_gun: z.gun,
      nitelikli_hedef: this.dava.par.deger > NITELIKLI_HEDEF_ESIGI,
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
      if (p.tip === "saat") {
        g.secenekler = Array.from({ length: 25 }, (_, i) => {
          const s = String(Math.min(23, i)).padStart(2, "0");
          return { deger: i === 24 ? "23:59" : `${s}:00`, etiket: i === 24 ? "23:59" : `${s}:00` };
        });
        // Varsayılan aralık tüm günü kapsasın; oyuncu daraltmak isterse değiştirir.
        g.varsayilan = p.ad === "saat_bitis" ? "23:59" : "00:00";
      }
      if (p.tip === "gun") g.varsayilan = "14";
      return g;
    });
  }

  /** Sorgu sekmesi listesi, kademe sırasına göre. */
  sensorler(): SensorGorunumu[] {
    const acik = new Set(kullanilabilirSensorler(this.katalog, this.dava.zorluk).map((s) => s.id));
    const sayimlar = new Map<string, number>();
    for (const s of this.durum.sorgular) sayimlar.set(s.sensor_id, (sayimlar.get(s.sensor_id) ?? 0) + 1);
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
        kapsam_metni: kapsamMetni(s),
        ayak_izi_metni: AYAK_IZI_ADLARI[s.ayak_izi] ?? s.ayak_izi,
        es_varyant: es ? { id: es.id, ad: es.ad, maliyet: es.maliyet } : null,
        parametreler: this.parametreGorunumu(s),
        // Parametreli sensörde her farklı nokta veya zaman aralığı yeni sorgudur.
        sorulmus: s.parametreler.length === 0 && this.ucretsizMi(s.id),
        yapilan_sorgu_sayisi: sayimlar.get(s.id) ?? 0,
        kapali_sebep: acik.has(s.id) ? null : "Uzman zorlukta kademe 4 kapalıdır",
      };
    });
  }

  /** Bir sorgu daha önce aynı parametrelerle yapıldıysa tekrarı ücretsizdir. */
  ucretsizMi(sensorId: string, parametreler: SorguParametreleri = {}): boolean {
    const anahtar = (id: string, p: SorguParametreleri) =>
      `${id}|${Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join("&")}`;
    const hedef = anahtar(sensorId, parametreler);
    return this.durum.sorgular.some((s) => anahtar(s.sensor_id, s.parametreler) === hedef);
  }

  /** Yapılmış sorguların sonuçları, en yeniden eskiye. */
  gecmis(): SonucGorunumu[] {
    return this.sonuclar;
  }

  /** Yapılmış tahminler; haritada işaretlenir. */
  tahminler(): { konum: Konum; dogru: boolean }[] {
    return this.durum.tahminler.map((t) => ({ konum: t.konum, dogru: t.dogru }));
  }

  noktalar(): NoktaGorunumu[] {
    return this.veri.poiler.map((p) => ({
      id: p.id,
      kategori: p.kategori,
      kategori_adi: KATEGORI_ADLARI[p.kategori] ?? p.kategori,
      ilce: p.ilce,
      mahalle: p.mahalle,
      konum: p.konum,
      kamera_durumu: this.kameraDurumu(p.kategori),
    }));
  }

  kameralar(): KameraGorunumu[] {
    return this.veri.kameralar.map((k) => ({
      kod: k.kod,
      tur: k.tur,
      tur_adi: KAMERA_TUR_ADLARI[k.tur] ?? k.tur,
      ilce: k.ilce,
      yol_adi: k.yol_adi,
      yon: k.yon,
      konum: k.konum,
    }));
  }

  /**
   * Haritada tıklanan ögenin künyesi. Tip ve kimlik katman özelliklerinden gelir;
   * hangi sorgudan geldiği katman kimliğinden çözülür.
   */
  kunye(ozellikler: Record<string, unknown>, katmanId: string): { baslik: string; satirlar: string[] } | null {
    const tip = String(ozellikler.kunye_tip ?? (ozellikler.poi_id ? "poi" : ozellikler.kamera_kodu ? "kamera" : ""));
    const id = String(ozellikler.kunye_id ?? ozellikler.poi_id ?? ozellikler.kamera_kodu ?? "");
    const satirlar: string[] = [];
    let baslik = "";

    if (tip === "poi") {
      const p = this.veri.poiMap.get(id);
      if (!p) return null;
      const kategoriAdi = KATEGORI_ADLARI[p.kategori] ?? p.kategori;
      baslik = p.ad ?? kategoriAdi;
      if (p.ad) satirlar.push(kategoriAdi);
      satirlar.push(p.mahalle ? `${p.ilce} / ${p.mahalle}` : p.ilce);
      satirlar.push(this.kameraDurumu(p.kategori));
    } else if (tip === "kamera") {
      const k = this.veri.kameraMap.get(id);
      if (!k) return null;
      baslik = k.kod;
      satirlar.push(KAMERA_TUR_ADLARI[k.tur] ?? k.tur, k.yol_adi ?? "Yol adı yok", k.ilce, `Bakış yönü ${k.yon} derece`);
    } else if (tip === "durak" || tip === "istasyon") {
      const d = this.veri.durakMap.get(id);
      if (!d) return null;
      baslik = d.ad;
      satirlar.push(d.tip === "istasyon" ? `Raylı sistem istasyonu${d.hat_turu ? ` · ${d.hat_turu}` : ""}` : "Otobüs durağı", d.ilce);
    } else if (tip === "hucre") {
      const h = this.veri.hucreMap.get(id);
      if (!h) return null;
      baslik = `Baz hücresi ${h.kod}`;
      satirlar.push(`${h.ilce} çevresi`, `Alan ${h.alan_km2} km²`);
    } else if (tip === "gecis") {
      const g = this.veri.gecisMap.get(id);
      if (!g) return null;
      baslik = g.ad;
      satirlar.push("Geçiş noktası");
    } else if (tip === "mahalle" || tip === "ilce") {
      baslik = String(ozellikler.ad ?? id);
      satirlar.push(tip === "mahalle" ? "Mahalle sınırı" : "İlçe sınırı");
      if (ozellikler.ilce && ozellikler.ilce !== baslik) satirlar.push(String(ozellikler.ilce));
    } else {
      return null;
    }

    // Hangi sorgudan geldiği: katman kimliği "q-Q01-nokta" biçimindedir.
    const eslesme = /^q-(Q\d+)-/.exec(katmanId);
    if (eslesme) {
      const sonuc = this.sonuclar.find((x) => x.sorgu_id === eslesme[1]);
      if (sonuc) satirlar.push(`${sonuc.sorgu_id} · ${sonuc.sensor_adi}`);
    } else if (katmanId === "tum-noktalar" || katmanId === "tum-kameralar") {
      satirlar.push("Sorgu sonucu değil, genel katman");
    }
    return { baslik, satirlar };
  }

  private kameraDurumu(kategori: string): string {
    const kapsama = this.katalog.sensorler.find((s) => s.id === "ozel_kamera_dar")?.kapsama;
    if (!kapsama) return "";
    const oran = kapsama.oranlar[kategori] ?? kapsama.varsayilan;
    if (oran >= 1) return "Kamera her zaman var";
    if (oran <= 0) return "Özel kamera talebi kabul edilmez";
    return "Kamera bulunma ihtimali orta";
  }

  /** Seçilen bir noktanın veya kameranın onay ekranında gösterilecek adı. */
  secimAdi(tip: "poi" | "kamera", id: string): string {
    if (tip === "kamera") {
      const k = this.veri.kameraMap.get(id);
      return k ? `${k.kod} · ${KAMERA_TUR_ADLARI[k.tur] ?? k.tur} · ${k.yol_adi ?? "yol adı yok"} · ${k.ilce}` : id;
    }
    const p = this.veri.poiMap.get(id);
    return p ? `${KATEGORI_ADLARI[p.kategori] ?? p.kategori} · ${p.ilce}${p.mahalle ? ` / ${p.mahalle}` : ""}` : id;
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
        gorece_zaman: k.gorece_zaman,
        konum_metni: k.konum_metni,
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

  /** Biten turun düz kaydı. Sunucuya gönderilmeye uygun, kişisel bilgi içermez. */
  turKaydi(): TurKaydi {
    const o = turOzeti(this.durum, this.katalog);
    return {
      surum: 1,
      seed: this.dava.seed,
      zorluk: this.dava.zorluk as Zorluk,
      sonuc: o.sonuc,
      puan: o.puan,
      par: o.par,
      sorgu_sayisi: o.sorgu_sayisi,
      kullanilan_sensorler: [...new Set(this.durum.sorgular.map((s) => s.sensor_id))],
      yanlis_tahmin: o.yanlis_tahmin,
      toplam_kayit: o.toplam_kayit,
      kullanilan_kayit: o.kullanilan_kayit,
      sure_sn: Math.round((Date.now() - this.baslangicMs) / 1000),
      tarih: new Date().toISOString(),
      uretici_surumu: URETICI_SURUMU,
    };
  }

  turSonu(): TurSonuGorunumu {
    const o = turOzeti(this.durum, this.katalog);
    const g = this.dava.gercek.su_anki_konum;
    const sensorAdi = new Map(this.katalog.sensorler.map((s) => [s.id, s.ad]));
    const fark = o.puan - (TAVAN_PUAN - o.par);
    return {
      sonuc: o.sonuc,
      nitelikli_hedef: this.dava.par.deger > NITELIKLI_HEDEF_ESIGI,
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

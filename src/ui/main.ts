// Uygulama girişi ve ekran yönlendirici.
// Ekranlar yalnızca src/app katmanını kullanır; motor tipleri buraya girmez.

import "maplibre-gl/dist/maplibre-gl.css";
import { el, temizle } from "./dom.ts";
import { anaEkran } from "./ekran-ana.ts";
import { ekranTurSonu } from "./ekran-tur-sonu.ts";
import { ekranOgretici } from "./ekran-ogretici.ts";
import { sekmeCubugu, ustSeritCiz, type SekmeKimligi } from "./kabuk.ts";
import { sekmeDosya } from "./sekme-dosya.ts";
import { sekmeSorgu } from "./sekme-sorgu.ts";
import { sorguPenceresi, sonucPenceresi } from "./pencere-sorgu.ts";
import { sekmePano, type PanoSiralamasi } from "./sekme-pano.ts";
import { sekmeHarita } from "./sekme-harita.ts";
import { HaritaYoneticisi, type HaritaModu } from "./harita.ts";
import { veriYukleWeb, katalogYukleWeb } from "../engine/data-web.ts";
import { DavaBulunamadi, Oturum } from "../app/oturum.ts";
import { ayarOku, ayarYaz, gecmiseEkle, ogreticiGoruldu, ogreticiIsaretle, turOku, turSil, turYaz } from "../app/depo.ts";
import { ZORLUK_ADLARI, type Konum, type SonucGorunumu, type TahminGorunumu, type Zorluk } from "../app/gorunum.ts";
import type { Veri } from "../engine/data.ts";
import type { SensorKatalogu } from "../engine/schema.ts";

type Ekran = "ana" | "tur" | "tur_sonu" | "ogretici";

interface Uygulama {
  veri: Veri;
  katalog: SensorKatalogu;
  ekran: Ekran;
  oturum: Oturum | null;
  sekme: SekmeKimligi;
}

const kok = document.getElementById("uygulama")!;
let uyg: Uygulama;

// ---- Geçici ekran durumları ---------------------------------------------------------------

/** Vurgulanacak sorgu; DOSYA sekmesinden PANO veya haritaya geçerken kullanılır. */
let vurguluSorgu: string | null = null;
/** Sorgu sonrası gösterilecek sonuç penceresi. */
let acikSonuc: SonucGorunumu | null = null;
/** Açık sorgu penceresi ve içine doldurulmuş parametreler. Haritadan dönünce korunur. */
let hazirlananSorgu: { sensorId: string; degerler: Record<string, string | number> } | null = null;
/** Haritadan seçim bekleyen parametre. */
let secimBekleyen: { parametreAdi: string; tip: "poi" | "kamera" } | null = null;
let tahminOnayi: Konum | null = null;
let acikTahmin: TahminGorunumu | null = null;
let bekleyenRaptiye: Konum | null = null;
let panoSiralamasi: PanoSiralamasi = "sensore_gore";
let harita: HaritaYoneticisi | null = null;
let haritaModu: HaritaModu = "gez";

function kaydet(): void {
  if (uyg.oturum) {
    uyg.oturum.aktifSekme = uyg.sekme;
    turYaz(uyg.oturum.kaydet());
  }
}

function hataGoster(mesaj: string): void {
  const kutu = el("div", { sinif: "hata-kutu" }, mesaj);
  kok.prepend(kutu);
  setTimeout(() => kutu.remove(), 4000);
}

/** Dava numarasını panoya kopyalar; izin yoksa sessizce geçer. */
function seedKopyala(seed: number): void {
  const bildir = () => hataGoster(`Dosya numarası kopyalandı: ${seed}`);
  try {
    void navigator.clipboard?.writeText(String(seed)).then(bildir, () => hataGoster(`Dosya numarası: ${seed}`));
  } catch {
    hataGoster(`Dosya numarası: ${seed}`);
  }
}

function anaEkranaDon(): void {
  kaydet();
  uyg.ekran = "ana";
  ciz();
}

function turBaslat(seed: number, zorluk: Zorluk): void {
  try {
    uyg.oturum = Oturum.baslat(seed, zorluk, uyg.veri, uyg.katalog);
  } catch (e) {
    hataGoster(e instanceof DavaBulunamadi ? e.message : "Dosya üretilemedi.");
    return;
  }
  uyg.sekme = "dosya";
  uyg.ekran = "tur";
  hazirlananSorgu = null;
  secimBekleyen = null;
  ayarYaz({ son_zorluk: zorluk, son_seed: seed });
  kaydet();
  ciz();
}

// ---- Harita ---------------------------------------------------------------------------------

function haritaKur(): HaritaYoneticisi {
  if (harita) return harita;
  harita = new HaritaYoneticisi({
    onNoktaSecildi: (tip, id) => {
      if (!secimBekleyen || !hazirlananSorgu) return;
      hazirlananSorgu.degerler[secimBekleyen.parametreAdi] = id;
      secimBekleyen = null;
      harita?.modAyarla("gez");
      uyg.sekme = "sorgu";
      ciz();
    },
    kunyeCoz: (ozellikler, katmanId) => uyg.oturum?.kunye(ozellikler, katmanId) ?? null,
    onRaptiye: (konum) => { bekleyenRaptiye = konum; haritaModu = "gez"; ciz(); },
    onDislama: (merkez, yaricap) => {
      uyg.oturum!.dislamalar = [...uyg.oturum!.dislamalar, { id: `D${Date.now().toString(36)}`, merkez, yaricap_m: yaricap }];
      haritaModu = "gez";
      kaydet();
      ciz();
    },
    onTahmin: (konum) => { tahminOnayi = konum; ciz(); },
    onModDegisti: (mod) => { haritaModu = mod; },
  });
  return harita;
}

function haritaSekmesi(): HTMLElement {
  const o = uyg.oturum!;
  const h = haritaKur();
  h.noktalariEkle(o.noktalar());
  h.kameralariEkle(o.kameralar());
  h.katmanlariGuncelle(o.gecmis(), o.gizliKatmanlar);
  h.cizimleriGuncelle({
    raptiyeler: o.raptiyeler,
    dislamalar: o.dislamalar,
    tahminler: o.tahminler(),
    gercekKonum: o.bitti() ? o.turSonu().gercek_konum : null,
  });

  const istenenMod: HaritaModu = secimBekleyen ? (secimBekleyen.tip === "kamera" ? "kamera_secim" : "nokta_secim") : haritaModu;
  if (secimBekleyen && haritaModu !== istenenMod) h.modAyarla(istenenMod);
  if (!secimBekleyen && (haritaModu === "nokta_secim" || haritaModu === "kamera_secim")) h.modAyarla("gez");

  const bekleyenAd = secimBekleyen && hazirlananSorgu
    ? o.sensorler().find((x) => x.id === hazirlananSorgu!.sensorId)?.ad ?? "Sorgu"
    : null;

  const icerik = sekmeHarita({
    harita: h,
    gecmis: o.gecmis(),
    gizli: o.gizliKatmanlar,
    raptiyeler: o.raptiyeler,
    dislamalar: o.dislamalar,
    mod: haritaModu,
    noktalarGorunur: h.noktalarGorunur(),
    kameralarGorunur: h.kameralarGorunur(),
    bekleyenSorguAdi: bekleyenAd,
    turBitti: o.bitti(),
    onKatmanDegis: (sorguId, gorunur) => {
      if (gorunur) o.gizliKatmanlar.delete(sorguId);
      else o.gizliKatmanlar.add(sorguId);
      h.katmanlariGuncelle(o.gecmis(), o.gizliKatmanlar);
      kaydet();
    },
    onNoktalarDegis: (gorunur) => h.noktalariGoster(gorunur),
    onKameralarDegis: (gorunur) => h.kameralariGoster(gorunur),
    onModDegis: (mod) => { h.modAyarla(mod); ciz(); },
    onKatmanaGit: (sorguId) => {
      const s = o.gecmis().find((x) => x.sorgu_id === sorguId);
      if (s) h.katmanaGit(s);
    },
    onRaptiyeSil: (id) => { o.raptiyeler = o.raptiyeler.filter((r) => r.id !== id); kaydet(); ciz(); },
    onDislamaSil: (id) => { o.dislamalar = o.dislamalar.filter((d) => d.id !== id); kaydet(); ciz(); },
    onSecimIptal: () => { secimBekleyen = null; h.modAyarla("gez"); uyg.sekme = "sorgu"; ciz(); },
  });

  setTimeout(() => {
    h.baslat();
    if (vurguluSorgu) {
      const s = o.gecmis().find((x) => x.sorgu_id === vurguluSorgu);
      vurguluSorgu = null;
      if (s) h.katmanaGit(s);
    }
  }, 0);
  return icerik;
}

// ---- Sekmeler --------------------------------------------------------------------------------

function sekmeIcerigi(sekme: SekmeKimligi): HTMLElement {
  const o = uyg.oturum!;
  if (sekme === "dosya") {
    return sekmeDosya({
      dosya: o.dosya(),
      gecmis: o.gecmis(),
      serit: o.ustSerit(),
      onSeedKopyala: () => seedKopyala(o.dosya().seed),
      onSorguSec: (sorguId) => {
        vurguluSorgu = sorguId;
        uyg.sekme = "pano";
        kaydet();
        ciz();
      },
    });
  }
  if (sekme === "sorgu") {
    return sekmeSorgu({
      sensorler: o.sensorler(),
      turBitti: o.bitti(),
      onSensorSec: (sensorId) => {
        hazirlananSorgu = { sensorId, degerler: {} };
        ciz();
      },
    });
  }
  if (sekme === "harita") return haritaSekmesi();
  return sekmePano({
    gecmis: o.gecmis(),
    notlar: o.notlar,
    siralama: panoSiralamasi,
    vurgulu: (() => { const v = vurguluSorgu; vurguluSorgu = null; return v; })(),
    onSiralamaDegis: (s) => { panoSiralamasi = s; ciz(); },
    onNotDegisti: (metin) => { o.notlar = metin; kaydet(); },
    onHaritayaGit: (sorguId) => {
      vurguluSorgu = sorguId;
      uyg.sekme = "harita";
      kaydet();
      ciz();
    },
  });
}

// ---- Pencereler -------------------------------------------------------------------------------

function acikSorguPenceresi(): HTMLElement | null {
  if (!hazirlananSorgu || secimBekleyen) return null;
  const o = uyg.oturum!;
  const sensor = o.sensorler().find((x) => x.id === hazirlananSorgu!.sensorId);
  if (!sensor) return null;
  return sorguPenceresi({
    sensor,
    degerler: hazirlananSorgu.degerler,
    secimAdi: (ad, deger) => o.secimAdi(sensor.parametreler.find((p) => p.ad === ad)?.tip === "kamera" ? "kamera" : "poi", deger),
    ucretsizMi: (degerler) => o.ucretsizMi(sensor.id, degerler),
    onHaritadanSec: (parametreAdi, tip) => {
      secimBekleyen = { parametreAdi, tip };
      uyg.sekme = "harita";
      ciz();
    },
    onSorgula: (degerler) => {
      try {
        acikSonuc = o.sorgula(sensor.id, degerler);
        hazirlananSorgu = null;
        kaydet();
      } catch (e) {
        hataGoster((e as Error).message);
      }
      ciz();
    },
    onKapat: () => { hazirlananSorgu = null; ciz(); },
  });
}

function tahminPenceresi(konum: Konum): HTMLElement {
  const kapat = () => { tahminOnayi = null; ciz(); };
  return el("div", { sinif: "pencere-perde", onclick: (e: Event) => { if (e.target === e.currentTarget) kapat(); } },
    el("div", { sinif: "pencere" },
      el("div", { sinif: "pencere-baslik" }, "TAHMİN"),
      el("div", { sinif: "pencere-govde" },
        el("p", {}, "Hedefin şu anda burada olduğunu bildiriyorsunuz."),
        el("p", { sinif: "ipucu" }, `Konum: ${konum[1].toFixed(5)}, ${konum[0].toFixed(5)}`),
        el("div", { sinif: "maliyet-kutu" },
          el("span", {}, "150 metre içindeyse doğru sayılır. Yanlışsa 250 puan ceza, ikinci yanlışta tur kapanır."),
        ),
      ),
      el("div", { sinif: "dugme-sira" },
        el("button", { type: "button", onclick: kapat }, "Vazgeç"),
        el("button", { type: "button", sinif: "birincil", onclick: () => {
          tahminOnayi = null;
          const o = uyg.oturum!;
          acikTahmin = o.tahmin(konum);
          // Tur bittiyse sonucu yerel geçmişe yaz; sunucu yok, kullanıcı adı yok.
          if (o.bitti()) gecmiseEkle(o.turKaydi());
          kaydet();
          ciz();
        } }, "Tahmini gönder"),
      ),
    ),
  );
}

function tahminSonucPenceresi(t: TahminGorunumu): HTMLElement {
  return el("div", { sinif: "pencere-perde" },
    el("div", { sinif: "pencere" },
      el("div", { sinif: "pencere-baslik" }, t.dogru ? "DOĞRU" : "YANLIŞ"),
      el("div", { sinif: "pencere-govde" },
        el("p", { sinif: t.dogru ? "sonuc-dogru" : "sonuc-yanlis" },
          t.dogru ? `Hedef bulundu. Sapma ${t.mesafe_m} metre.` : `Hedef burada değil. En yakın olduğunuz mesafe ${t.mesafe_m} metre.`),
        !t.dogru && el("p", {}, t.kalan_hak > 0 ? "250 puan ceza uygulandı. Bir tahmin hakkınız kaldı." : "İkinci yanlış tahmin, tur kapandı."),
      ),
      el("div", { sinif: "dugme-sira" },
        el("button", { type: "button", sinif: "birincil", onclick: () => {
          acikTahmin = null;
          if (t.sonuc !== "devam") uyg.ekran = "tur_sonu";
          ciz();
        } }, t.sonuc === "devam" ? "Devam et" : "Tur sonucunu gör"),
      ),
    ),
  );
}

function raptiyePenceresi(konum: Konum): HTMLElement {
  const kutu = el("input", { type: "text", placeholder: "Kısa not (isteğe bağlı)" });
  const kapat = () => { bekleyenRaptiye = null; ciz(); };
  return el("div", { sinif: "pencere-perde", onclick: (e: Event) => { if (e.target === e.currentTarget) kapat(); } },
    el("div", { sinif: "pencere" },
      el("div", { sinif: "pencere-baslik" }, "RAPTİYE"),
      el("div", { sinif: "pencere-govde" }, el("label", {}, "Not"), kutu),
      el("div", { sinif: "dugme-sira" },
        el("button", { type: "button", onclick: kapat }, "Vazgeç"),
        el("button", { type: "button", sinif: "birincil", onclick: () => {
          uyg.oturum!.raptiyeler = [...uyg.oturum!.raptiyeler, { id: `R${Date.now().toString(36)}`, konum, not: kutu.value.trim() }];
          bekleyenRaptiye = null;
          kaydet();
          ciz();
        } }, "Ekle"),
      ),
    ),
  );
}

// ---- Ekranlar ----------------------------------------------------------------------------------

function turEkrani(): HTMLElement {
  const o = uyg.oturum!;
  const ekran = el("div", { sinif: "ekran tur-ekrani" },
    ustSeritCiz(o.ustSerit(), anaEkranaDon),
    sekmeIcerigi(uyg.sekme),
    o.bitti() && el("button", { sinif: "sonuc-serit", type: "button", onclick: () => { uyg.ekran = "tur_sonu"; ciz(); } },
      "Tur bitti, sonucu gör"),
    sekmeCubugu(uyg.sekme, (id) => {
      uyg.sekme = id;
      kaydet();
      ciz();
    }),
  );
  const sorgu = acikSorguPenceresi();
  if (sorgu) ekran.append(sorgu);
  if (tahminOnayi) ekran.append(tahminPenceresi(tahminOnayi));
  if (acikTahmin) ekran.append(tahminSonucPenceresi(acikTahmin));
  if (bekleyenRaptiye) ekran.append(raptiyePenceresi(bekleyenRaptiye));
  if (acikSonuc) {
    const sonuc = acikSonuc;
    ekran.append(sonucPenceresi(sonuc, () => { acikSonuc = null; ciz(); }, (sorguId) => {
      vurguluSorgu = sorguId;
      uyg.sekme = "harita";
      kaydet();
      ciz();
    }));
  }
  return ekran;
}

function ciz(): void {
  if (uyg.ekran === "ogretici") {
    temizle(kok, ekranOgretici({
      kapatmaEtiketi: "Anladım",
      onKapat: () => {
        ogreticiIsaretle();
        uyg.ekran = "ana";
        ciz();
      },
    }));
    return;
  }
  if (uyg.ekran === "tur_sonu" && uyg.oturum) {
    const o = uyg.oturum;
    temizle(kok, ekranTurSonu({
      ozet: o.turSonu(),
      hedefAdi: o.dosya().ad,
      seed: o.dosya().seed,
      onSeedKopyala: () => seedKopyala(o.dosya().seed),
      onHaritayiIncele: () => {
        uyg.ekran = "tur";
        uyg.sekme = "harita";
        ciz();
        setTimeout(() => harita?.merkezle(o.turSonu().gercek_konum, 14), 50);
      },
      onYeniDava: () => {
        turSil();
        uyg.oturum = null;
        uyg.ekran = "ana";
        ciz();
      },
      onAnaEkran: anaEkranaDon,
    }));
    return;
  }
  if (uyg.ekran === "tur" && uyg.oturum) {
    temizle(kok, turEkrani());
    return;
  }
  const ayar = ayarOku();
  const kayit = turOku();
  let devamOzeti = "";
  if (kayit) {
    devamOzeti = `Dosya ${kayit.seed}, ${ZORLUK_ADLARI[kayit.zorluk]}, ${kayit.sorgular.length} sorgu yapılmış.`;
    if (kayit.tahminler.length) devamOzeti += ` ${kayit.tahminler.length} tahmin kullanılmış.`;
  }
  temizle(kok, anaEkran({
    sonZorluk: (ayar.son_zorluk as Zorluk) ?? "standart",
    onOgretici: () => { uyg.ekran = "ogretici"; ciz(); },
    devamEdenVar: Boolean(kayit),
    devamOzeti,
    onBaslat: turBaslat,
    onDevam: () => {
      if (!kayit) return;
      try {
        uyg.oturum = Oturum.yukle(kayit, uyg.veri, uyg.katalog);
        uyg.sekme = (uyg.oturum.aktifSekme as SekmeKimligi) ?? "dosya";
        uyg.ekran = uyg.oturum.bitti() ? "tur_sonu" : "tur";
        ciz();
      } catch (e) {
        turSil();
        hataGoster(e instanceof DavaBulunamadi ? e.message : "Kayıt açılamadı.");
        ciz();
      }
    },
    onSil: () => {
      turSil();
      uyg.oturum = null;
      ciz();
    },
  }));
}

async function basla(): Promise<void> {
  temizle(kok, el("div", { sinif: "yukleniyor" },
    el("p", {}, "VERİ TABANLARINA BAĞLANILIYOR"),
    el("div", { sinif: "yukleme-cubugu" }, el("span", {})),
  ));
  try {
    const veri = await veriYukleWeb();
    // Oyuna ilk kez girenler önce kuralları görür.
    uyg = { veri, katalog: katalogYukleWeb(), ekran: ogreticiGoruldu() ? "ana" : "ogretici", oturum: null, sekme: "dosya" };
    ciz();
  } catch (e) {
    console.error(e);
    temizle(kok, el("div", { sinif: "hata-kutu" }, "Veri yüklenemedi. Sayfayı yenileyin."));
  }
}

void basla();

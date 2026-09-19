// Uygulama girişi ve ekran yönlendirici.
// Ekranlar yalnızca src/app katmanını kullanır; motor tipleri buraya girmez.

import "maplibre-gl/dist/maplibre-gl.css";
import { el, temizle } from "./dom.ts";
import { anaEkran } from "./ekran-ana.ts";
import { ekranTurSonu } from "./ekran-tur-sonu.ts";
import { sekmeCubugu, ustSeritCiz, type SekmeKimligi } from "./kabuk.ts";
import { sekmeDosya } from "./sekme-dosya.ts";
import { sekmeSorgu, sonucPenceresi } from "./sekme-sorgu.ts";
import { sekmePano } from "./sekme-pano.ts";
import { sekmeHarita } from "./sekme-harita.ts";
import { HaritaYoneticisi, type HaritaModu } from "./harita.ts";
import { veriYukleWeb, katalogYukleWeb } from "../engine/data-web.ts";
import { DavaBulunamadi, Oturum } from "../app/oturum.ts";
import { ayarOku, ayarYaz, turOku, turSil, turYaz } from "../app/depo.ts";
import { ZORLUK_ADLARI, type Konum, type SonucGorunumu, type TahminGorunumu, type Zorluk } from "../app/gorunum.ts";
import type { Veri } from "../engine/data.ts";
import type { SensorKatalogu } from "../engine/schema.ts";

type Ekran = "ana" | "tur" | "tur_sonu";

interface Uygulama {
  veri: Veri;
  katalog: SensorKatalogu;
  ekran: Ekran;
  oturum: Oturum | null;
  sekme: SekmeKimligi;
}

const kok = document.getElementById("uygulama")!;
let uyg: Uygulama;

function kaydet(): void {
  if (uyg.oturum) {
    uyg.oturum.aktifSekme = uyg.sekme;
    turYaz(uyg.oturum.kaydet());
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
    hataGoster(e instanceof DavaBulunamadi ? e.message : "Dava üretilemedi.");
    return;
  }
  uyg.sekme = "dosya";
  uyg.ekran = "tur";
  ayarYaz({ son_zorluk: zorluk, son_seed: seed });
  kaydet();
  ciz();
}

function hataGoster(mesaj: string): void {
  const kutu = el("div", { sinif: "hata-kutu" }, mesaj);
  kok.prepend(kutu);
  setTimeout(() => kutu.remove(), 4000);
}

/** Vurgulanacak sorgu; DOSYA sekmesinden PANO'ya geçerken kullanılır. */
let vurguluSorgu: string | null = null;
/** Sorgu sonrası gösterilecek sonuç penceresi. */
let acikSonuc: SonucGorunumu | null = null;
/** Haritadan nokta bekleyen sorgu. Harita sekmesi seçim yapınca tamamlanır. */
export let bekleyenSorgu: { sensorId: string; parametreler: Record<string, string | number> } | null = null;

export function bekleyenSorguyuTamamla(poiId: string): void {
  if (!bekleyenSorgu || !uyg.oturum) return;
  const { sensorId, parametreler } = bekleyenSorgu;
  bekleyenSorgu = null;
  try {
    acikSonuc = uyg.oturum.sorgula(sensorId, { ...parametreler, poi_id: poiId });
  } catch (e) {
    hataGoster((e as Error).message);
  }
  kaydet();
  ciz();
}

export function bekleyenSorguyuIptal(): void {
  bekleyenSorgu = null;
  harita?.modAyarla("gez");
  ciz();
}

/** Tek harita örneği; sekmeler arasında korunur. */
let harita: HaritaYoneticisi | null = null;
let haritaModu: HaritaModu = "gez";
let acikTahmin: TahminGorunumu | null = null;
let bekleyenRaptiye: Konum | null = null;

function haritaKur(): HaritaYoneticisi {
  if (harita) return harita;
  harita = new HaritaYoneticisi({
    onNoktaSecildi: (poiId) => bekleyenSorguyuTamamla(poiId),
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

/** Onay bekleyen tahmin konumu. */
let tahminOnayi: Konum | null = null;

function sekmeIcerigi(sekme: SekmeKimligi): HTMLElement {
  const o = uyg.oturum!;
  if (sekme === "dosya") {
    return sekmeDosya({
      dosya: o.dosya(),
      gecmis: o.gecmis(),
      serit: o.ustSerit(),
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
      onSorgula: (sensorId, parametreler) => {
        const sonuc = o.sorgula(sensorId, parametreler);
        acikSonuc = sonuc;
        kaydet();
        // Pencere kapandıktan sonra sonuç penceresiyle yeniden çizilir.
        setTimeout(ciz, 0);
        return sonuc;
      },
      onNoktaSec: (sensorId, mevcut) => {
        bekleyenSorgu = { sensorId, parametreler: mevcut };
        uyg.sekme = "harita";
        kaydet();
        ciz();
      },
    });
  }
  if (sekme === "harita") {
    const h = haritaKur();
    h.noktalariEkle(o.noktalar());
    h.katmanlariGuncelle(o.gecmis(), o.gizliKatmanlar);
    h.cizimleriGuncelle({
      raptiyeler: o.raptiyeler,
      dislamalar: o.dislamalar,
      tahminler: o.tahminler(),
      gercekKonum: o.bitti() ? o.turSonu().gercek_konum : null,
    });
    if (bekleyenSorgu && haritaModu !== "nokta_secim") h.modAyarla("nokta_secim");
    if (!bekleyenSorgu && haritaModu === "nokta_secim") h.modAyarla("gez");
    const bekleyenAd = bekleyenSorgu ? o.sensorler().find((x) => x.id === bekleyenSorgu!.sensorId)?.ad ?? "Sorgu" : null;
    const icerik = sekmeHarita({
      harita: h,
      gecmis: o.gecmis(),
      gizli: o.gizliKatmanlar,
      raptiyeler: o.raptiyeler,
      dislamalar: o.dislamalar,
      mod: haritaModu,
      noktalarGorunur: h.noktalarGorunur(),
      bekleyenSorguAdi: bekleyenAd,
      turBitti: o.bitti(),
      onKatmanDegis: (sorguId, gorunur) => {
        if (gorunur) o.gizliKatmanlar.delete(sorguId);
        else o.gizliKatmanlar.add(sorguId);
        h.katmanlariGuncelle(o.gecmis(), o.gizliKatmanlar);
        kaydet();
      },
      onNoktalarDegis: (gorunur) => h.noktalariGoster(gorunur),
      onModDegis: (mod) => { h.modAyarla(mod); ciz(); },
      onKatmanaGit: (sorguId) => {
        const s = o.gecmis().find((x) => x.sorgu_id === sorguId);
        if (s) h.katmanaGit(s);
      },
      onRaptiyeSil: (id) => { o.raptiyeler = o.raptiyeler.filter((r) => r.id !== id); kaydet(); ciz(); },
      onDislamaSil: (id) => { o.dislamalar = o.dislamalar.filter((d) => d.id !== id); kaydet(); ciz(); },
      onSecimIptal: bekleyenSorguyuIptal,
    });
    // Harita kapsayıcısı DOM'a takıldıktan sonra kurulur veya boyutlanır.
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
  if (sekme === "pano") {
    const vurgulu = vurguluSorgu;
    vurguluSorgu = null;
    return sekmePano({
      gecmis: o.gecmis(),
      notlar: o.notlar,
      vurgulu,
      onNotDegisti: (metin) => {
        // Yeniden çizim yapılmaz, yoksa yazarken imleç kaybolur.
        o.notlar = metin;
        kaydet();
      },
      onHaritayaGit: (sorguId) => {
        vurguluSorgu = sorguId;
        uyg.sekme = "harita";
        kaydet();
        ciz();
      },
    });
  }
  return el("div", { sinif: "sekme-icerik yer-tutucu" }, el("p", {}, "Bilinmeyen sekme."));
}

/** Tahmin onayı penceresi: uzun basmadan sonra çıkar. */
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
          acikTahmin = uyg.oturum!.tahmin(konum);
          kaydet();
          ciz();
        } }, "Tahmini gönder"),
      ),
    ),
  );
}

/** Tahmin sonucu penceresi. */
function tahminSonucPenceresi(t: TahminGorunumu): HTMLElement {
  const kapat = () => { acikTahmin = null; ciz(); };
  return el("div", { sinif: "pencere-perde" },
    el("div", { sinif: "pencere" },
      el("div", { sinif: "pencere-baslik" }, t.dogru ? "DOĞRU" : "YANLIŞ"),
      el("div", { sinif: "pencere-govde" },
        el("p", { sinif: t.dogru ? "sonuc-dogru" : "sonuc-yanlis" },
          t.dogru ? `Hedef bulundu. Sapma ${t.mesafe_m} metre.` : `Hedef burada değil. En yakın olduğunuz mesafe ${t.mesafe_m} metre.`),
        !t.dogru && el("p", {}, t.kalan_hak > 0 ? `250 puan ceza uygulandı. Bir tahmin hakkınız kaldı.` : "İkinci yanlış tahmin, tur kapandı."),
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

/** Raptiye notu penceresi. */
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
  if (uyg.ekran === "tur_sonu" && uyg.oturum) {
    const o = uyg.oturum;
    temizle(kok, ekranTurSonu({
      ozet: o.turSonu(),
      hedefAdi: o.dosya().ad,
      onHaritayiIncele: () => {
        uyg.ekran = "tur";
        uyg.sekme = "harita";
        ciz();
        // Gerçek konum haritada işaretlidir; oraya yaklaşılır.
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
    devamOzeti = `Dava ${kayit.seed}, ${ZORLUK_ADLARI[kayit.zorluk]}, ${kayit.sorgular.length} sorgu yapılmış.`;
    if (kayit.tahminler.length) devamOzeti += ` ${kayit.tahminler.length} tahmin kullanılmış.`;
  }
  temizle(kok, anaEkran({
    sonZorluk: (ayar.son_zorluk as Zorluk) ?? "standart",
    sonSeed: ayar.son_seed,
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
    uyg = { veri, katalog: katalogYukleWeb(), ekran: "ana", oturum: null, sekme: "dosya" };
    ciz();
  } catch (e) {
    console.error(e);
    temizle(kok, el("div", { sinif: "hata-kutu" }, "Veri yüklenemedi. Sayfayı yenileyin."));
  }
}

void basla();

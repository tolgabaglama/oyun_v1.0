// Dava üreticisi. Deterministik: aynı seed, zorluk ve üretici sürümü aynı davayı verir.
// CLAUDE.md 6. bölümdeki hayat modelini kurar, 14 günlük rutini çalıştırır, olayları sensör
// tanımlarına göre kayıtlara düşürür, gürültü ekler. Sensöre özel kod yoktur; ayak izi tipine
// ve alan adlarına göre genel işleyiciler çalışır.

import type {
  Dava, GizliGercek, HedefProfili, Kayit, Konum, Olay, OdemeDisiplini, SensorKatalogu, SensorTanimi,
  TelefonDisiplini, UlasimModu, Yaka, Yer, YerRolu, Zaman, Zorluk, Yolculuk, Odeme, GeometriRef,
} from "./schema.ts";
import { zamanDakika } from "./schema.ts";
import { rngOlustur, metinTohumu, type Rng } from "./rng.ts";
import { enYakin, hucreBul, yaka, yakinlar, type Poi, type Veri } from "./data.ts";
import { mesafeM, yonDerece } from "./geo.ts";

export const URETICI_SURUMU = "0.1.0";

/** Üretim reddi: dava kurulamadı, neden batch raporunda sayılır. */
export class UretimReddi extends Error {
  neden: string;
  constructor(neden: string, mesaj?: string) {
    super(mesaj ?? neden);
    this.neden = neden;
  }
}

// ---- Zaman yardımcıları -------------------------------------------------------------------

const HAFTA_SONU = new Set([5, 6, 12, 13]); // 1. gün çarşamba, 14. gün salı
const BUGUN = 14;

function zaman(gun: number, saat: number, dakika = 0): Zaman {
  return { gun, saat, dakika };
}
function dakikadan(dk: number): Zaman {
  const gun = Math.floor(dk / 1440) + 1;
  const kalan = dk - (gun - 1) * 1440;
  return { gun, saat: Math.floor(kalan / 60), dakika: kalan % 60 };
}
function ekle(z: Zaman, dk: number): Zaman {
  return dakikadan(zamanDakika(z) + dk);
}
function once(a: Zaman, b: Zaman): boolean {
  return zamanDakika(a) < zamanDakika(b);
}

// ---- Hayat modeli -------------------------------------------------------------------------

const EV_KATEGORILERI = ["market", "eczane", "cami", "kahvehane"];
const UCUNCU_KATEGORILERI = ["spor_salonu", "kahvehane", "cami", "market"];
const RUTIN_DISI_KATEGORILERI = ["market", "kahvehane", "spor_salonu", "cami", "eczane", "doviz"];
/** İş çevresi: öğle arasında gidilen yerler. Yakınlık yarıçapı metre. */
const IS_CEVRESI_KATEGORILERI = ["market", "kahvehane", "eczane", "kargo", "doviz"];
const IS_CEVRESI_YARICAP_M = 300;

interface HayatModeli {
  ev: Yer; is: Yer; ucuncu: Yer;
  sporSalonuUyesi: boolean;
  ulasim: UlasimModu; odeme: OdemeDisiplini; telefon: TelefonDisiplini;
  arac_var: boolean; plaka: string | null;
  dovizGunu: number | null;
}

function yerYap(veri: Veri, poi: Poi, rol: YerRolu): Yer {
  const h = hucreBul(veri, poi.konum);
  return { poi_id: poi.id, rol, kategori: poi.kategori, ilce: poi.ilce, mahalle: poi.mahalle, konum: poi.konum, hucre_kodu: h?.kod ?? "BZ-000", yaka: yaka(poi.ilce) };
}

/** Koşula uyanlar önce süzülür, sonra aralarından seçilir. Boşsa null. */
function kategoridenSec(veri: Veri, rng: Rng, kategoriler: string[], kosul?: (p: Poi) => boolean): Poi | null {
  const havuz = kategoriler.flatMap((k) => veri.kategoriye.get(k) ?? []).filter((p) => !kosul || kosul(p));
  return havuz.length ? rng.sec(havuz) : null;
}

function plakaUret(rng: Rng): string {
  const harf = "ABCDEFGHJKLMNPRSTUVYZ";
  return `34 ${rng.sec([...harf])}${rng.sec([...harf])}${rng.sec([...harf])} ${rng.tam(100, 999)}`;
}

function hayatModeliKur(veri: Veri, rng: Rng): HayatModeli {
  const evPoi = kategoridenSec(veri, rng, EV_KATEGORILERI)!;
  const isPoi = kategoridenSec(veri, rng, [...veri.kategoriye.keys()], (p) => {
    const m = mesafeM(p.konum, evPoi.konum);
    return p.id !== evPoi.id && m >= 2000 && m <= 25000;
  });
  if (!isPoi) throw new UretimReddi("is_bulunamadi");
  const ucuncuKosul = (yaricap: number) => (p: Poi) =>
    p.id !== evPoi.id && p.id !== isPoi.id && (mesafeM(p.konum, evPoi.konum) <= yaricap || mesafeM(p.konum, isPoi.konum) <= yaricap);
  // Spor salonu üyeliği: hedeflerin üçte biri üyedir, üçüncü noktası spor salonu olur.
  const uye = rng.sans(0.35);
  const ucuncuHavuz = uye ? ["spor_salonu"] : UCUNCU_KATEGORILERI;
  const ucuncuPoi = kategoridenSec(veri, rng, ucuncuHavuz, ucuncuKosul(3000))
    ?? kategoridenSec(veri, rng, ucuncuHavuz, ucuncuKosul(6000))
    ?? kategoridenSec(veri, rng, UCUNCU_KATEGORILERI, ucuncuKosul(6000));
  if (!ucuncuPoi) throw new UretimReddi("ucuncu_bulunamadi");

  const ulasim = rng.agirlikli<UlasimModu>([["arac", 0.4], ["toplu_tasima", 0.4], ["karisik", 0.2]]);
  const arac_var = ulasim !== "toplu_tasima" || rng.sans(0.3);
  const odeme = rng.agirlikli<OdemeDisiplini>([["hep_kart", 0.45], ["hep_nakit", 0.3], ["doviz_sonrasi_nakit", 0.25]]);
  const telefon = rng.agirlikli<TelefonDisiplini>([["hep_acik", 0.5], ["geceleri_kapali", 0.3], ["son_3_gun_kapali", 0.2]]);
  return {
    ev: yerYap(veri, evPoi, "ev"), is: yerYap(veri, isPoi, "is"), ucuncu: yerYap(veri, ucuncuPoi, "ucuncu"),
    sporSalonuUyesi: ucuncuPoi.kategori === "spor_salonu",
    ulasim, odeme, telefon, arac_var, plaka: arac_var ? plakaUret(rng) : null,
    dovizGunu: odeme === "doviz_sonrasi_nakit" ? rng.tam(4, 8) : null,
  };
}

// ---- Rutin ----------------------------------------------------------------------------------

interface Baglam {
  veri: Veri; rng: Rng; model: HayatModeli; olaylar: Olay[]; sayac: number;
  suAn: Zaman; zorluk: Zorluk;
}

function telefonAcik(model: HayatModeli, z: Zaman): boolean {
  if (model.telefon === "son_3_gun_kapali") return z.gun < BUGUN - 2;
  if (model.telefon === "geceleri_kapali") return z.saat >= 7;
  return true;
}

function odemeSekli(model: HayatModeli, z: Zaman): Odeme {
  if (model.odeme === "hep_kart") return "kart";
  if (model.odeme === "hep_nakit") return "nakit";
  return model.dovizGunu !== null && z.gun > model.dovizGunu ? "nakit" : "kart";
}

function olayEkle(b: Baglam, tur: string, z: Zaman, ek: Partial<Olay> = {}): Olay {
  if (z.gun > BUGUN) z = zaman(BUGUN, 23, 59);
  const bitis = ek.bitis && ek.bitis.gun > BUGUN ? zaman(BUGUN, 23, 59) : (ek.bitis ?? null);
  const o: Olay = {
    id: `O${String(++b.sayac).padStart(4, "0")}`, tur, zaman: z, bitis,
    yer_poi_id: ek.yer_poi_id ?? null, rol: ek.rol ?? null, yolculuk: ek.yolculuk ?? null,
    odeme: ek.odeme ?? null, telefon_acik: telefonAcik(b.model, z),
  };
  b.olaylar.push(o);
  return o;
}

function tripModu(b: Baglam): UlasimModu {
  if (b.model.ulasim === "karisik") return b.rng.sans(0.5) ? "arac" : "toplu_tasima";
  return b.model.ulasim;
}

/** İki yer arası yolculuk; süre dakika döner. 1,2 km altı yürünür, olay üretilmez. */
function yolculuk(b: Baglam, nereden: Yer, nereye: Yer, z: Zaman): number {
  const m = mesafeM(nereden.konum, nereye.konum);
  if (m < 1200) return Math.round(m / 80) + 2;
  const mod = tripModu(b);
  const sure = Math.min(120, Math.round(mod === "arac" ? m / 1000 / 25 * 60 + 10 : m / 1000 / 18 * 60 + 15));
  const y: Yolculuk = { nereden_poi_id: nereden.poi_id, nereye_poi_id: nereye.poi_id, mod, duraklar: [], gecisler: [] };
  if (mod === "toplu_tasima") {
    const d1 = enYakin(b.veri.duraklar, nereden.konum, 1500);
    const d2 = enYakin(b.veri.duraklar, nereye.konum, 1500);
    if (d1) y.duraklar.push(d1.id);
    if (d2 && d2.id !== d1?.id) y.duraklar.push(d2.id);
  } else if (nereden.yaka !== nereye.yaka) {
    const orta: Konum = [(nereden.konum[0] + nereye.konum[0]) / 2, (nereden.konum[1] + nereye.konum[1]) / 2];
    const g = enYakin(b.veri.gecisler, orta)!;
    y.gecisler.push({ gecis_id: g.id, yon: nereye.yaka });
  }
  olayEkle(b, "yolculuk", z, { bitis: ekle(z, sure), yolculuk: y });
  // Araçla iş yerine gelişte yakında otopark varsa park edilir.
  if (mod === "arac" && nereye.rol === "is") {
    const park = enYakin(b.veri.kategoriye.get("otopark") ?? [], nereye.konum, 1000);
    if (park) olayEkle(b, "park", ekle(z, sure), { yer_poi_id: park.id, rol: "is", bitis: ekle(z, sure + 60 * 9) });
  }
  return sure;
}

function konum(b: Baglam, yer: Yer, bas: Zaman, bit: Zaman): Olay {
  return olayEkle(b, "konum", bas, { yer_poi_id: yer.poi_id, rol: yer.rol, bitis: bit });
}

/**
 * İş çevresi davranışı: hafta içi öğle arasında iş noktasının yakınındaki bir yere gidilir.
 * Ödeme disiplinine uyar: kart disiplininde POS kaydı, nakit disiplininde önce ATM çekimi
 * sonra nakit ödeme. Ödeme kaydı bırakmayan nakit alışverişi de özel kamera kapsamına girer.
 */
function isCevresi(b: Baglam, gun: number): void {
  const r = b.rng;
  const is = b.model.is;
  const havuz = IS_CEVRESI_KATEGORILERI.flatMap((k) => b.veri.kategoriye.get(k) ?? [])
    .filter((p) => p.id !== is.poi_id && mesafeM(p.konum, is.konum) <= IS_CEVRESI_YARICAP_M);
  if (!havuz.length) return;
  const hedef = r.sec(havuz);
  const saat = zaman(gun, r.tam(12, 13), r.tam(0, 55));
  const odeme = odemeSekli(b.model, saat);
  if (odeme === "nakit" && r.sans(0.45)) {
    // Nakitçi önce iş çevresindeki ATM'den çeker.
    const atm = enYakin(b.veri.kategoriye.get("atm") ?? [], is.konum, IS_CEVRESI_YARICAP_M);
    if (atm) olayEkle(b, "atm_cekim", ekle(saat, -12), { yer_poi_id: atm.id, rol: "is" });
  }
  const tur = hedef.kategori === "eczane" ? "eczane" : hedef.kategori === "doviz" ? "doviz" : "alisveris";
  olayEkle(b, tur, saat, { yer_poi_id: hedef.id, rol: "is", bitis: ekle(saat, r.tam(20, 45)), odeme: tur === "alisveris" ? odeme : null });
}

function alisveris(b: Baglam, yakinYer: Yer, z: Zaman, azamiM: number): void {
  const market = enYakin(b.veri.kategoriye.get("market") ?? [], yakinYer.konum, azamiM);
  if (market) olayEkle(b, "alisveris", z, { yer_poi_id: market.id, rol: yakinYer.rol, odeme: odemeSekli(b.model, z) });
}

interface GunSecenekleri {
  aksamUcuncu: boolean;
  rutinDisi: Yer | null;    // akşam veya öğleden sonra ziyaret edilecek rutin dışı yer
  rutinDisiSaat: number;
  benzin: boolean;
  eczane: boolean;
  atm: boolean;
  kargo: boolean;
  doviz: boolean;
  paylasim: boolean;
}

function ziyaret(b: Baglam, nereden: Yer, yer: Yer, z: Zaman, sureDk: number): Zaman {
  const yol = yolculuk(b, nereden, yer, z);
  const varis = ekle(z, yol);
  const bitis = ekle(varis, sureDk);
  konum(b, yer, varis, bitis);
  // Ziyaret yerinde harcama: market ve kahvehanede ödeme, döviz bürosunda işlem.
  if (yer.kategori === "doviz") olayEkle(b, "doviz", ekle(varis, 10), { yer_poi_id: yer.poi_id, rol: yer.rol });
  else if (["market", "kahvehane"].includes(yer.kategori) && b.rng.sans(0.8)) olayEkle(b, "alisveris", ekle(varis, 20), { yer_poi_id: yer.poi_id, rol: yer.rol, odeme: odemeSekli(b.model, z) });
  if (yer.kategori === "eczane") olayEkle(b, "eczane", ekle(varis, 5), { yer_poi_id: yer.poi_id, rol: yer.rol });
  return bitis;
}

function gunPlani(b: Baglam, gun: number, s: GunSecenekleri): void {
  const { ev, is, ucuncu } = b.model;
  const r = b.rng;
  const haftaSonu = HAFTA_SONU.has(gun);
  let simdi = zaman(gun, 0, 0);

  if (haftaSonu) {
    const cikis = zaman(gun, r.tam(10, 11), r.tam(0, 59));
    konum(b, ev, simdi, cikis);
    simdi = cikis;
    if (s.rutinDisi) simdi = ziyaret(b, ev, s.rutinDisi, zaman(gun, s.rutinDisiSaat, r.tam(0, 40)), r.tam(60, 150));
    else if (r.sans(0.7)) simdi = ziyaret(b, ev, ucuncu, simdi, r.tam(90, 150));
    const donus = yolculuk(b, s.rutinDisi ?? (zamanDakika(simdi) > zamanDakika(cikis) ? ucuncu : ev), ev, simdi);
    simdi = ekle(simdi, donus);
    if (r.sans(0.8)) alisveris(b, ev, zaman(gun, 16, r.tam(0, 59)), 900);
    konum(b, ev, simdi, zaman(gun, 23, 59));
  } else {
    const cikis = zaman(gun, 7, r.tam(20, 50));
    konum(b, ev, simdi, cikis);
    if (s.benzin && b.model.arac_var) {
      const benzinlik = enYakin(b.veri.kategoriye.get("benzinlik") ?? [], ev.konum, 4000) ?? enYakin(b.veri.kategoriye.get("benzinlik") ?? [], ev.konum);
      if (benzinlik) olayEkle(b, "benzin", ekle(cikis, 8), { yer_poi_id: benzinlik.id, rol: "ev", odeme: odemeSekli(b.model, cikis) });
    }
    const yol = yolculuk(b, ev, is, cikis);
    const varis = ekle(cikis, yol);
    const mesaiBitis = zaman(gun, 17, r.tam(15, 45));
    const mesai = konum(b, is, varis, mesaiBitis);
    if (r.sans(0.75)) isCevresi(b, gun);
    if (s.doviz) {
      const buro = enYakin(b.veri.kategoriye.get("doviz") ?? [], is.konum, 6000) ?? enYakin(b.veri.kategoriye.get("doviz") ?? [], ev.konum);
      if (buro) olayEkle(b, "doviz", zaman(gun, 13, r.tam(0, 30)), { yer_poi_id: buro.id, rol: "rutin_disi" });
    }
    if (s.atm) {
      const hedef = r.sans(0.6) ? ev : is;
      const atm = enYakin(b.veri.kategoriye.get("atm") ?? [], hedef.konum, 1500);
      if (atm) olayEkle(b, "atm_cekim", hedef === ev ? ekle(cikis, -15) : zaman(gun, 12, r.tam(0, 15)), { yer_poi_id: atm.id, rol: hedef.rol });
    }
    simdi = mesaiBitis;
    let bulundugu: Yer = is;
    if (s.rutinDisi) {
      const cikisSaati = zaman(gun, s.rutinDisiSaat, r.tam(0, 20));
      // Rutin dışı ziyaret için mesai erken biter.
      const bas = once(cikisSaati, mesaiBitis) ? cikisSaati : mesaiBitis;
      mesai.bitis = bas;
      simdi = ziyaret(b, is, s.rutinDisi, bas, r.tam(90, 180));
      bulundugu = s.rutinDisi;
    } else if (s.aksamUcuncu) {
      simdi = ziyaret(b, is, ucuncu, simdi, r.tam(90, 150));
      bulundugu = ucuncu;
    }
    const donus = yolculuk(b, bulundugu, ev, simdi);
    simdi = ekle(simdi, donus);
    if (s.eczane) {
      const eczane = enYakin(b.veri.kategoriye.get("eczane") ?? [], ev.konum, 1200);
      if (eczane) olayEkle(b, "eczane", ekle(simdi, 10), { yer_poi_id: eczane.id, rol: "ev", odeme: odemeSekli(b.model, simdi) });
    }
    konum(b, ev, simdi, zaman(gun, 23, 59));
  }
  if (s.kargo) {
    const yer = r.sans(0.7) ? ev : is;
    olayEkle(b, "kargo_teslim", zaman(gun, r.tam(11, 16), r.tam(0, 59)), { yer_poi_id: yer.poi_id, rol: yer.rol });
  }
  if (s.paylasim) {
    const yer = s.rutinDisi ?? ucuncu;
    olayEkle(b, "paylasim", zaman(gun, r.tam(12, 20), r.tam(0, 59)), { yer_poi_id: yer.poi_id, rol: yer.rol });
  }
}

/** Şu anki konum türü zorluğa göre: kolay ev, standart iş veya üçüncü, uzman rutin dışı. */
function suAnPlani(b: Baglam, rng: Rng): { hedefRol: YerRolu; rutinDisi: Yer | null; rutinDisiSaat: number } {
  if (b.zorluk === "kolay") return { hedefRol: "ev", rutinDisi: null, rutinDisiSaat: 0 };
  if (b.zorluk === "standart") return rng.sans(0.5) ? { hedefRol: "is", rutinDisi: null, rutinDisiSaat: 0 } : { hedefRol: "ucuncu", rutinDisi: null, rutinDisiSaat: 0 };
  // Uzman: rutin dışı yer. Adalet kuralı için yerin kayıt bırakması gerekir: telefon kapalıysa
  // yalnızca kendiliğinden kayıt üreten kategoriler (eczane, döviz) veya kartla ödeme yapılan yerler.
  const { ev, is, ucuncu } = b.model;
  const telefonSonGun = telefonAcik(b.model, zaman(BUGUN, 16));
  const kategoriler = telefonSonGun ? RUTIN_DISI_KATEGORILERI
    : b.model.odeme === "hep_kart" ? ["market", "kahvehane", "eczane", "doviz"] : ["eczane", "doviz"];
  const poi = kategoridenSec(b.veri, rng, kategoriler, (p) =>
    ![ev.poi_id, is.poi_id, ucuncu.poi_id].includes(p.id) && mesafeM(p.konum, ev.konum) <= 9000 && mesafeM(p.konum, is.konum) > 800);
  if (!poi) throw new UretimReddi("rutin_disi_bulunamadi");
  return { hedefRol: "rutin_disi", rutinDisi: yerYap(b.veri, poi, "rutin_disi"), rutinDisiSaat: 14 };
}

function rutinKur(veri: Veri, rng: Rng, model: HayatModeli, zorluk: Zorluk): { olaylar: Olay[]; suAn: Zaman; hedefRol: YerRolu; rutinDisi: Yer | null } {
  const b: Baglam = { veri, rng, model, olaylar: [], sayac: 0, suAn: zaman(BUGUN, 23, 59), zorluk };
  const plan = suAnPlani(b, rng);

  const eczaneGunleri = new Set([rng.tam(2, 13), ...(rng.sans(0.4) ? [rng.tam(2, 13)] : [])]);
  const kargoGunleri = new Set([rng.tam(1, 13), ...(rng.sans(0.5) ? [rng.tam(1, 13)] : [])]);
  const atmAralik = model.odeme === "hep_kart" ? 9 : 3;
  const benzinBaslangic = rng.tam(1, 4);
  const rutinDisiGun = rng.sans(0.7) ? rng.sec([5, 6, 8, 9, 12]) : null;
  const erkenRutinDisi = rutinDisiGun !== null
    ? (() => { const p = kategoridenSec(veri, rng, RUTIN_DISI_KATEGORILERI, (p) => ![model.ev.poi_id, model.is.poi_id, model.ucuncu.poi_id].includes(p.id) && mesafeM(p.konum, model.ev.konum) <= 9000); return p ? yerYap(veri, p, "rutin_disi") : null; })()
    : null;
  const paylasimGunu = rng.sans(0.25) ? rng.tam(3, 13) : null;

  for (let gun = 1; gun <= BUGUN; gun++) {
    const sonGun = gun === BUGUN;
    const atmGunu = model.odeme !== "hep_kart"
      ? (gun % atmAralik === 1 && (model.dovizGunu === null || gun <= model.dovizGunu))
      : gun % atmAralik === 1;
    gunPlani(b, gun, {
      aksamUcuncu: sonGun ? plan.hedefRol === "ucuncu" : rng.sans(0.4),
      rutinDisi: sonGun ? plan.rutinDisi : (gun === rutinDisiGun ? erkenRutinDisi : null),
      rutinDisiSaat: sonGun ? plan.rutinDisiSaat : (HAFTA_SONU.has(gun) ? 14 : 16),
      benzin: model.arac_var && model.ulasim !== "toplu_tasima" && (gun - benzinBaslangic) % 4 === 0 && gun >= benzinBaslangic,
      eczane: eczaneGunleri.has(gun) && !HAFTA_SONU.has(gun),
      atm: atmGunu && !HAFTA_SONU.has(gun),
      kargo: kargoGunleri.has(gun),
      doviz: gun === model.dovizGunu && !HAFTA_SONU.has(gun),
      paylasim: gun === paylasimGunu,
    });
  }
  // Şu an: son günde hedef yerdeki konum olayının içinden seçilir, sonrası kesilir.
  const hedefPoi = plan.hedefRol === "ev" ? model.ev.poi_id : plan.hedefRol === "is" ? model.is.poi_id : plan.hedefRol === "ucuncu" ? model.ucuncu.poi_id : plan.rutinDisi!.poi_id;
  const adaylar = b.olaylar.filter((o) => o.tur === "konum" && o.zaman.gun === BUGUN && o.yer_poi_id === hedefPoi && o.bitis && zamanDakika(o.bitis) - zamanDakika(o.zaman) >= 20);
  const kapsayan = plan.hedefRol === "ev" ? adaylar.filter((o) => o.zaman.saat >= 12).at(-1) : adaylar.at(-1);
  if (!kapsayan) throw new UretimReddi("su_an_uyusmuyor");
  const sure = zamanDakika(kapsayan.bitis!) - zamanDakika(kapsayan.zaman);
  const suAn = ekle(kapsayan.zaman, rng.tam(Math.min(20, sure - 1), Math.min(sure - 1, plan.hedefRol === "is" ? 300 : 120)));
  const kesik: Olay[] = [];
  for (const o of b.olaylar) {
    if (zamanDakika(o.zaman) > zamanDakika(suAn)) continue;
    if (o.bitis && zamanDakika(o.bitis) > zamanDakika(suAn)) o.bitis = suAn;
    kesik.push(o);
  }
  kesik.sort((x, y) => zamanDakika(x.zaman) - zamanDakika(y.zaman) || x.id.localeCompare(y.id));
  return { olaylar: kesik, suAn, hedefRol: plan.hedefRol, rutinDisi: plan.rutinDisi };
}

// ---- Kayıt türetme ----------------------------------------------------------------------------

interface KayitBaglami {
  veri: Veri; rng: Rng; model: HayatModeli; suAn: Zaman; sayac: number;
  kayitliAdres: Poi | null;
  /** Kapsama ve saklama kararlarının tohumu; dava boyunca sabittir. */
  seed: number;
}

const PUSULA = ["K", "KD", "D", "GD", "G", "GB", "B", "KB"];
function pusula(derece: number): string {
  return PUSULA[Math.round(derece / 45) % 8];
}
const TUTARLAR = ["0-500 TL", "500-2.000 TL", "2.000-10.000 TL", "10.000 TL üstü"];

function yeniKayit(k: KayitBaglami, sensor: SensorTanimi, olay: Olay | null, z: Zaman, alanlar: Kayit["alanlar"], geometri: GeometriRef | null, gurultu: string | null = null): Kayit {
  return { id: `K${String(++k.sayac).padStart(4, "0")}`, sensor_id: sensor.id, olay_id: olay?.id ?? null, gurultu, zaman: z, alanlar, geometri };
}

/** Alan adlarına göre değer doldurur. Alan adları sensörler arasında ortak anlam taşır. */
function alanDoldur(k: KayitBaglami, sensor: SensorTanimi, olay: Olay, poi: Poi | null, z: Zaman, ek: Record<string, string | number | boolean | null>): Kayit["alanlar"] {
  const out: Kayit["alanlar"] = {};
  for (const alan of sensor.alanlar) {
    if (alan in ek) { out[alan] = ek[alan]; continue; }
    switch (alan) {
      case "poi_id": case "adres_poi": out[alan] = poi?.id ?? null; break;
      case "ilce": {
        // Boş koşulu sağlanan kayıtlarda konum alanları doldurulmaz.
        const bos = sensor.bos_kosulu && out[sensor.bos_kosulu.alan] === sensor.bos_kosulu.deger;
        out[alan] = bos ? null : poi?.ilce ?? null;
        break;
      }
      case "mahalle": out[alan] = poi?.mahalle ?? null; break;
      case "kategori": out[alan] = poi?.kategori ?? null; break;
      case "gun": out[alan] = z.gun; break;
      case "saat": out[alan] = `${String(z.saat).padStart(2, "0")}:${String(z.dakika).padStart(2, "0")}`; break;
      // Son bağlantı: evde kalışın bitişi (ev boşaltıldığı an), hâlâ evdeyse şu an.
      case "son_baglanti_gun": out[alan] = (olay.bitis ?? z).gun; break;
      case "son_baglanti_saat": { const b = olay.bitis ?? z; out[alan] = `${String(b.saat).padStart(2, "0")}:${String(b.dakika).padStart(2, "0")}`; break; }
      case "kayit_yili": out[alan] = k.rng.tam(2004, 2024); break;
      case "abone_tipi": out[alan] = "mesken"; break;
      case "arac_var": out[alan] = k.model.arac_var ? "evet" : "hayır"; break;
      case "plaka": out[alan] = k.model.plaka; break;
      // Araç yoksa tescil ilçesi de yoktur; dolu bırakmak ev ilçesini sızdırırdı.
      case "ilce_tescil": out[alan] = k.model.arac_var ? poi?.ilce ?? null : null; break;
      case "teslim_yeri": out[alan] = olay.rol === "is" ? "iş yeri" : "ev"; break;
      case "tutar_araligi": out[alan] = k.rng.sec(TUTARLAR); break;
      case "sure_dk": out[alan] = olay.bitis ? zamanDakika(olay.bitis) - zamanDakika(olay.zaman) : k.rng.tam(30, 240); break;
      case "kaynak_sensor": out[alan] = sensor.id; break;
      default: out[alan] = null;
    }
  }
  return out;
}

type Isleyici = (k: KayitBaglami, sensor: SensorTanimi, olay: Olay) => Kayit[];

const ISLEYICILER: Record<string, Isleyici> = {
  adres(k, sensor, olay) {
    const poi = k.veri.poiMap.get(olay.yer_poi_id!)!;
    const geometri: GeometriRef | null = sensor.hassasiyet === "nokta" ? { tip: "poi", id: poi.id }
      : sensor.hassasiyet === "mahalle" && poi.mahalle ? { tip: "mahalle", id: poi.mahalle } : null;
    return [yeniKayit(k, sensor, olay, olay.zaman, alanDoldur(k, sensor, olay, poi, olay.zaman, {}), geometri)];
  },
  nokta(k, sensor, olay) {
    const poi = k.veri.poiMap.get(olay.yer_poi_id!)!;
    if (!kapsamdaMi(sensor, poi, k.seed)) return [];
    const ek: Record<string, string | number | boolean | null> = {};
    if (sensor.alanlar.includes("eslesme")) {
      ek.eslesme = "var";
      ek.yon = olay.tur === "konum" && olay.bitis && zamanDakika(olay.bitis) < zamanDakika(k.suAn) ? "çıkış" : "giriş";
    }
    if (sensor.alanlar.includes("giris_saat")) {
      const bitis = olay.bitis ?? olay.zaman;
      ek.giris_saat = `${String(olay.zaman.saat).padStart(2, "0")}:${String(olay.zaman.dakika).padStart(2, "0")}`;
      ek.cikis_saat = `${String(bitis.saat).padStart(2, "0")}:${String(bitis.dakika).padStart(2, "0")}`;
    }
    let geometri: GeometriRef | null = { tip: "poi", id: poi.id };
    if (sensor.belirsizlik_m) {
      // Kaba konum: gerçek noktanın etrafında belirsizlik yarıçapı içinde sapma.
      const r = k.rng.sayi() * sensor.belirsizlik_m, a = k.rng.sayi() * 2 * Math.PI;
      const lon = poi.konum[0] + (Math.sin(a) * r) / (111_320 * Math.cos((41 * Math.PI) / 180));
      const lat = poi.konum[1] + (Math.cos(a) * r) / 111_320;
      ek.kaba_konum = `${lon.toFixed(5)},${lat.toFixed(5)}`;
      geometri = null;
    }
    return [yeniKayit(k, sensor, olay, olay.zaman, alanDoldur(k, sensor, olay, poi, olay.zaman, ek), geometri)];
  },
  hucre(k, sensor, olay) {
    const poiId = olay.tur === "yolculuk" ? olay.yolculuk!.nereye_poi_id : olay.yer_poi_id!;
    const poi = k.veri.poiMap.get(poiId)!;
    const z = olay.tur === "yolculuk" && olay.bitis ? olay.bitis : olay.zaman;
    const h = hucreBul(k.veri, poi.konum);
    if (!h) return [];
    return [yeniKayit(k, sensor, olay, z, alanDoldur(k, sensor, olay, poi, z, { hucre_kodu: h.kod }), { tip: "hucre", id: h.kod })];
  },
  koni(k, sensor, olay) {
    const y = olay.yolculuk!;
    const a = k.veri.poiMap.get(y.nereden_poi_id)!, b = k.veri.poiMap.get(y.nereye_poi_id)!;
    const yon = pusula(yonDerece(a.konum, b.konum));
    const out: Kayit[] = [];
    const r = sensor.yakalama_yaricapi_m ?? 250;
    for (const [nokta, z] of [[a, olay.zaman], [b, olay.bitis ?? olay.zaman]] as const) {
      for (const kam of yakinlar(k.veri.kameralar, nokta.konum, r)) {
        if (!k.rng.sans(0.7)) continue;
        out.push(yeniKayit(k, sensor, olay, z, alanDoldur(k, sensor, olay, null, z, { kamera_kodu: kam.kod, eslesme: "var", yon }), { tip: "kamera", id: kam.kod }));
      }
    }
    return out;
  },
  guzergah(k, sensor, olay) {
    const y = olay.yolculuk!;
    const out: Kayit[] = [];
    if (sensor.alanlar.includes("durak_id")) {
      y.duraklar.forEach((id, i) => {
        const d = k.veri.durakMap.get(id)!;
        const z = ekle(olay.zaman, i === 0 ? 5 : Math.max(10, Math.round((zamanDakika(olay.bitis!) - zamanDakika(olay.zaman)) * 0.5)));
        out.push(yeniKayit(k, sensor, olay, z, alanDoldur(k, sensor, olay, null, z, { durak_id: d.id, durak_adi: d.ad }), { tip: d.tip, id: d.id }));
      });
    }
    if (sensor.alanlar.includes("gecis_id")) {
      for (const g of y.gecisler) {
        const gecis = k.veri.gecisMap.get(g.gecis_id)!;
        const z = ekle(olay.zaman, Math.round((zamanDakika(olay.bitis!) - zamanDakika(olay.zaman)) * 0.5));
        out.push(yeniKayit(k, sensor, olay, z, alanDoldur(k, sensor, olay, null, z, { gecis_id: gecis.id, gecis_adi: gecis.ad, yon: g.yon }), { tip: "gecis", id: gecis.id }));
      }
    }
    return out;
  },
};

/**
 * Sensörün kapsama tablosuna göre bu POI'de kayıt bırakılır mı. Karar POI başına bir kez
 * ve deterministik verilir: aynı POI dava boyunca ya kapsamdadır ya değildir.
 */
function kapsamdaMi(sensor: SensorTanimi, poi: Poi | undefined, seed: number): boolean {
  if (!sensor.kapsama || !poi) return true;
  const oran = sensor.kapsama.oranlar[poi[sensor.kapsama.alan]] ?? sensor.kapsama.varsayilan;
  if (oran >= 1) return true;
  if (oran <= 0) return false;
  return rngOlustur((seed ^ metinTohumu(`${sensor.id}:${poi.id}`)) >>> 0).sayi() < oran;
}

/** Kameranın kayıt saklama süresi, POI başına deterministik gün sayısı. */
function saklamaGunu(sensor: SensorTanimi, poi: Poi, seed: number): number | null {
  const kural = sensor.gurultu.find((g) => g.tip === "saklama_suresi_doldu");
  if (!kural) return null;
  return rngOlustur((seed ^ metinTohumu(`saklama:${sensor.id}:${poi.id}`)) >>> 0).tam(kural.gun_en_az ?? 7, kural.gun_en_cok ?? 30);
}

function olayUyar(sensor: SensorTanimi, olay: Olay): boolean {
  if (!sensor.olaylar.includes(olay.tur)) return false;
  if (sensor.roller && (!olay.rol || !sensor.roller.includes(olay.rol))) return false;
  if (sensor.modlar && (!olay.yolculuk || !sensor.modlar.includes(olay.yolculuk.mod))) return false;
  if (sensor.telefon_gerekir && !olay.telefon_acik) return false;
  if (sensor.odeme_gerekir && olay.odeme !== sensor.odeme_gerekir) return false;
  if (sensor.kapsam.tip === "pencere_gun" && olay.zaman.gun <= BUGUN - (sensor.kapsam.gun ?? 14)) return false;
  return true;
}

/** Gürültü kuralları, tipine göre genel uygulanır. */
function gurultuUygula(k: KayitBaglami, sensor: SensorTanimi, kayitlar: Kayit[]): Kayit[] {
  const rng = k.rng.dal(`gurultu:${sensor.id}`);
  const sans = (kural: { olasilik?: number }) => rng.sans(kural.olasilik ?? 0);
  let out = kayitlar;
  for (const kural of sensor.gurultu) {
    switch (kural.tip) {
      case "eski_adres":
      case "baskasinin_aboneligi": {
        if (!out.length || !sans(kural)) break;
        // Adres başka bir POI'ye kayar. Nüfus kaydında bu adres gizli gerçeğe de yazılır.
        const sahte = k.kayitliAdres ?? rng.sec(k.veri.kategoriye.get("market")!);
        if (kural.tip === "eski_adres") k.kayitliAdres = sahte;
        const eski = out[0];
        const alanlar: Kayit["alanlar"] = { ...eski.alanlar };
        if ("ilce" in alanlar) alanlar.ilce = sahte.ilce;
        if ("mahalle" in alanlar) alanlar.mahalle = sahte.mahalle;
        if ("adres_poi" in alanlar) alanlar.adres_poi = sahte.id;
        const geometri: GeometriRef | null = eski.geometri ? (eski.geometri.tip === "poi" ? { tip: "poi", id: sahte.id } : sahte.mahalle ? { tip: "mahalle", id: sahte.mahalle } : null) : null;
        out = [yeniKayit(k, sensor, null, eski.zaman, alanlar, geometri, kural.tip)];
        break;
      }
      case "adas": {
        const ekler: Kayit[] = [];
        for (const kayit of out) {
          if (!sans(kural)) continue;
          const kategori = String(kayit.alanlar.kategori ?? k.veri.poiMap.get(String(kayit.alanlar.poi_id))?.kategori ?? "market");
          const sahte = rng.sec(k.veri.kategoriye.get(kategori) ?? k.veri.poiler);
          const z = zaman(rng.tam(1, BUGUN), rng.tam(9, 21), rng.tam(0, 59));
          const alanlar: Kayit["alanlar"] = { ...kayit.alanlar, poi_id: sahte.id, gun: z.gun, saat: `${String(z.saat).padStart(2, "0")}:${String(z.dakika).padStart(2, "0")}` };
          if ("kategori" in alanlar) alanlar.kategori = sahte.kategori;
          ekler.push(yeniKayit(k, sensor, null, z, alanlar, { tip: "poi", id: sahte.id }, "adas"));
        }
        out = [...out, ...ekler];
        break;
      }
      case "komsu_hucre": {
        out = out.map((kayit) => {
          if (!sans(kural)) return kayit;
          const h = k.veri.hucreMap.get(String(kayit.alanlar.hucre_kodu));
          if (!h || !h.komsular.length) return kayit;
          const komsu = rng.sec(h.komsular);
          return yeniKayit(k, sensor, null, kayit.zaman, { ...kayit.alanlar, hucre_kodu: komsu }, { tip: "hucre", id: komsu }, "komsu_hucre");
        });
        break;
      }
      case "sahte_eslesme": {
        const ekler: Kayit[] = [];
        for (const kayit of out) {
          if (!sans(kural)) continue;
          const kam = rng.sec(k.veri.kameralar);
          ekler.push(yeniKayit(k, sensor, null, kayit.zaman, { ...kayit.alanlar, kamera_kodu: kam.kod, yon: rng.sec(PUSULA) }, { tip: "kamera", id: kam.kod }, "sahte_eslesme"));
        }
        out = [...out, ...ekler];
        break;
      }
      case "saklama_suresi_doldu": {
        // Kaydın POI'sine ait saklama süresi geçtiyse içerik silinir, eşleşme bilgisi kalmaz.
        out = out.map((kayit) => {
          const poi = k.veri.poiMap.get(String(kayit.alanlar.poi_id));
          if (!poi) return kayit;
          const gun = saklamaGunu(sensor, poi, k.seed);
          if (gun === null || BUGUN - kayit.zaman.gun <= gun) return kayit;
          return yeniKayit(k, sensor, null, kayit.zaman, { ...kayit.alanlar, eslesme: "silinmiş", saat: "bilinmiyor", yon: null }, null, "saklama_suresi_doldu");
        });
        break;
      }
      case "bulanik_goruntu": {
        out = out.map((kayit) => {
          if (kayit.gurultu !== null || !sans(kural)) return kayit;
          const s = Number(String(kayit.alanlar.saat).slice(0, 2));
          const dilim = s < 6 ? "gece" : s < 12 ? "sabah" : s < 18 ? "öğleden sonra" : "akşam";
          return yeniKayit(k, sensor, null, kayit.zaman, { ...kayit.alanlar, saat: dilim, yon: null }, kayit.geometri, "bulanik_goruntu");
        });
        break;
      }
      case "gecikmeli_kayit": {
        out = out.map((kayit) => {
          if (!sans(kural)) return kayit;
          const z = ekle(kayit.zaman, rng.tam(60, 180));
          if (z.gun > BUGUN) return kayit;
          return yeniKayit(k, sensor, null, z, { ...kayit.alanlar, gun: z.gun, saat: `${String(z.saat).padStart(2, "0")}:${String(z.dakika).padStart(2, "0")}` }, kayit.geometri, "gecikmeli_kayit");
        });
        break;
      }
    }
  }
  return out;
}

function kayitlariTuret(veri: Veri, rng: Rng, model: HayatModeli, olaylar: Olay[], suAn: Zaman, katalog: SensorKatalogu, seed: number): { kayitlar: Kayit[]; kayitliAdres: Poi | null } {
  const k: KayitBaglami = { veri, rng, model, suAn, sayac: 0, kayitliAdres: null, seed };
  const sensorKayitlari = new Map<string, Kayit[]>();
  const sensorMap = new Map(katalog.sensorler.map((s) => [s.id, s]));

  // Birinci geçiş: olaylardan doğrudan türeyen sensörler.
  for (const sensor of katalog.sensorler) {
    if (sensor.birlesik) continue;
    if (sensor.kapsam.tip === "son" && typeof sensor.es_varyant === "string") continue; // ikinci geçişte türetilir
    const isleyici = ISLEYICILER[sensor.ayak_izi];
    let kayitlar: Kayit[] = [];
    const sensorRng = rng.dal(`sensor:${sensor.id}`);
    const kk: KayitBaglami = { ...k, rng: sensorRng };
    for (const olay of olaylar) {
      if (!olayUyar(sensor, olay)) continue;
      if (!sensorRng.sans(sensor.yakalama_olasiligi)) continue;
      kayitlar.push(...isleyici(kk, sensor, olay));
      k.sayac = kk.sayac;
    }
    if (sensor.kapsam.tip === "sabit") kayitlar = kayitlar.slice(0, 1);
    if (sensor.kapsam.tip === "son") kayitlar = kayitlar.length ? [kayitlar.reduce((a, b) => (zamanDakika(b.zaman) >= zamanDakika(a.zaman) ? b : a))] : [];
    kayitlar = gurultuUygula(kk, sensor, kayitlar);
    k.sayac = kk.sayac;
    k.kayitliAdres = kk.kayitliAdres;
    sensorKayitlari.set(sensor.id, kayitlar);
  }
  // İkinci geçiş: dar "son" varyantlar ve birleşik dökümler eş varyantlarından kopyalanır.
  for (const sensor of katalog.sensorler) {
    if (sensor.kapsam.tip === "son" && typeof sensor.es_varyant === "string" && !sensor.birlesik) {
      const kaynak = sensorKayitlari.get(sensor.es_varyant) ?? [];
      const son = kaynak.length ? kaynak.reduce((a, b) => (zamanDakika(b.zaman) >= zamanDakika(a.zaman) ? b : a)) : null;
      sensorKayitlari.set(sensor.id, son ? [{ ...son, id: `K${String(++k.sayac).padStart(4, "0")}`, sensor_id: sensor.id }] : []);
    }
    if (sensor.birlesik) {
      const kopya: Kayit[] = [];
      for (const kaynakId of sensor.birlesik) {
        for (const kayit of sensorKayitlari.get(kaynakId) ?? []) {
          const alanlar: Kayit["alanlar"] = {};
          for (const alan of sensor.alanlar) alanlar[alan] = alan === "kaynak_sensor" ? kaynakId : (kayit.alanlar[alan] ?? (alan === "kategori" ? (k.veri.poiMap.get(String(kayit.alanlar.poi_id))?.kategori ?? null) : null));
          kopya.push({ ...kayit, id: `K${String(++k.sayac).padStart(4, "0")}`, sensor_id: sensor.id, alanlar });
        }
      }
      sensorKayitlari.set(sensor.id, kopya);
    }
  }
  const kayitlar = [...sensorMap.keys()].flatMap((id) => sensorKayitlari.get(id) ?? []);
  return { kayitlar, kayitliAdres: k.kayitliAdres };
}

// ---- Adalet kuralı --------------------------------------------------------------------------------

/** Şu anki konumun geçmiş kayıtlarda en az bir bağı var mı: aynı POI, aynı hücre, 300 m içinde kamera veya durak. */
export function bagVar(dava: Dava, veri: Veri): boolean {
  const su = dava.gercek.su_anki_konum;
  for (const k of dava.kayitlar) {
    if (k.gurultu !== null || !k.geometri) continue;
    const g = k.geometri;
    if (g.tip === "poi" && g.id === su.poi_id) return true;
    if (g.tip === "hucre" && g.id === su.hucre_kodu) return true;
    if (g.tip === "mahalle" && su.mahalle && g.id === su.mahalle) return true;
    if (g.tip === "kamera") { const kam = veri.kameraMap.get(g.id); if (kam && mesafeM(kam.konum, su.konum) <= 300) return true; }
    if (g.tip === "durak" || g.tip === "istasyon") { const d = veri.durakMap.get(g.id); if (d && mesafeM(d.konum, su.konum) <= 300) return true; }
  }
  return false;
}

// ---- Profil --------------------------------------------------------------------------------------------

function profilKur(veri: Veri, rng: Rng, model: HayatModeli): HedefProfili {
  const ad = rng.sec(veri.isimler.adlar), soyad = rng.sec(veri.isimler.soyadlar);
  const yas = rng.tam(22, 65);
  const parcalar: string[] = [];
  const ilceDogru = rng.sans(0.7);
  parcalar.push(`${ilceDogru ? model.ev.ilce : rng.sec(veri.ilceler)} tarafında oturduğu söyleniyor.`);
  if (rng.sans(0.6)) parcalar.push(rng.sans(0.75) ? `İşi ${model.is.kategori.replace("_", " ")} ile ilgili.` : `İşi ${rng.sec([...veri.kategoriye.keys()]).replace("_", " ")} ile ilgili olabilir.`);
  if (rng.sans(0.5)) parcalar.push(rng.sans(0.8) === model.arac_var ? "Aracı olduğu belirtiliyor." : "Aracı olmadığı belirtiliyor.");
  return { ad, soyad, yas, ihbar_notu: parcalar.join(" ") };
}

// ---- Ana giriş -----------------------------------------------------------------------------------------

export function davaUret(seed: number, zorluk: Zorluk, veri: Veri, katalog: SensorKatalogu): Dava {
  const rng = rngOlustur((seed ^ metinTohumu(`${zorluk}:${URETICI_SURUMU}`)) >>> 0);
  const model = hayatModeliKur(veri, rng.dal("model"));
  const rutin = rutinKur(veri, rng.dal("rutin"), model, zorluk);
  const { kayitlar, kayitliAdres } = kayitlariTuret(veri, rng.dal("kayit"), model, rutin.olaylar, rutin.suAn, katalog, seed);

  const suAnkiYer: Yer = rutin.hedefRol === "ev" ? model.ev : rutin.hedefRol === "is" ? model.is : rutin.hedefRol === "ucuncu" ? model.ucuncu : rutin.rutinDisi!;
  // Şu anı kapsayan konum olayı gerçekten hedef yerde mi (plan sapması kontrolü).
  const kapsayan = rutin.olaylar.find((o) => o.tur === "konum" && zamanDakika(o.zaman) <= zamanDakika(rutin.suAn) && o.bitis && zamanDakika(o.bitis) >= zamanDakika(rutin.suAn));
  if (!kapsayan || kapsayan.yer_poi_id !== suAnkiYer.poi_id) throw new UretimReddi("su_an_uyusmuyor");

  const gercek: GizliGercek = {
    ev: model.ev, is: model.is, ucuncu: model.ucuncu, ulasim: model.ulasim, odeme: model.odeme, telefon: model.telefon,
    arac_var: model.arac_var, plaka: model.plaka, spor_salonu_uyesi: model.sporSalonuUyesi, kayitli_adres_poi_id: kayitliAdres?.id ?? null,
    su_anki_konum: { ...suAnkiYer }, su_anki_zaman: rutin.suAn,
  };
  const sensorBasina: Record<string, number> = {};
  for (const k of kayitlar) sensorBasina[k.sensor_id] = (sensorBasina[k.sensor_id] ?? 0) + 1;

  const dava: Dava = {
    surum: 1, kaynak: "uretici", uretici_surumu: URETICI_SURUMU, seed, zorluk,
    profil: profilKur(veri, rng.dal("profil"), model),
    gercek, olaylar: rutin.olaylar, kayitlar,
    par: { deger: 0, baslangic_aday: veri.poiler.length, yol: [] },
    ozet: { toplam_kayit: kayitlar.length, gurultu_kayit: kayitlar.filter((k) => k.gurultu !== null).length, sensor_basina: sensorBasina },
  };
  if (!bagVar(dava, veri)) throw new UretimReddi("bag_yok");
  return dava;
}

// Ham verileri süzer: ilçe ve mahalle atar, yakın noktaları birleştirir, ilçelere dengeli
// dağıtır ve yaklaşık 1.500 POI seçer. Çıktılar data/processed altına yazılır.
//
// Kullanım: node scripts/suz.mjs
//
// Çıktılar:
//   data/processed/poi_istanbul.geojson         seçilmiş ~1.500 nokta (kategori, ad, ilçe, mahalle)
//   data/processed/istasyonlar_istanbul.geojson  mevcut raylı sistem istasyonları (İBB)
//   data/processed/duraklar_istanbul.geojson     seyreltilmiş İETT durakları (İBB)
//   data/processed/ilceler_istanbul.geojson      ilçe sınırları (sadeleştirilmiş, OSM)
//   data/processed/mahalleler_istanbul.geojson   mahalle sınırları (sadeleştirilmiş, OSM)
//   data/processed/ozet.json                     sayılar
//
// Deterministiktir: aynı ham veri ve aynı tohum her zaman aynı çıktıyı verir.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const TOHUM = 20260919;
const HAM = "data/raw";
const CIKTI = "data/processed";

// ---- Kategori kotaları. Toplam 1.500. Değiştirmek için yalnızca bu tabloya dokunulur.
const KOTA = {
  market: 260,
  eczane: 200,
  atm: 160,
  doviz: 50,
  benzinlik: 100,
  kargo: 90,
  cami: 220,
  kahvehane: 120,
  spor_salonu: 80,
  otopark: 220,
};
const DURAK_KOTA = 600;

// Aynı kategoride bu mesafeden yakın iki nokta tek noktaya birleşir (metre).
const BIRLESTIRME_MESAFESI = 100;
// İlçe payı: bu oran eşit paylaşılır, kalanı ilçenin ham nokta yoğunluğuna göre dağıtılır.
const ESIT_PAY_ORANI = 0.4;

// ---- Yardımcılar (ortak kütüphaneden) -------------------------------------------
import { mulberry32, karistir as karistirOrtak, mesafeM, M_PER_DEG_LAT, M_PER_DEG_LON, bolgeHazirla, bolgeBul, sadelestir, yakinlariBirlestir, ilceKotalari as ilceKotalariOrtak, yayilmisSec as yayilmisSecOrtak, cokgenAlanM2 } from "./lib/cografya.mjs";

const rastgele = mulberry32(TOHUM);
const karistir = (dizi) => karistirOrtak(dizi, rastgele);
const ilceKotalari = (gruplar, kota, adlar) => ilceKotalariOrtak(gruplar, kota, adlar, ESIT_PAY_ORANI);
const yayilmisSec = (adaylar, kota, alan) => yayilmisSecOrtak(adaylar, kota, alan, rastgele);

function oku(dosya) {
  return JSON.parse(readFileSync(`${HAM}/${dosya}`, "utf8"));
}

// ---- Ham verileri yükle --------------------------------------------------------

const ilceler = bolgeHazirla(oku("osm_ilce_siniri_istanbul.geojson"));
const mahalleler = bolgeHazirla(oku("osm_mahalle_siniri_istanbul.geojson"));
const ilceAlan = new Map(ilceler.map((i) => [i.ad, cokgenAlanM2(i.cokgenler)]));
const ilceAdlari = ilceler.map((i) => i.ad).sort();

function nokta(k, kategori, ad, kaynak, ekstra = {}) {
  return { k, kategori, ad: ad || null, kaynak, ...ekstra };
}

const adaylar = {};
const ozet = { kategoriler: {}, ilceler: {}, atilan_disarida: 0 };

// OSM kategorileri
for (const kat of Object.keys(KOTA)) {
  if (kat === "otopark") continue;
  const fc = oku(`osm_${kat}_istanbul.geojson`);
  let liste = fc.features.map((f) => nokta(f.geometry.coordinates, kat, f.properties.ad, "osm", { osm_id: f.properties.osm_id }));
  if (kat === "kahvehane") {
    // OSM'de kahvehane etiketi yok, "cafe" hem kahvehane hem modern kafe. Önce ada göre ayır.
    const desen = /kıraathane|kiraathane|kahvehane|kahve|çay|cay evi|dernek|okey/i;
    const gercek = liste.filter((n) => n.ad && desen.test(n.ad));
    const digerAdli = liste.filter((n) => n.ad && !desen.test(n.ad));
    ozet.kahvehane_isim_eslesen = gercek.length;
    liste = [...gercek, ...karistir(digerAdli).slice(0, Math.max(0, KOTA.kahvehane * 2 - gercek.length))];
  }
  adaylar[kat] = liste;
}

// Otopark: İSPARK (İBB) + adı olan OSM otoparkları
{
  const satirlar = readFileSync(`${HAM}/ibb_ispark_otoparklari.csv`, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).slice(1);
  const ispark = [];
  for (const s of satirlar) {
    const p = s.split(",");
    if (p.length < 9) continue;
    const lat = parseFloat(p[p.length - 1]), lon = parseFloat(p[p.length - 2]);
    const tur = p[p.length - 6];
    if (!isFinite(lat) || !isFinite(lon)) continue;
    if (/TAKSİ|MİNİBÜS/i.test(tur)) continue;
    ispark.push(nokta([lon, lat], "otopark", p[0], "ibb_ispark", { tur, kapasite: parseInt(p[p.length - 5]) || null }));
  }
  const osmAdli = oku("osm_otopark_istanbul.geojson").features
    .filter((f) => f.properties.ad)
    .map((f) => nokta(f.geometry.coordinates, "otopark", f.properties.ad, "osm", { osm_id: f.properties.osm_id }));
  ozet.otopark_ispark = ispark.length;
  ozet.otopark_osm_adli = osmAdli.length;
  adaylar.otopark = [...ispark, ...osmAdli];
}

// Raylı sistem istasyonları: yalnızca mevcut hatlar
const istasyonlar = oku("ibb_rayli_sistem_istasyonlari.geojson").features
  .filter((f) => /Mevcut/i.test(f.properties.PROJE_ASAMA))
  .map((f) => nokta(f.geometry.coordinates, "istasyon", f.properties.ISTASYON, "ibb_rayli", { hat: f.properties.PROJE_ADI, hat_turu: f.properties.HAT_TURU }));

// İETT durakları: bozuk koordinatları düzelt ("410.191.700.005.564" -> 41.0191700005564)
function koordinatDuzelt(s) {
  s = s.trim();
  if ((s.match(/\./g) || []).length <= 1) return parseFloat(s);
  const rakam = s.replace(/\./g, "");
  return parseFloat(rakam.slice(0, 2) + "." + rakam.slice(2));
}
let duraklar = [];
{
  const satirlar = readFileSync(`${HAM}/ibb_iett_gtfs_stops.csv`, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
  const bas = satirlar[0].split(";").map((h) => h.trim());
  const iAd = bas.indexOf("stop_name"), iLat = bas.indexOf("stop_lat"), iLon = bas.indexOf("stop_lon"), iKod = bas.indexOf("stop_code");
  let bozuk = 0;
  for (const s of satirlar.slice(1)) {
    const p = s.split(";");
    const lat = koordinatDuzelt(p[iLat] ?? ""), lon = koordinatDuzelt(p[iLon] ?? "");
    if (!(lat > 40.7 && lat < 41.7 && lon > 27.9 && lon < 30.0)) { bozuk++; continue; }
    duraklar.push(nokta([lon, lat], "durak", p[iAd]?.trim(), "ibb_iett", { durak_kodu: p[iKod]?.trim() }));
  }
  ozet.durak_ham = duraklar.length;
  ozet.durak_koordinat_atilan = bozuk;
}

// ---- İlçe ve mahalle ata, dışarıda kalanları at ---------------------------------

function bolgeAta(liste) {
  const kalan = [];
  for (const n of liste) {
    n.ilce = bolgeBul(n.k, ilceler);
    if (!n.ilce) { ozet.atilan_disarida++; continue; }
    n.mahalle = bolgeBul(n.k, mahalleler);
    kalan.push(n);
  }
  return kalan;
}

// ---- POI seçimi -----------------------------------------------------------------

const secilenPOI = [];
for (const kat of Object.keys(KOTA)) {
  const ham = adaylar[kat].length;
  const birlesik = yakinlariBirlestir(adaylar[kat], BIRLESTIRME_MESAFESI);
  const icinde = bolgeAta(birlesik);
  const gruplar = new Map();
  for (const n of icinde) { if (!gruplar.has(n.ilce)) gruplar.set(n.ilce, []); gruplar.get(n.ilce).push(n); }
  const kotalar = ilceKotalari(gruplar, KOTA[kat], ilceAdlari);
  let secilen = [];
  for (const [ilce, kota] of kotalar) {
    if (!kota) continue;
    secilen = secilen.concat(yayilmisSec(gruplar.get(ilce) ?? [], kota, ilceAlan.get(ilce)));
  }
  ozet.kategoriler[kat] = { ham, birlesik: birlesik.length, il_icinde: icinde.length, kota: KOTA[kat], secilen: secilen.length };
  secilenPOI.push(...secilen);
}

// İstasyonlar: hepsi (mevcut hatlar), ilçe atanır.
const istasyonSecilen = bolgeAta(yakinlariBirlestir(istasyonlar, 30));
// Duraklar: iki yön birleşir (aynı ad, 150 m), sonra ilçelere dengeli seyreltilir.
{
  const adaGore = new Map();
  for (const d of duraklar) { const a = d.ad ?? ""; if (!adaGore.has(a)) adaGore.set(a, []); adaGore.get(a).push(d); }
  let tekYon = [];
  for (const grup of adaGore.values()) tekYon.push(...yakinlariBirlestir(grup, 150));
  ozet.durak_tek_yon = tekYon.length;
  const icinde = bolgeAta(tekYon);
  const gruplar = new Map();
  for (const n of icinde) { if (!gruplar.has(n.ilce)) gruplar.set(n.ilce, []); gruplar.get(n.ilce).push(n); }
  const kotalar = ilceKotalari(gruplar, DURAK_KOTA, ilceAdlari);
  duraklar = [];
  for (const [ilce, kota] of kotalar) if (kota) duraklar.push(...yayilmisSec(gruplar.get(ilce) ?? [], kota, ilceAlan.get(ilce)));
}

// ---- Yaz ----------------------------------------------------------------------------

function fcYap(liste, onek) {
  let sayac = 0;
  return {
    type: "FeatureCollection",
    kaynak: "OpenStreetMap katkıcıları (ODbL) ve İBB Açık Veri Portalı (İBB Açık Veri Lisansı)",
    uretim_tarihi: new Date().toISOString().slice(0, 10),
    tohum: TOHUM,
    features: liste.map((n) => {
      const { k, ...ozellik } = n;
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [+k[0].toFixed(6), +k[1].toFixed(6)] },
        properties: { id: `${onek}${String(++sayac).padStart(4, "0")}`, ...ozellik },
      };
    }),
  };
}

mkdirSync(CIKTI, { recursive: true });
secilenPOI.sort((a, b) => a.kategori.localeCompare(b.kategori) || a.ilce.localeCompare(b.ilce));
writeFileSync(`${CIKTI}/poi_istanbul.geojson`, JSON.stringify(fcYap(secilenPOI, "P")));
writeFileSync(`${CIKTI}/istasyonlar_istanbul.geojson`, JSON.stringify(fcYap(istasyonSecilen, "R")));
writeFileSync(`${CIKTI}/duraklar_istanbul.geojson`, JSON.stringify(fcYap(duraklar, "D")));
writeFileSync(`${CIKTI}/ilceler_istanbul.geojson`, JSON.stringify(sadelestir(oku("osm_ilce_siniri_istanbul.geojson"), 0.0003)));
writeFileSync(`${CIKTI}/mahalleler_istanbul.geojson`, JSON.stringify(sadelestir(oku("osm_mahalle_siniri_istanbul.geojson"), 0.0002)));

for (const n of secilenPOI) ozet.ilceler[n.ilce] = (ozet.ilceler[n.ilce] || 0) + 1;
ozet.poi_toplam = secilenPOI.length;
ozet.istasyon = istasyonSecilen.length;
ozet.durak = duraklar.length;
ozet.mahalle_atanamayan = secilenPOI.filter((n) => !n.mahalle).length;
writeFileSync(`${CIKTI}/ozet.json`, JSON.stringify(ozet, null, 2));

// ---- Ekrana özet -------------------------------------------------------------------
console.log("| Kategori | Ham | Birleşik | İl içinde | Kota | Seçilen |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const [k, v] of Object.entries(ozet.kategoriler)) console.log(`| ${k} | ${v.ham} | ${v.birlesik} | ${v.il_icinde} | ${v.kota} | ${v.secilen} |`);
console.log(`| TOPLAM POI | | | | ${Object.values(KOTA).reduce((a, b) => a + b, 0)} | ${ozet.poi_toplam} |`);
console.log(`\nİstasyon (mevcut hatlar): ${ozet.istasyon}`);
console.log(`Durak: ham ${ozet.durak_ham}, koordinatı bozuk atılan ${ozet.durak_koordinat_atilan}, tek yön ${ozet.durak_tek_yon}, seçilen ${ozet.durak}`);
console.log(`İl sınırı dışında atılan: ${ozet.atilan_disarida}, mahallesi bulunamayan POI: ${ozet.mahalle_atanamayan}`);
console.log(`Kahvehane isimden eşleşen: ${ozet.kahvehane_isim_eslesen}, İSPARK: ${ozet.otopark_ispark}, adlı OSM otopark: ${ozet.otopark_osm_adli}`);
console.log("\n| İlçe | POI |");
console.log("| --- | ---: |");
for (const [i, s] of Object.entries(ozet.ilceler).sort((a, b) => b[1] - a[1])) console.log(`| ${i} | ${s} |`);

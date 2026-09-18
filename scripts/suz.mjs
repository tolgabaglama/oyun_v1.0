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

// ---- Yardımcılar -------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rastgele = mulberry32(TOHUM);

function karistir(dizi) {
  const d = dizi.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

// İstanbul enleminde yaklaşık metre dönüşümü.
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((41.0 * Math.PI) / 180);
function mesafeM(a, b) {
  const dx = (a[0] - b[0]) * M_PER_DEG_LON;
  const dy = (a[1] - b[1]) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

function oku(dosya) {
  return JSON.parse(readFileSync(`${HAM}/${dosya}`, "utf8"));
}

// ---- Nokta çokgen içinde mi (ışın yöntemi) ------------------------------------

function halkaIcinde(nokta, halka) {
  const [x, y] = nokta;
  let icinde = false;
  for (let i = 0, j = halka.length - 1; i < halka.length; j = i++) {
    const [xi, yi] = halka[i];
    const [xj, yj] = halka[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) icinde = !icinde;
  }
  return icinde;
}

function cokgenIcinde(nokta, cokgen) {
  if (!halkaIcinde(nokta, cokgen[0])) return false;
  for (let i = 1; i < cokgen.length; i++) if (halkaIcinde(nokta, cokgen[i])) return false;
  return true;
}

function bbox(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const gez = (k) => { for (const [x, y] of k) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } };
  const cokgenler = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const c of cokgenler) for (const halka of c) gez(halka);
  return [minX, minY, maxX, maxY];
}

function bolgeHazirla(fc) {
  return fc.features.map((f) => ({
    ad: f.properties.ad,
    geom: f.geometry,
    kutu: bbox(f.geometry),
    cokgenler: f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates,
  }));
}

function bolgeBul(nokta, bolgeler) {
  const [x, y] = nokta;
  for (const b of bolgeler) {
    const [a, c, d, e] = b.kutu;
    if (x < a || x > d || y < c || y > e) continue;
    for (const cg of b.cokgenler) if (cokgenIcinde(nokta, cg)) return b.ad;
  }
  return null;
}

// ---- Çokgen sadeleştirme (Douglas Peucker), harita için ------------------------

function dikUzaklik(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const px = a[0] + t * dx, py = a[1] + t * dy;
  return Math.hypot(p[0] - px, p[1] - py);
}
function dp(noktalar, tol) {
  if (noktalar.length <= 2) return noktalar;
  let maxD = 0, idx = 0;
  for (let i = 1; i < noktalar.length - 1; i++) {
    const d = dikUzaklik(noktalar[i], noktalar[0], noktalar[noktalar.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > tol) return [...dp(noktalar.slice(0, idx + 1), tol).slice(0, -1), ...dp(noktalar.slice(idx), tol)];
  return [noktalar[0], noktalar[noktalar.length - 1]];
}
function sadelestir(fc, tol) {
  return {
    ...fc,
    features: fc.features.map((f) => {
      const g = f.geometry;
      const halkaSadele = (h) => { const s = dp(h, tol); return s.length >= 4 ? s : h; };
      const geometry = g.type === "Polygon"
        ? { type: "Polygon", coordinates: g.coordinates.map(halkaSadele) }
        : { type: "MultiPolygon", coordinates: g.coordinates.map((c) => c.map(halkaSadele)) };
      return { type: "Feature", geometry, properties: f.properties };
    }),
  };
}

// ---- Aynı kategoride yakın noktaları birleştir --------------------------------

function yakinlariBirlestir(noktalar, mesafe) {
  // Adı olanlar önce gelir, böylece birleşmede adlı nokta hayatta kalır.
  const sirali = noktalar.slice().sort((a, b) => (b.ad ? 1 : 0) - (a.ad ? 1 : 0));
  const hucre = mesafe / M_PER_DEG_LAT;
  const izgara = new Map();
  const anahtar = (k) => `${Math.floor(k[0] / hucre)}:${Math.floor(k[1] / hucre)}`;
  const kalan = [];
  for (const n of sirali) {
    const [cx, cy] = [Math.floor(n.k[0] / hucre), Math.floor(n.k[1] / hucre)];
    let yakinVar = false;
    dis: for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const komsular = izgara.get(`${cx + dx}:${cy + dy}`);
      if (!komsular) continue;
      for (const m of komsular) if (mesafeM(n.k, m.k) < mesafe) { yakinVar = true; break dis; }
    }
    if (yakinVar) continue;
    const a = anahtar(n.k);
    if (!izgara.has(a)) izgara.set(a, []);
    izgara.get(a).push(n);
    kalan.push(n);
  }
  return kalan;
}

// ---- İlçelere dengeli dağıt ve yayılmış seç ----------------------------------

function ilceKotalari(gruplar, toplamKota, ilceAdlari) {
  const N = [...gruplar.values()].reduce((s, g) => s + g.length, 0);
  const n = ilceAdlari.length;
  // Ham pay: eşit kısım + yoğunluk kısmı. Mevcut sayıyla sınırlanır.
  const ham = ilceAdlari.map((ad) => {
    const mevcut = gruplar.get(ad)?.length ?? 0;
    const pay = toplamKota * (ESIT_PAY_ORANI / n + (1 - ESIT_PAY_ORANI) * (mevcut / N));
    return { ad, mevcut, pay: Math.min(pay, mevcut) };
  });
  // Sınırdan artan kotayı, hâlâ yeri olan ilçelere yoğunlukla orantılı dağıt (birkaç tur).
  for (let tur = 0; tur < 5; tur++) {
    const dagitilan = ham.reduce((s, h) => s + h.pay, 0);
    let artan = toplamKota - dagitilan;
    if (artan < 0.5) break;
    const yeriOlan = ham.filter((h) => h.pay < h.mevcut);
    const agirlik = yeriOlan.reduce((s, h) => s + h.mevcut, 0);
    if (!agirlik) break;
    for (const h of yeriOlan) h.pay = Math.min(h.mevcut, h.pay + (artan * h.mevcut) / agirlik);
  }
  // En büyük kalan yöntemiyle tam sayıya yuvarla.
  const taban = ham.map((h) => ({ ...h, tam: Math.floor(h.pay), kalan: h.pay - Math.floor(h.pay) }));
  let eksik = Math.min(toplamKota, ham.reduce((s, h) => s + Math.floor(Math.min(h.pay, h.mevcut)), 0) + 0) ;
  eksik = toplamKota - taban.reduce((s, h) => s + h.tam, 0);
  taban.sort((a, b) => b.kalan - a.kalan);
  for (const h of taban) { if (eksik <= 0) break; if (h.tam < h.mevcut) { h.tam++; eksik--; } }
  return new Map(taban.map((h) => [h.ad, h.tam]));
}

function yayilmisSec(adaylar, kota, ilceAlanM2) {
  if (kota >= adaylar.length) return adaylar;
  // Hedef aralık: ilçe alanı kotaya bölünür, karekökünün yarısı asgari mesafe olur.
  const asgari = 0.5 * Math.sqrt(ilceAlanM2 / kota);
  const sira = karistir(adaylar).sort((a, b) => (b.ad ? 1 : 0) - (a.ad ? 1 : 0));
  const secilen = [];
  const artan = [];
  for (const a of sira) {
    if (secilen.length >= kota) break;
    if (secilen.every((s) => mesafeM(s.k, a.k) >= asgari)) secilen.push(a); else artan.push(a);
  }
  for (const a of artan) { if (secilen.length >= kota) break; secilen.push(a); }
  return secilen;
}

function cokgenAlanM2(cokgenler) {
  let alan = 0;
  for (const c of cokgenler) {
    const h = c[0];
    let s = 0;
    for (let i = 0, j = h.length - 1; i < h.length; j = i++) s += (h[j][0] * M_PER_DEG_LON) * (h[i][1] * M_PER_DEG_LAT) - (h[i][0] * M_PER_DEG_LON) * (h[j][1] * M_PER_DEG_LAT);
    alan += Math.abs(s) / 2;
  }
  return alan;
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

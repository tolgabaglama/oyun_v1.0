// Kurgusal ŞEHİRGÖZ kameraları üretir. Gerçek kamera konumu KULLANILMAZ; kameralar
// kavşak, meydan, durak ve okul girişlerine kurallı yerleştirilir, görüş yönü en yakın
// ana yolun doğrultusundan hesaplanır.
//
// Kullanım: node scripts/kamera_uret.mjs
// Girdi:  data/raw/osm_yollar_istanbul.geojson, osm_trafik_isigi_*, osm_meydan_*, osm_okul_*,
//         data/processed/duraklar_istanbul.geojson, istasyonlar_istanbul.geojson, ilçe ve mahalle sınırları
// Çıktı:  data/processed/kameralar_istanbul.geojson        (nokta, bakış açısı ve koni parametreleri)
//         data/processed/kamera_konileri_istanbul.geojson  (harita için koni çokgenleri)
//
// Deterministiktir (sabit tohum).

import { readFileSync, writeFileSync } from "node:fs";
import { mulberry32, mesafeM, M_PER_DEG_LAT, M_PER_DEG_LON, bolgeHazirla, bolgeBul, yakinlariBirlestir, ilceKotalari, yayilmisSec, cokgenAlanM2 } from "./lib/cografya.mjs";

const TOHUM = 20260919 + 1;
const rastgele = mulberry32(TOHUM);
const HAM = "data/raw", ISLENMIS = "data/processed";
const oku = (yol) => JSON.parse(readFileSync(yol, "utf8"));

// ---- Kamera türleri. Kota toplamı 400. Koni açısı derece, menzil metre.
const TURLER = {
  kavsak: { ad: "Kavşak",        kota: 170, koni: 70, menzil: 120, yolAramaM: 0   },
  durak:  { ad: "Durak",         kota: 100, koni: 50, menzil: 80,  yolAramaM: 60  },
  okul:   { ad: "Okul girişi",   kota: 90,  koni: 60, menzil: 80,  yolAramaM: 150 },
  meydan: { ad: "Meydan",        kota: 40,  koni: 90, menzil: 150, yolAramaM: 200 },
};
const BIRLESTIRME_MESAFESI = 80; // aynı türde bu mesafeden yakın adaylar tek kamera olur
const YOL_SINIF_PUAN = { trunk: 3, primary: 2, secondary: 1 };

// ---- Yollar ve segment ızgarası ---------------------------------------------------------

const yollar = oku(`${HAM}/osm_yollar_istanbul.geojson`).features;
const segmentler = []; // { a, b, yol }
const dugumKullanim = new Map(); // düğüm kimliği -> [{ yol, i }]
for (const y of yollar) {
  const k = y.geometry.coordinates;
  for (let i = 0; i < k.length - 1; i++) segmentler.push({ a: k[i], b: k[i + 1], yol: y });
  const d = y.properties.dugumler ?? [];
  for (let i = 0; i < d.length; i++) {
    if (!dugumKullanim.has(d[i])) dugumKullanim.set(d[i], []);
    dugumKullanim.get(d[i]).push({ yol: y, i });
  }
}

const HUCRE = 200 / M_PER_DEG_LAT; // ~200 m
const izgara = new Map();
const hucreAnahtar = (x, y) => `${Math.floor(x / HUCRE)}:${Math.floor(y / HUCRE)}`;
for (const s of segmentler) {
  const xs = [s.a[0], s.b[0]], ys = [s.a[1], s.b[1]];
  const x0 = Math.floor(Math.min(...xs) / HUCRE), x1 = Math.floor(Math.max(...xs) / HUCRE);
  const y0 = Math.floor(Math.min(...ys) / HUCRE), y1 = Math.floor(Math.max(...ys) / HUCRE);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const a = `${x}:${y}`;
    if (!izgara.has(a)) izgara.set(a, []);
    izgara.get(a).push(s);
  }
}

function noktaSegmentUzaklik(p, s) {
  // Metre cinsinden düzlem yaklaşımı; ayak noktasını da döndürür.
  const ax = s.a[0] * M_PER_DEG_LON, ay = s.a[1] * M_PER_DEG_LAT;
  const bx = s.b[0] * M_PER_DEG_LON, by = s.b[1] * M_PER_DEG_LAT;
  const px = p[0] * M_PER_DEG_LON, py = p[1] * M_PER_DEG_LAT;
  const dx = bx - ax, dy = by - ay;
  const uz2 = dx * dx + dy * dy;
  let t = uz2 ? ((px - ax) * dx + (py - ay) * dy) / uz2 : 0;
  t = Math.max(0, Math.min(1, t));
  const fx = ax + t * dx, fy = ay + t * dy;
  return { uzaklik: Math.hypot(px - fx, py - fy), ayak: [fx / M_PER_DEG_LON, fy / M_PER_DEG_LAT] };
}

function enYakinSegment(p, azamiM) {
  const cx = Math.floor(p[0] / HUCRE), cy = Math.floor(p[1] / HUCRE);
  const yaricap = Math.ceil(azamiM / 200);
  let enIyi = null;
  for (let dx = -yaricap; dx <= yaricap; dx++) for (let dy = -yaricap; dy <= yaricap; dy++) {
    const liste = izgara.get(`${cx + dx}:${cy + dy}`);
    if (!liste) continue;
    for (const s of liste) {
      const r = noktaSegmentUzaklik(p, s);
      if (r.uzaklik <= azamiM && (!enIyi || r.uzaklik < enIyi.uzaklik)) enIyi = { ...r, segment: s };
    }
  }
  return enIyi;
}

// Kuzeyden saat yönünde derece.
function yonDerece(a, b) {
  const dx = (b[0] - a[0]) * M_PER_DEG_LON, dy = (b[1] - a[1]) * M_PER_DEG_LAT;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

// ---- Bölgeler ---------------------------------------------------------------------------

const ilceler = bolgeHazirla(oku(`${HAM}/osm_ilce_siniri_istanbul.geojson`));
const mahalleler = bolgeHazirla(oku(`${HAM}/osm_mahalle_siniri_istanbul.geojson`));
const ilceAlan = new Map(ilceler.map((i) => [i.ad, cokgenAlanM2(i.cokgenler)]));
const ilceAdlari = ilceler.map((i) => i.ad).sort();

// ---- Aday üretimi -------------------------------------------------------------------------

const adaylar = { kavsak: [], durak: [], okul: [], meydan: [] };
const ozet = {};

// Kavşak: en az üç yol kolunun birleştiği düğümler ile ana yol üzerindeki trafik ışıkları.
{
  const isikDugumleri = new Set(oku(`${HAM}/osm_trafik_isigi_istanbul.geojson`).features.map((f) => f.properties.osm_id.replace("node/", "")).map(Number));
  let derece3 = 0, isikli = 0;
  for (const [dugum, kullanimlar] of dugumKullanim) {
    // Kol sayısı: her kullanımda düğüm iç noktaysa 2 kol, uçtaysa 1 kol.
    let kol = 0;
    for (const { yol, i } of kullanimlar) kol += i === 0 || i === yol.properties.dugumler.length - 1 ? 1 : 2;
    const isik = isikDugumleri.has(dugum);
    if (kol < 3 && !isik) continue;
    // En yüksek sınıflı yol kolunun yönü kamera bakış yönü olur.
    let enIyi = null;
    for (const { yol, i } of kullanimlar) {
      const k = yol.geometry.coordinates;
      const puan = YOL_SINIF_PUAN[yol.properties.sinif] ?? 0;
      const komsu = i + 1 < k.length ? k[i + 1] : k[i - 1];
      if (!komsu) continue;
      if (!enIyi || puan > enIyi.puan) enIyi = { puan, yon: yonDerece(k[i], komsu), yolAdi: yol.properties.ad, k: k[i] };
    }
    if (!enIyi) continue;
    if (kol >= 3) derece3++; else isikli++;
    adaylar.kavsak.push({ k: enIyi.k, tur: "kavsak", yon: enIyi.yon, yol_adi: enIyi.yolAdi, isikli: isik, kol });
  }
  ozet.kavsak_aday = { derece3, yalniz_isikli: isikli };
}

// Durak: otobüs durakları ve raylı istasyonlar; kamera gelen trafiğe bakar (yol yönünün tersi).
{
  const d = oku(`${ISLENMIS}/duraklar_istanbul.geojson`).features.map((f) => ({ k: f.geometry.coordinates, ad: f.properties.ad, kaynak: "durak" }));
  const r = oku(`${ISLENMIS}/istasyonlar_istanbul.geojson`).features.map((f) => ({ k: f.geometry.coordinates, ad: f.properties.ad, kaynak: "istasyon" }));
  let yolsuz = 0;
  for (const n of [...d, ...r]) {
    const s = enYakinSegment(n.k, TURLER.durak.yolAramaM);
    if (!s) { yolsuz++; continue; }
    const yon = (yonDerece(s.segment.a, s.segment.b) + 180) % 360;
    adaylar.durak.push({ k: n.k, tur: "durak", yon, yol_adi: s.segment.yol.properties.ad, durak_adi: n.ad, durak_turu: n.kaynak });
  }
  ozet.durak_aday = { toplam: d.length + r.length, yola_uzak_atilan: yolsuz };
}

// Okul: okulun en yakın ana yola indirilen ayağı giriş sayılır, kamera yol boyunca bakar.
{
  const okullar = oku(`${HAM}/osm_okul_istanbul.geojson`).features;
  let yolsuz = 0;
  for (const f of okullar) {
    const s = enYakinSegment(f.geometry.coordinates, TURLER.okul.yolAramaM);
    if (!s) { yolsuz++; continue; }
    adaylar.okul.push({ k: s.ayak, tur: "okul", yon: yonDerece(s.segment.a, s.segment.b), yol_adi: s.segment.yol.properties.ad, okul_adi: f.properties.ad });
  }
  ozet.okul_aday = { toplam: okullar.length, yola_uzak_atilan: yolsuz };
}

// Meydan: meydan merkezine kamera, en yakın yola bakar; yol yoksa kuzeye bakar.
{
  const meydanlar = oku(`${HAM}/osm_meydan_istanbul.geojson`).features;
  for (const f of meydanlar) {
    const s = enYakinSegment(f.geometry.coordinates, TURLER.meydan.yolAramaM);
    const yon = s ? yonDerece(s.segment.a, s.segment.b) : 0;
    adaylar.meydan.push({ k: f.geometry.coordinates, tur: "meydan", yon, yol_adi: s?.segment.yol.properties.ad ?? null, meydan_adi: f.properties.ad });
  }
  ozet.meydan_aday = { toplam: meydanlar.length };
}

// ---- Seçim: birleştir, ilçe ata, dengeli kota, yayılmış seç --------------------------------

const secilen = [];
ozet.turler = {};
for (const [tur, t] of Object.entries(TURLER)) {
  const birlesik = yakinlariBirlestir(adaylar[tur].map((a) => ({ ...a, ad: a.yol_adi })), BIRLESTIRME_MESAFESI);
  const icinde = [];
  for (const a of birlesik) {
    a.ilce = bolgeBul(a.k, ilceler);
    if (!a.ilce) continue;
    a.mahalle = bolgeBul(a.k, mahalleler);
    icinde.push(a);
  }
  const gruplar = new Map();
  for (const a of icinde) { if (!gruplar.has(a.ilce)) gruplar.set(a.ilce, []); gruplar.get(a.ilce).push(a); }
  const kotalar = ilceKotalari(gruplar, t.kota, ilceAdlari, 0.4);
  let sec = [];
  for (const [ilce, kota] of kotalar) if (kota) sec = sec.concat(yayilmisSec(gruplar.get(ilce) ?? [], kota, ilceAlan.get(ilce), rastgele));
  ozet.turler[tur] = { aday: adaylar[tur].length, birlesik: birlesik.length, il_icinde: icinde.length, kota: t.kota, secilen: sec.length };
  secilen.push(...sec);
}

// ---- Koni çokgeni ve yazım ----------------------------------------------------------------

function koniCokgen(k, yon, aci, menzil) {
  const halka = [k];
  const adim = 8;
  for (let i = 0; i <= adim; i++) {
    const a = ((yon - aci / 2 + (aci * i) / adim) * Math.PI) / 180;
    halka.push([+(k[0] + (Math.sin(a) * menzil) / M_PER_DEG_LON).toFixed(6), +(k[1] + (Math.cos(a) * menzil) / M_PER_DEG_LAT).toFixed(6)]);
  }
  halka.push(k);
  return { type: "Polygon", coordinates: [halka] };
}

secilen.sort((a, b) => a.ilce.localeCompare(b.ilce) || a.tur.localeCompare(b.tur));
const ortak = { kaynak: "Kurgusal. Konumlar OpenStreetMap yol, durak, okul ve meydan verisinden kurallı türetildi (ODbL). Gerçek kamera verisi kullanılmadı.", uretim_tarihi: new Date().toISOString().slice(0, 10), tohum: TOHUM };
const noktalar = [], koniler = [];
secilen.forEach((a, i) => {
  const t = TURLER[a.tur];
  const kod = `SG-${String(i + 1).padStart(4, "0")}`;
  const { k, ad, ...ozellik } = a;
  const props = { kamera_kodu: kod, ...ozellik, yon: Math.round(a.yon), koni_acisi: t.koni, menzil_m: t.menzil };
  noktalar.push({ type: "Feature", geometry: { type: "Point", coordinates: [+k[0].toFixed(6), +k[1].toFixed(6)] }, properties: props });
  koniler.push({ type: "Feature", geometry: koniCokgen(k, a.yon, t.koni, t.menzil), properties: { kamera_kodu: kod, tur: a.tur } });
});
writeFileSync(`${ISLENMIS}/kameralar_istanbul.geojson`, JSON.stringify({ type: "FeatureCollection", ...ortak, features: noktalar }));
writeFileSync(`${ISLENMIS}/kamera_konileri_istanbul.geojson`, JSON.stringify({ type: "FeatureCollection", ...ortak, features: koniler }));

// ---- Ekrana özet ---------------------------------------------------------------------------
console.log("| Tür | Aday | Birleşik | İl içinde | Kota | Seçilen |");
console.log("| --- | ---: | ---: | ---: | ---: | ---: |");
for (const [k, v] of Object.entries(ozet.turler)) console.log(`| ${TURLER[k].ad} | ${v.aday} | ${v.birlesik} | ${v.il_icinde} | ${v.kota} | ${v.secilen} |`);
console.log(`| TOPLAM | | | | 400 | ${secilen.length} |`);
console.log("\nAday ayrıntıları:", JSON.stringify({ kavsak: ozet.kavsak_aday, durak: ozet.durak_aday, okul: ozet.okul_aday, meydan: ozet.meydan_aday }));
const ilceSay = {};
for (const a of secilen) ilceSay[a.ilce] = (ilceSay[a.ilce] || 0) + 1;
const sirali = Object.entries(ilceSay).sort((a, b) => b[1] - a[1]);
console.log(`İlçe dağılımı: en çok ${sirali[0][0]} ${sirali[0][1]}, en az ${sirali.at(-1)[0]} ${sirali.at(-1)[1]}, ilçe sayısı ${sirali.length}`);
console.log("Örnek kamera:", JSON.stringify(noktalar[0].properties));

// Kurgusal baz istasyonu hücreleri üretir. Gerçek operatör verisi KULLANILMAZ.
// Yöntem: ham POI ve durak noktaları yoğunluk göstergesi olarak alınır, il 500 m'lik
// karelere bölünür, 250 baz konumu kare yoğunluğuna göre ağırlıklı ve asgari mesafeli seçilir,
// Voronoi ile hücre çokgenleri çizilir ve il sınırına kırpılır. Yoğun yerde küçük, seyrek yerde büyük hücre çıkar.
//
// Kullanım: node scripts/baz_uret.mjs
// Çıktı: data/processed/baz_hucreleri_istanbul.geojson   (çokgen, hücre kodu, komşular, alan)
//        data/processed/baz_istasyonlari_istanbul.geojson (nokta, hücre merkezi)
//
// Deterministiktir (sabit tohum).

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { Delaunay } from "d3-delaunay";
import polygonClipping from "polygon-clipping";
import { mulberry32, M_PER_DEG_LAT, M_PER_DEG_LON, bolgeHazirla, bolgeBul, cokgenAlanM2, halkaIcinde } from "./lib/cografya.mjs";

const TOHUM = 20260919 + 2;
const rastgele = mulberry32(TOHUM);
const HAM = "data/raw", ISLENMIS = "data/processed";
const oku = (yol) => JSON.parse(readFileSync(yol, "utf8"));

const HUCRE_SAYISI = 250;
const KARE_M = 500;               // yoğunluk karesi kenarı
const TABAN_AGIRLIK = 0.04;       // boş karenin ağırlığı, kırsal kapsama için
const YOGUNLUK_USSU = 0.7;        // 1 = tam orantılı, 0.5 = çok yumuşatılmış
const ASGARI_MESAFE_YOGUN_M = 900;   // dolu karelerde iki baz arası en az mesafe
const ASGARI_MESAFE_SEYREK_M = 3000; // boş karelerde iki baz arası en az mesafe

// ---- Yoğunluk noktaları --------------------------------------------------------------------

const ilceler = bolgeHazirla(oku(`${HAM}/osm_ilce_siniri_istanbul.geojson`));
const ilceAdlari = ilceler.map((i) => i.ad);

// İl sınırı: ilçe çokgenlerinin birleşimi.
const ilCokgen = polygonClipping.union(...ilceler.map((i) => i.cokgenler));

const noktalar = [];
for (const dosya of readdirSync(HAM)) {
  if (!/^osm_.*_istanbul\.geojson$/.test(dosya) || /siniri|yollar|trafik/.test(dosya)) continue;
  for (const f of oku(`${HAM}/${dosya}`).features) if (f.geometry.type === "Point") noktalar.push(f.geometry.coordinates);
}
const poiSayisi = noktalar.length;
for (const f of oku(`${ISLENMIS}/duraklar_istanbul.geojson`).features) noktalar.push(f.geometry.coordinates);
for (const f of oku(`${ISLENMIS}/istasyonlar_istanbul.geojson`).features) noktalar.push(f.geometry.coordinates);

// ---- Yoğunluk ızgarası ve ağırlıklı site seçimi ---------------------------------------------
// İl 500 m'lik karelere bölünür. Karenin ağırlığı: (nokta sayısı)^üs + taban. Üs 1'den küçük olunca çok yoğun
// merkezlerin tüm hücreleri yutmasını engeller; taban ağırlık kırsalın boş kalmamasını sağlar.
// Siteler bu ağırlıkla ve asgari mesafe kuralıyla seçilir, sonra Voronoi çizilir.

let kutu = [Infinity, Infinity, -Infinity, -Infinity];
for (const cg of ilCokgen) for (const [x, y] of cg[0]) { kutu = [Math.min(kutu[0], x), Math.min(kutu[1], y), Math.max(kutu[2], x), Math.max(kutu[3], y)]; }
const dx = KARE_M / M_PER_DEG_LON, dy = KARE_M / M_PER_DEG_LAT;
// İl içi testi: ilçe çokgenleri kutu ön süzgeciyle hızlıdır.
const ilIcinde = (p) => bolgeBul(p, ilceler) !== null;

const kareSayim = new Map();
const anahtar = (k) => `${Math.floor((k[0] - kutu[0]) / dx)}:${Math.floor((k[1] - kutu[1]) / dy)}`;
for (const n of noktalar) kareSayim.set(anahtar(n), (kareSayim.get(anahtar(n)) || 0) + 1);

const kareler = [];
let doluKare = 0, bosKare = 0;
for (let ix = 0; ix * dx <= kutu[2] - kutu[0]; ix++) for (let iy = 0; iy * dy <= kutu[3] - kutu[1]; iy++) {
  const merkez = [kutu[0] + (ix + 0.5) * dx, kutu[1] + (iy + 0.5) * dy];
  if (!ilIcinde(merkez)) continue;
  const sayi = kareSayim.get(`${ix}:${iy}`) || 0;
  if (sayi) doluKare++; else bosKare++;
  kareler.push({ merkez, sayi, agirlik: Math.pow(sayi, YOGUNLUK_USSU) + TABAN_AGIRLIK });
}

// Ağırlıklı, tekrarsız, asgari mesafeli seçim. Yoğun karede asgari mesafe küçülür.
const siteler = [];
const uyeSayisi = [];
const havuz = kareler.slice();
let toplamAgirlik = havuz.reduce((s, k) => s + k.agirlik, 0);
let deneme = 0;
while (siteler.length < HUCRE_SAYISI && havuz.length && deneme < 20000) {
  deneme++;
  let r = rastgele() * toplamAgirlik, idx = havuz.length - 1;
  for (let i = 0; i < havuz.length; i++) { r -= havuz[i].agirlik; if (r <= 0) { idx = i; break; } }
  const aday = havuz[idx];
  const asgari = aday.sayi > 0 ? ASGARI_MESAFE_YOGUN_M : ASGARI_MESAFE_SEYREK_M;
  const cokYakin = siteler.some((s) => Math.hypot((s[0] - aday.merkez[0]) * M_PER_DEG_LON, (s[1] - aday.merkez[1]) * M_PER_DEG_LAT) < asgari);
  havuz.splice(idx, 1);
  toplamAgirlik -= aday.agirlik;
  if (cokYakin) continue;
  siteler.push(aday.merkez);
  uyeSayisi.push(aday.sayi);
}

// ---- Voronoi ve kırpma ------------------------------------------------------------------------

const delaunay = Delaunay.from(siteler);
const pay = 0.05;
const voronoi = delaunay.voronoi([kutu[0] - pay, kutu[1] - pay, kutu[2] + pay, kutu[3] + pay]);

const hucreler = [], istasyonlar = [];
let kirpilanBos = 0;
for (let i = 0; i < siteler.length; i++) {
  const hamHucre = voronoi.cellPolygon(i);
  if (!hamHucre) { kirpilanBos++; continue; }
  const kirpik = polygonClipping.intersection([hamHucre], ilCokgen);
  if (!kirpik.length) { kirpilanBos++; continue; }
  const geometry = kirpik.length === 1 ? { type: "Polygon", coordinates: kirpik[0] } : { type: "MultiPolygon", coordinates: kirpik };
  const alanKm2 = cokgenAlanM2(kirpik) / 1e6;
  const ilce = bolgeBul(siteler[i], ilceler);
  const komsular = [...voronoi.neighbors(i)];
  hucreler.push({ i, geometry, alanKm2, ilce, komsular, uye: uyeSayisi[i], site: siteler[i] });
}

// Kodlar: alfabetik ilçe, sonra batıdan doğuya. Komşu listesi de koda çevrilir.
hucreler.sort((a, b) => (a.ilce ?? "").localeCompare(b.ilce ?? "") || a.site[0] - b.site[0]);
const kodHaritasi = new Map(hucreler.map((h, n) => [h.i, `BZ-${String(n + 1).padStart(3, "0")}`]));

const ortak = { kaynak: "Kurgusal. Hücreler OpenStreetMap ve İBB nokta yoğunluğundan k-ortalama ve Voronoi ile türetildi. Gerçek operatör verisi kullanılmadı.", uretim_tarihi: new Date().toISOString().slice(0, 10), tohum: TOHUM };
const yuvarla = (k) => [+k[0].toFixed(6), +k[1].toFixed(6)];
const geomYuvarla = (g) => ({ type: g.type, coordinates: g.type === "Polygon" ? g.coordinates.map((h) => h.map(yuvarla)) : g.coordinates.map((c) => c.map((h) => h.map(yuvarla))) });

writeFileSync(`${ISLENMIS}/baz_hucreleri_istanbul.geojson`, JSON.stringify({
  type: "FeatureCollection", ...ortak,
  features: hucreler.map((h) => ({
    type: "Feature", geometry: geomYuvarla(h.geometry),
    properties: { hucre_kodu: kodHaritasi.get(h.i), ilce: h.ilce, alan_km2: +h.alanKm2.toFixed(2), yogunluk_puani: h.uye, komsular: h.komsular.map((k) => kodHaritasi.get(k)).filter(Boolean) },
  })),
}));
writeFileSync(`${ISLENMIS}/baz_istasyonlari_istanbul.geojson`, JSON.stringify({
  type: "FeatureCollection", ...ortak,
  features: hucreler.map((h) => ({ type: "Feature", geometry: { type: "Point", coordinates: yuvarla(h.site) }, properties: { hucre_kodu: kodHaritasi.get(h.i), ilce: h.ilce } })),
}));

// ---- Özet ---------------------------------------------------------------------------------------
const alanlar = hucreler.map((h) => h.alanKm2).sort((a, b) => a - b);
console.log(`Yoğunluk noktası: ${poiSayisi} POI + ${noktalar.length - poiSayisi} durak/istasyon; kare: ${doluKare} dolu, ${bosKare} boş; seçim denemesi ${deneme}`);
console.log(`Hücre: ${hucreler.length} (boş kırpılan ${kirpilanBos})`);
console.log(`Hücre alanı km²: en küçük ${alanlar[0].toFixed(2)}, ortanca ${alanlar[Math.floor(alanlar.length / 2)].toFixed(2)}, en büyük ${alanlar.at(-1).toFixed(1)}`);
const ilceSay = {};
for (const h of hucreler) ilceSay[h.ilce ?? "?"] = (ilceSay[h.ilce ?? "?"] || 0) + 1;
console.log("İlçe başına hücre:", Object.entries(ilceSay).sort((a, b) => b[1] - a[1]).map(([i, s]) => `${i} ${s}`).join(", "));
console.log("Örnek:", JSON.stringify({ ...hucreler[0], geometry: undefined, site: undefined }));

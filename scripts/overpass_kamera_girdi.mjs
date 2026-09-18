// Kurgusal kamera üretimi için gereken OSM girdilerini çeker:
//   ana yollar (çizgi, yön hesabı ve kavşak tespiti için), trafik ışıkları, meydanlar, okullar.
// Kullanım: node scripts/overpass_kamera_girdi.mjs
// Çıktı: data/raw/osm_yollar_istanbul.geojson, osm_trafik_isigi_istanbul.geojson,
//        osm_meydan_istanbul.geojson, osm_okul_istanbul.geojson

import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const ALAN = "area(3600223474)->.ist;";
const yenile = process.argv.includes("--yenile");

async function overpass(sorgu, deneme = 1) {
  const cevap = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
      "User-Agent": "iz-oyun-veri-betigi/0.1 (github.com/tolgabaglama/oyun_v1.0)",
    },
    body: "data=" + encodeURIComponent(sorgu),
  });
  if ((cevap.status === 429 || cevap.status === 504) && deneme < 4) {
    const bekle = 30 * deneme;
    process.stdout.write(`(${cevap.status}, ${bekle} sn sonra ${deneme + 1}. deneme) `);
    await new Promise((r) => setTimeout(r, bekle * 1000));
    return overpass(sorgu, deneme + 1);
  }
  if (!cevap.ok) throw new Error(`Overpass hatası: ${cevap.status} ${cevap.statusText}`);
  return cevap.json();
}

const ortak = { kaynak: "OpenStreetMap katkıcıları, ODbL 1.0, Overpass API ile çekildi", cekim_tarihi: new Date().toISOString().slice(0, 10) };

function noktaFC(ham, kategori) {
  const features = [];
  for (const e of ham.elements) {
    const lon = e.type === "node" ? e.lon : e.center?.lon;
    const lat = e.type === "node" ? e.lat : e.center?.lat;
    if (lon == null) continue;
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [+lon.toFixed(6), +lat.toFixed(6)] }, properties: { osm_id: `${e.type}/${e.id}`, kategori, ad: e.tags?.name ?? null } });
  }
  return { type: "FeatureCollection", ...ortak, features };
}

const ISLER = [
  {
    dosya: "osm_yollar_istanbul.geojson", ad: "Ana yollar",
    sorgu: `[out:json][timeout:300];${ALAN}way["highway"~"^(trunk|primary|secondary)$"](area.ist);out geom;`,
    cevir: (ham) => ({
      type: "FeatureCollection", ...ortak,
      features: ham.elements.filter((e) => e.type === "way" && e.geometry?.length > 1).map((e) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: e.geometry.map((g) => [+g.lon.toFixed(6), +g.lat.toFixed(6)]) },
        properties: { osm_id: `way/${e.id}`, ad: e.tags?.name ?? null, sinif: e.tags?.highway, tek_yon: e.tags?.oneway === "yes", dugumler: e.nodes },
      })),
    }),
  },
  {
    dosya: "osm_trafik_isigi_istanbul.geojson", ad: "Trafik ışıkları",
    sorgu: `[out:json][timeout:300];${ALAN}node["highway"="traffic_signals"](area.ist);out;`,
    cevir: (ham) => noktaFC(ham, "trafik_isigi"),
  },
  {
    dosya: "osm_meydan_istanbul.geojson", ad: "Meydanlar",
    sorgu: `[out:json][timeout:300];${ALAN}(node["place"="square"](area.ist);way["place"="square"](area.ist);way["highway"="pedestrian"]["area"="yes"]["name"~"Meydan"](area.ist);node["name"~"Meydanı$"]["place"](area.ist););out center tags;`,
    cevir: (ham) => noktaFC(ham, "meydan"),
  },
  {
    dosya: "osm_okul_istanbul.geojson", ad: "Okullar",
    sorgu: `[out:json][timeout:300];${ALAN}(node["amenity"="school"](area.ist);way["amenity"="school"](area.ist);relation["amenity"="school"](area.ist););out center tags;`,
    cevir: (ham) => noktaFC(ham, "okul"),
  },
];

mkdirSync("data/raw", { recursive: true });
for (const is of ISLER) {
  const yol = `data/raw/${is.dosya}`;
  if (existsSync(yol) && !yenile) { console.log(`${is.ad}: dosya mevcut, atlandı`); continue; }
  process.stdout.write(`${is.ad} çekiliyor... `);
  const ham = await overpass(is.sorgu);
  const gj = is.cevir(ham);
  writeFileSync(yol, JSON.stringify(gj));
  console.log(`${gj.features.length} öge -> ${yol}`);
  await new Promise((r) => setTimeout(r, 4000));
}

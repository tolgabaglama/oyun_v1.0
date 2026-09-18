// İstanbul il sınırı içindeki eczaneleri Overpass API'den çeker ve GeoJSON olarak kaydeder.
// Kullanım: node scripts/overpass_eczane.mjs
// Çıktı: data/raw/osm_eczane_istanbul.geojson (depoya girer, tekrar indirmek gerekmez)

import { writeFileSync, mkdirSync } from "node:fs";

// 3600223474 = OSM'de İstanbul il sınırı ilişkisinin (relation 223474) Overpass alan kimliği.
const SORGU = `
[out:json][timeout:180];
area(3600223474)->.ist;
(
  node["amenity"="pharmacy"](area.ist);
  way["amenity"="pharmacy"](area.ist);
);
out center tags;
`;

const cevap = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
    "User-Agent": "iz-oyun-veri-betigi/0.1 (github.com/tolgabaglama/oyun_v1.0)",
  },
  body: "data=" + encodeURIComponent(SORGU),
});
if (!cevap.ok) throw new Error(`Overpass hatası: ${cevap.status} ${cevap.statusText}`);
const ham = await cevap.json();

const ozellikler = ham.elements
  .map((e) => {
    const lon = e.type === "node" ? e.lon : e.center?.lon;
    const lat = e.type === "node" ? e.lat : e.center?.lat;
    if (lon == null || lat == null) return null;
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        osm_id: `${e.type}/${e.id}`,
        kategori: "eczane",
        ad: e.tags?.name ?? null,
      },
    };
  })
  .filter(Boolean);

const geojson = {
  type: "FeatureCollection",
  kaynak: "OpenStreetMap katkıcıları, ODbL 1.0, Overpass API ile çekildi",
  cekim_tarihi: new Date().toISOString().slice(0, 10),
  features: ozellikler,
};

mkdirSync("data/raw", { recursive: true });
writeFileSync("data/raw/osm_eczane_istanbul.geojson", JSON.stringify(geojson));
console.log(`${ozellikler.length} eczane kaydedildi: data/raw/osm_eczane_istanbul.geojson`);

// İstanbul ilçe (idari seviye 6) ve mahalle (idari seviye 8) sınırlarını OSM'den çeker,
// osmtogeojson ile çokgen GeoJSON'a çevirir ve data/raw altına yazar.
//
// Kullanım: node scripts/overpass_sinir.mjs
// Çıktı: data/raw/osm_ilce_siniri_istanbul.geojson, data/raw/osm_mahalle_siniri_istanbul.geojson
//
// Not: İBB Açık Veri Portalında mahalle sınırı çokgeni yok, bu yüzden kaynak OSM (bkz. CLAUDE.md 7. bölüm).

import { writeFileSync, mkdirSync } from "node:fs";
import osmtogeojson from "osmtogeojson";

const SINIRLAR = {
  ilce:    { seviye: "6", ad: "İlçe sınırları" },
  mahalle: { seviye: "8", ad: "Mahalle sınırları" },
};

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

mkdirSync("data/raw", { recursive: true });

for (const [k, t] of Object.entries(SINIRLAR)) {
  process.stdout.write(`${t.ad} çekiliyor... `);
  const sorgu = `[out:json][timeout:300];
area(3600223474)->.ist;
relation["boundary"="administrative"]["admin_level"="${t.seviye}"](area.ist);
out geom;`;
  const ham = await overpass(sorgu);
  const gj = osmtogeojson(ham);
  // Yalnızca çokgenleri tut, özellikleri sadeleştir.
  const features = gj.features
    .filter((f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")
    .map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        osm_id: f.id,
        ad: f.properties.name ?? f.properties.tags?.name ?? null,
        seviye: t.seviye,
      },
    }));
  const cikti = {
    type: "FeatureCollection",
    kaynak: "OpenStreetMap katkıcıları, ODbL 1.0, Overpass API ile çekildi",
    cekim_tarihi: new Date().toISOString().slice(0, 10),
    features,
  };
  const dosya = `data/raw/osm_${k}_siniri_istanbul.geojson`;
  writeFileSync(dosya, JSON.stringify(cikti));
  console.log(`${features.length} çokgen -> ${dosya}`);
  await new Promise((r) => setTimeout(r, 4000));
}

// İstanbul il sınırı içindeki OSM noktalarını kategori kategori Overpass API'den çeker,
// her kategoriyi ayrı GeoJSON olarak data/raw altına yazar.
//
// Kullanım:
//   node scripts/overpass_cek.mjs            (tüm kategoriler)
//   node scripts/overpass_cek.mjs eczane atm (yalnızca seçilenler)
//   node scripts/overpass_cek.mjs --yenile     (mevcut dosyaları da yeniden indir)
// Varsayılan davranış: data/raw altında dosyası olan kategori atlanır.
//
// Çıktı: data/raw/osm_<kategori>_istanbul.geojson (depoya girer, tekrar indirmek gerekmez)

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";

// 3600223474 = OSM'de İstanbul il sınırı ilişkisinin (relation 223474) Overpass alan kimliği.
const ALAN = "area(3600223474)->.ist;";

// Kategori tablosu. Her satır: kimlik, Türkçe ad, Overpass seçicileri (node ve way için ayrı ayrı denenir).
// Yeni kategori eklemek yeni bir satırdır, kodda başka değişiklik gerekmez.
const KATEGORILER = {
  market:      { ad: "Market (zincir ve bakkal)", secici: ['["shop"="supermarket"]', '["shop"="convenience"]'] },
  eczane:      { ad: "Eczane",                    secici: ['["amenity"="pharmacy"]'] },
  atm:         { ad: "ATM",                       secici: ['["amenity"="atm"]'] },
  doviz:       { ad: "Döviz bürosu",              secici: ['["amenity"="bureau_de_change"]'] },
  benzinlik:   { ad: "Benzinlik",                 secici: ['["amenity"="fuel"]'] },
  kargo:       { ad: "Kargo şubesi ve PTT",       secici: ['["amenity"="post_office"]', '["office"="courier"]', '["shop"="courier"]'] },
  cami:        { ad: "Cami",                      secici: ['["amenity"="place_of_worship"]["religion"="muslim"]'] },
  kahvehane:   { ad: "Kahvehane ve kafe",         secici: ['["amenity"="cafe"]'] },
  spor_salonu: { ad: "Spor salonu",               secici: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'] },
  otopark:     { ad: "Otopark (özel olmayan)",    secici: ['["amenity"="parking"]["access"!="private"]'] },
};

function sorguOlustur(seciciler) {
  const govde = seciciler.flatMap((s) => [`node${s}(area.ist);`, `way${s}(area.ist);`]).join("\n  ");
  return `[out:json][timeout:300];\n${ALAN}\n(\n  ${govde}\n);\nout center tags;`;
}

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
  // 429 (çok istek) ve 504 (sunucu zaman aşımı) geçici hatalardır, bekleyip yeniden denenir.
  if ((cevap.status === 429 || cevap.status === 504) && deneme < 4) {
    const bekle = 30 * deneme;
    process.stdout.write(`(${cevap.status}, ${bekle} sn sonra ${deneme + 1}. deneme) `);
    await new Promise((r) => setTimeout(r, bekle * 1000));
    return overpass(sorgu, deneme + 1);
  }
  if (!cevap.ok) throw new Error(`Overpass hatası: ${cevap.status} ${cevap.statusText}`);
  return cevap.json();
}

function geojsonaCevir(ham, kategori) {
  const gorulen = new Set();
  const features = [];
  for (const e of ham.elements) {
    const lon = e.type === "node" ? e.lon : e.center?.lon;
    const lat = e.type === "node" ? e.lat : e.center?.lat;
    if (lon == null || lat == null) continue;
    const osm_id = `${e.type}/${e.id}`;
    if (gorulen.has(osm_id)) continue;
    gorulen.add(osm_id);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [+lon.toFixed(6), +lat.toFixed(6)] },
      properties: { osm_id, kategori, ad: e.tags?.name ?? null },
    });
  }
  return {
    type: "FeatureCollection",
    kaynak: "OpenStreetMap katkıcıları, ODbL 1.0, Overpass API ile çekildi",
    cekim_tarihi: new Date().toISOString().slice(0, 10),
    features,
  };
}

const yenile = process.argv.includes("--yenile");
const secilenler = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const liste = secilenler.length ? secilenler : Object.keys(KATEGORILER);
mkdirSync("data/raw", { recursive: true });

const ozet = [];
for (const k of liste) {
  const tanim = KATEGORILER[k];
  if (!tanim) { console.error(`Bilinmeyen kategori: ${k}`); process.exit(1); }
  const dosya = `data/raw/osm_${k}_istanbul.geojson`;
  if (existsSync(dosya) && !yenile) {
    const mevcut = JSON.parse(readFileSync(dosya, "utf8"));
    console.log(`${tanim.ad}: dosya mevcut, atlandı (${mevcut.features.length} nokta)`);
    ozet.push({ kategori: k, ad: tanim.ad, nokta: mevcut.features.length });
    continue;
  }
  process.stdout.write(`${tanim.ad} çekiliyor... `);
  const ham = await overpass(sorguOlustur(tanim.secici));
  const geojson = geojsonaCevir(ham, k);
  writeFileSync(dosya, JSON.stringify(geojson));
  console.log(`${geojson.features.length} nokta -> ${dosya}`);
  ozet.push({ kategori: k, ad: tanim.ad, nokta: geojson.features.length });
  // Overpass sunucusunu yormamak için sorgular arasında kısa bekleme.
  await new Promise((r) => setTimeout(r, 4000));
}

console.log("\n| Kategori | Nokta |");
console.log("| --- | ---: |");
for (const s of ozet) console.log(`| ${s.ad} | ${s.nokta} |`);

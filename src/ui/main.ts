import { Map as HaritaMotoru, AttributionControl, NavigationControl, type ErrorEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import eczaneUrl from "../../data/raw/osm_eczane_istanbul.geojson?url";

// Harita altlığı: OpenFreeMap, anahtarsız. Prototip için yeterli, ileride Protomaps PMTiles gelecek.
const ALTLIK = "https://tiles.openfreemap.org/styles/positron";

// İstanbul merkezi (Haliç civarı). Dikey ekranda iki yakayı birden görmek için 9,5 yakınlık.
const ISTANBUL: [number, number] = [28.97, 41.04];

const durum = document.getElementById("durum")!;

const harita = new HaritaMotoru({
  container: "harita",
  style: ALTLIK,
  center: ISTANBUL,
  zoom: 9.5,
  attributionControl: false,
});

harita.addControl(new AttributionControl({ compact: true }), "bottom-right");
harita.addControl(new NavigationControl({ showCompass: false }), "top-right");

harita.on("load", async () => {
  durum.textContent = "Eczane kayıtları yükleniyor...";

  const cevap = await fetch(eczaneUrl);
  const veri = await cevap.json();

  harita.addSource("eczane", { type: "geojson", data: veri });

  harita.addLayer({
    id: "eczane-nokta",
    type: "circle",
    source: "eczane",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 6],
      "circle-color": "#2e7d32",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
    },
  });

  const adet = veri.features.length as number;
  durum.textContent = `ECZANE katmanı: ${adet} kayıt. Kaynak: OpenStreetMap.`;
});

harita.on("error", (e: ErrorEvent) => {
  console.error(e);
  durum.textContent = "Harita yüklenemedi. İnternet bağlantısını kontrol et.";
});

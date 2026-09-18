import { Map as HaritaMotoru, AttributionControl, NavigationControl, type ErrorEvent, type MapGeoJSONFeature, type AddLayerObject } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { KATMANLAR, KAYNAKLAR, type Katman } from "./katmanlar";

// Harita altlığı: OpenFreeMap, anahtarsız. Prototip için yeterli, ileride Protomaps PMTiles gelecek.
const ALTLIK = "https://tiles.openfreemap.org/styles/positron";

// İstanbul merkezi (Haliç civarı). Dikey ekranda iki yakayı birden görmek için 9,5 yakınlık.
const ISTANBUL: [number, number] = [28.97, 41.04];

const durum = document.getElementById("durum")!;
const panel = document.getElementById("katman-paneli")!;
const panelListe = document.getElementById("katman-listesi")!;
const panelDugme = document.getElementById("katman-dugmesi")!;

const harita = new HaritaMotoru({
  container: "harita",
  style: ALTLIK,
  center: ISTANBUL,
  zoom: 9.5,
  attributionControl: false,
});

harita.addControl(new AttributionControl({ compact: true }), "bottom-right");
harita.addControl(new NavigationControl({ showCompass: false }), "top-right");

panelDugme.addEventListener("click", () => {
  panel.hidden = !panel.hidden;
  panelDugme.classList.toggle("aktif", !panel.hidden);
});

type FC = { features: { properties: Record<string, unknown> }[] };

/** Bir katmanın nokta sayısı: kaynağın tamamı ya da filtreye uyanlar. */
function katmanSayisi(katman: Katman, veri: FC): number {
  if (!katman.filtre) return veri.features.length;
  // Şimdilik tek desteklenen filtre biçimi: ["==", ["get", alan], değer]
  const [, [, alan], deger] = katman.filtre as [string, [string, string], unknown];
  return veri.features.filter((f) => f.properties[alan] === deger).length;
}

function panelSatiri(katman: Katman, sayi: number): HTMLElement {
  const satir = document.createElement("label");
  satir.className = "katman-satiri";
  const kutu = document.createElement("input");
  kutu.type = "checkbox";
  kutu.checked = katman.acik;
  kutu.addEventListener("change", () => {
    harita.setLayoutProperty(katman.id, "visibility", kutu.checked ? "visible" : "none");
  });
  const renk = document.createElement("span");
  renk.className = "katman-renk";
  renk.style.background = katman.renk;
  const ad = document.createElement("span");
  ad.className = "katman-ad";
  ad.textContent = katman.ad;
  const adet = document.createElement("span");
  adet.className = "katman-adet";
  adet.textContent = String(sayi);
  satir.append(kutu, renk, ad, adet);
  return satir;
}

function paneliKur(sayilar: Map<string, number>) {
  panelListe.innerHTML = "";
  let sonGrup = "";
  for (const k of KATMANLAR) {
    if (k.grup !== sonGrup) {
      const baslik = document.createElement("div");
      baslik.className = "katman-grup";
      baslik.textContent = k.grup.toUpperCase();
      panelListe.append(baslik);
      sonGrup = k.grup;
    }
    panelListe.append(panelSatiri(k, sayilar.get(k.id) ?? 0));
  }
}

/** Tıklanan ögenin kısa özeti alt bara yazılır. */
function ozetMetni(f: MapGeoJSONFeature): string {
  const p = f.properties as Record<string, string>;
  if (p.kamera_kodu && p.koni_acisi) return `${p.kamera_kodu} | ${p.tur} | yön ${p.yon}° | ${p.yol_adi ?? "yol yok"} | ${p.ilce}`;
  if (p.hucre_kodu) return `${p.hucre_kodu} | ${p.ilce ?? ""} | ${p.alan_km2 ? p.alan_km2 + " km²" : "baz"}`;
  if (p.hat_turu) return `${p.ad} | ${p.hat_turu} | ${p.ilce}`;
  if (p.durak_kodu) return `Durak ${p.durak_kodu} | ${p.ad} | ${p.ilce}`;
  if (p.kategori) return `${p.id} | ${p.kategori} | ${p.ilce} / ${p.mahalle ?? ""}`;
  if (p.seviye) return `${p.ad}`;
  return JSON.stringify(p);
}

harita.on("load", async () => {
  durum.textContent = "Katman verileri yükleniyor...";

  // Tüm kaynak dosyaları aynı anda indir.
  const veriler = new Map<string, FC>();
  await Promise.all(
    Object.values(KAYNAKLAR).map(async (kaynak) => {
      const cevap = await fetch(kaynak.url);
      const veri = (await cevap.json()) as FC;
      veriler.set(kaynak.id, veri);
      harita.addSource(kaynak.id, { type: "geojson", data: veri as never });
    }),
  );

  const sayilar = new Map<string, number>();
  for (const k of KATMANLAR) {
    // Katman tipi tabloda serbest metin olduğu için MapLibre'nin katı tipine burada dönüştürülür.
    const tanim = {
      id: k.id,
      type: k.tip,
      source: k.kaynak.id,
      ...(k.filtre ? { filter: k.filtre } : {}),
      ...(k.minzoom ? { minzoom: k.minzoom } : {}),
      layout: { visibility: k.acik ? "visible" : "none" },
      paint: k.paint,
    } as unknown as AddLayerObject;
    harita.addLayer(tanim);
    sayilar.set(k.id, katmanSayisi(k, veriler.get(k.kaynak.id)!));
    harita.on("click", k.id, (e) => {
      const f = e.features?.[0];
      if (f) durum.textContent = ozetMetni(f);
    });
    harita.on("mouseenter", k.id, () => { harita.getCanvas().style.cursor = "pointer"; });
    harita.on("mouseleave", k.id, () => { harita.getCanvas().style.cursor = ""; });
  }

  paneliKur(sayilar);

  const poi = sayilar.get("poi-market")! + [...sayilar.entries()].filter(([id]) => id.startsWith("poi-") && id !== "poi-market").reduce((s, [, n]) => s + n, 0);
  durum.textContent = `${KATMANLAR.length} katman hazır. POI ${poi}, kamera ${sayilar.get("kamera")}, baz hücresi ${sayilar.get("baz-hucre-dolgu")}.`;
});

harita.on("error", (e: ErrorEvent) => {
  console.error(e);
  durum.textContent = "Harita yüklenemedi. İnternet bağlantısını kontrol et.";
});

// Harita katman tanımları. Yeni katman eklemek bu tabloya satır eklemektir, başka kod değişmez.
// Dosyalar data/processed altından gelir; Vite ?url ile adreslerini verir.

import poiUrl from "../../data/processed/poi_istanbul.geojson?url";
import istasyonUrl from "../../data/processed/istasyonlar_istanbul.geojson?url";
import durakUrl from "../../data/processed/duraklar_istanbul.geojson?url";
import kameraUrl from "../../data/processed/kameralar_istanbul.geojson?url";
import koniUrl from "../../data/processed/kamera_konileri_istanbul.geojson?url";
import bazHucreUrl from "../../data/processed/baz_hucreleri_istanbul.geojson?url";
import bazIstasyonUrl from "../../data/processed/baz_istasyonlari_istanbul.geojson?url";
import ilceUrl from "../../data/processed/ilceler_istanbul.geojson?url";
import mahalleUrl from "../../data/processed/mahalleler_istanbul.geojson?url";

export type KatmanTipi = "circle" | "line" | "fill";

export interface Kaynak {
  id: string;
  url: string;
}

export interface Katman {
  id: string;
  ad: string;
  grup: string;
  kaynak: Kaynak;
  tip: KatmanTipi;
  paint: Record<string, unknown>;
  /** MapLibre filtre ifadesi, ör. kategoriye göre süzmek için. */
  filtre?: unknown[];
  /** Başlangıçta açık mı. */
  acik: boolean;
  /** Bu yakınlaştırmanın altında çizilmez (kalabalık katmanlar için). */
  minzoom?: number;
  /** Panelde gösterilen renk örneği. */
  renk: string;
}

export const KAYNAKLAR: Record<string, Kaynak> = {
  poi: { id: "poi", url: poiUrl },
  istasyonlar: { id: "istasyonlar", url: istasyonUrl },
  duraklar: { id: "duraklar", url: durakUrl },
  kameralar: { id: "kameralar", url: kameraUrl },
  koniler: { id: "koniler", url: koniUrl },
  bazHucreleri: { id: "baz_hucreleri", url: bazHucreUrl },
  bazIstasyonlari: { id: "baz_istasyonlari", url: bazIstasyonUrl },
  ilceler: { id: "ilceler", url: ilceUrl },
  mahalleler: { id: "mahalleler", url: mahalleUrl },
};

/** POI kategorileri: kimlik, panel adı, renk. Renkler kamu yazılımı havasında, bağırmayan tonlar. */
const POI_KATEGORILERI: [string, string, string][] = [
  ["market", "Market", "#b5651d"],
  ["eczane", "Eczane", "#2e7d32"],
  ["atm", "ATM", "#1565c0"],
  ["doviz", "Döviz bürosu", "#6a1b9a"],
  ["benzinlik", "Benzinlik", "#c62828"],
  ["kargo", "Kargo şubesi", "#ef6c00"],
  ["cami", "Cami", "#00695c"],
  ["kahvehane", "Kahvehane", "#5d4037"],
  ["spor_salonu", "Spor salonu", "#00838f"],
  ["otopark", "Otopark", "#546e7a"],
];

const noktaYaricap = ["interpolate", ["linear"], ["zoom"], 9, 1.5, 12, 3, 15, 6];

export const KATMANLAR: Katman[] = [
  // Sınırlar altta çizilir.
  {
    id: "ilce-sinir", ad: "İlçe sınırları", grup: "Sınırlar", kaynak: KAYNAKLAR.ilceler, tip: "line",
    paint: { "line-color": "#333333", "line-width": 1.2, "line-dasharray": [4, 2] }, acik: true, renk: "#333333",
  },
  {
    id: "mahalle-sinir", ad: "Mahalle sınırları", grup: "Sınırlar", kaynak: KAYNAKLAR.mahalleler, tip: "line",
    paint: { "line-color": "#777777", "line-width": 0.6 }, acik: false, minzoom: 11, renk: "#777777",
  },
  // Baz hücreleri
  {
    id: "baz-hucre-dolgu", ad: "Baz hücreleri", grup: "Baz istasyonu", kaynak: KAYNAKLAR.bazHucreleri, tip: "fill",
    paint: { "fill-color": "#7e57c2", "fill-opacity": 0.15 }, acik: false, renk: "#7e57c2",
  },
  {
    id: "baz-hucre-sinir", ad: "Baz hücre sınırları", grup: "Baz istasyonu", kaynak: KAYNAKLAR.bazHucreleri, tip: "line",
    paint: { "line-color": "#5e35b1", "line-width": 1 }, acik: false, renk: "#5e35b1",
  },
  {
    id: "baz-istasyon", ad: "Baz istasyonları", grup: "Baz istasyonu", kaynak: KAYNAKLAR.bazIstasyonlari, tip: "circle",
    paint: { "circle-radius": 4, "circle-color": "#5e35b1", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 }, acik: false, renk: "#5e35b1",
  },
  // Kameralar
  {
    id: "kamera-koni", ad: "Kamera görüş konileri", grup: "ŞEHİRGÖZ", kaynak: KAYNAKLAR.koniler, tip: "fill",
    paint: { "fill-color": "#e53935", "fill-opacity": 0.3 }, acik: true, minzoom: 12, renk: "#e53935",
  },
  {
    id: "kamera", ad: "Kameralar", grup: "ŞEHİRGÖZ", kaynak: KAYNAKLAR.kameralar, tip: "circle",
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 5], "circle-color": "#b71c1c", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 }, acik: true, renk: "#b71c1c",
  },
  // Ulaşım
  {
    id: "durak", ad: "Otobüs durakları", grup: "Ulaşım", kaynak: KAYNAKLAR.duraklar, tip: "circle",
    paint: { "circle-radius": noktaYaricap, "circle-color": "#0277bd", "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.5 }, acik: false, renk: "#0277bd",
  },
  {
    id: "istasyon", ad: "Raylı sistem istasyonları", grup: "Ulaşım", kaynak: KAYNAKLAR.istasyonlar, tip: "circle",
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 6], "circle-color": "#01579b", "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 }, acik: false, renk: "#01579b",
  },
  // POI kategorileri, her biri ayrı katman ama aynı kaynak.
  ...POI_KATEGORILERI.map(([kat, ad, renk]): Katman => ({
    id: `poi-${kat}`, ad, grup: "Noktalar", kaynak: KAYNAKLAR.poi, tip: "circle",
    filtre: ["==", ["get", "kategori"], kat],
    paint: { "circle-radius": noktaYaricap, "circle-color": renk, "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.5 },
    acik: true, renk,
  })),
];

// Harita yöneticisi. MapLibre haritası bir kez kurulur ve sekmeler arasında korunur;
// yeniden çizimde yalnızca kapsayıcı DOM'a geri takılır.

import { Map as HaritaMotoru, AttributionControl, NavigationControl, Popup, setWorkerUrl, type MapMouseEvent } from "maplibre-gl";
// MapLibre arka plan çalışanını kendi hesapladığı göreli adresten arar ve derlemede bu dosya
// paket dışında kalır. "?worker&url" Vite'a çalışanı bağımlılıklarıyla birlikte derletir,
// dönen adres de doğru base ile üretilir.
import calisanAdresi from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { KameraGorunumu, Konum, NoktaGorunumu, SonucGorunumu } from "../app/gorunum.ts";

setWorkerUrl(calisanAdresi);

const ALTLIK = "https://tiles.openfreemap.org/styles/positron";
const ISTANBUL: [number, number] = [28.97, 41.04];
const UZUN_BASMA_MS = 550;
const DOGRU_YARICAP_M = 150;

export type HaritaModu = "gez" | "nokta_secim" | "kamera_secim" | "raptiye" | "dislama";

/** Haritada tıklanan ögenin künyesi; metin uygulama katmanında üretilir. */
export interface Kunye {
  baslik: string;
  satirlar: string[];
}

export interface HaritaOlaylari {
  onNoktaSecildi: (tip: "poi" | "kamera", id: string) => void;
  /** Tıklanan ögenin özellikleri ve bulunduğu katmandan künye üretir. */
  kunyeCoz: (ozellikler: Record<string, unknown>, katmanId: string) => Kunye | null;
  onRaptiye: (konum: Konum) => void;
  onDislama: (merkez: Konum, yaricapM: number) => void;
  onTahmin: (konum: Konum) => void;
  onModDegisti: (mod: HaritaModu) => void;
}

const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((41.0 * Math.PI) / 180);

function mesafeM(a: Konum, b: Konum): number {
  return Math.hypot((a[0] - b[0]) * M_PER_DEG_LON, (a[1] - b[1]) * M_PER_DEG_LAT);
}

function daireCokgen(merkez: Konum, yaricapM: number, adim = 48): Konum[] {
  const halka: Konum[] = [];
  for (let i = 0; i <= adim; i++) {
    const a = (i / adim) * 2 * Math.PI;
    halka.push([merkez[0] + (Math.sin(a) * yaricapM) / M_PER_DEG_LON, merkez[1] + (Math.cos(a) * yaricapM) / M_PER_DEG_LAT]);
  }
  return halka;
}

interface Cizimler {
  raptiyeler: { id: string; konum: Konum; not: string }[];
  dislamalar: { id: string; merkez: Konum; yaricap_m: number }[];
  tahminler: { konum: Konum; dogru: boolean }[];
  gercekKonum: Konum | null;
}

export class HaritaYoneticisi {
  readonly kap: HTMLDivElement;
  private harita: HaritaMotoru | null = null;
  private hazir = false;
  private bekleyenIsler: (() => void)[] = [];
  private eklenenKatmanlar = new Set<string>();
  private mod: HaritaModu = "gez";
  private dislamaMerkezi: Konum | null = null;
  private olaylar: HaritaOlaylari;
  private basmaZamani: number | null = null;
  private noktalarEklendi = false;
  private kameralarEklendi = false;
  private balon: Popup | null = null;

  constructor(olaylar: HaritaOlaylari) {
    this.olaylar = olaylar;
    this.kap = document.createElement("div");
    this.kap.className = "harita-kap";
  }

  /** İlk kullanımda haritayı kurar; sonraki çağrılarda yalnızca boyutu tazeler. */
  baslat(): void {
    if (this.harita) {
      requestAnimationFrame(() => this.harita?.resize());
      return;
    }
    const harita = new HaritaMotoru({
      container: this.kap,
      style: ALTLIK,
      center: ISTANBUL,
      zoom: 9.5,
      attributionControl: false,
    });
    this.harita = harita;
    harita.addControl(new AttributionControl({ compact: true }), "bottom-right");
    harita.addControl(new NavigationControl({ showCompass: false }), "bottom-left");

    harita.on("load", () => {
      harita.addSource("cizimler", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      harita.addLayer({ id: "dislama-dolgu", type: "fill", source: "cizimler", filter: ["==", ["get", "tip"], "dislama"], paint: { "fill-color": "#888888", "fill-opacity": 0.35 } });
      harita.addLayer({ id: "dislama-cizgi", type: "line", source: "cizimler", filter: ["==", ["get", "tip"], "dislama"], paint: { "line-color": "#555555", "line-width": 1.5, "line-dasharray": [3, 2] } });
      harita.addLayer({ id: "tahmin-halka", type: "fill", source: "cizimler", filter: ["==", ["get", "tip"], "tahmin"], paint: { "fill-color": ["case", ["get", "dogru"], "#2e7d32", "#c62828"], "fill-opacity": 0.25 } });
      harita.addLayer({ id: "raptiye-nokta", type: "circle", source: "cizimler", filter: ["==", ["get", "tip"], "raptiye"], paint: { "circle-radius": 7, "circle-color": "#f9a825", "circle-stroke-color": "#333", "circle-stroke-width": 2 } });
      harita.addLayer({ id: "gercek-nokta", type: "circle", source: "cizimler", filter: ["==", ["get", "tip"], "gercek"], paint: { "circle-radius": 9, "circle-color": "#2e7d32", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
      this.hazir = true;
      for (const is of this.bekleyenIsler) is();
      this.bekleyenIsler = [];
    });

    harita.on("click", (e) => this.tiklama(e));
    // Uzun basma: tahmin. Harita kaydırılırsa iptal edilir.
    const bas = () => { this.basmaZamani = Date.now(); };
    const birak = (e: MapMouseEvent) => {
      if (this.basmaZamani && Date.now() - this.basmaZamani >= UZUN_BASMA_MS && this.mod === "gez") {
        this.olaylar.onTahmin([e.lngLat.lng, e.lngLat.lat]);
      }
      this.basmaZamani = null;
    };
    harita.on("mousedown", bas);
    harita.on("mouseup", birak);
    harita.on("touchstart", bas);
    harita.on("touchend", (e) => birak(e as unknown as MapMouseEvent));
    harita.on("movestart", () => { this.basmaZamani = null; });
  }

  private isYap(is: () => void): void {
    if (this.hazir) is();
    else this.bekleyenIsler.push(is);
  }

  private tiklama(e: MapMouseEvent): void {
    const konum: Konum = [e.lngLat.lng, e.lngLat.lat];
    if (this.mod === "nokta_secim" || this.mod === "kamera_secim") {
      const kamera = this.mod === "kamera_secim";
      const ozellikler = this.yakindakiler(e, [kamera ? "tum-kameralar" : "tum-noktalar"]);
      const id = ozellikler[0]?.properties?.[kamera ? "kamera_kodu" : "poi_id"] as string | undefined;
      if (id) this.olaylar.onNoktaSecildi(kamera ? "kamera" : "poi", id);
      return;
    }
    if (this.mod === "gez") {
      this.balonGoster(e);
      return;
    }
    if (this.mod === "raptiye") {
      this.olaylar.onRaptiye(konum);
      this.modAyarla("gez");
      return;
    }
    if (this.mod === "dislama") {
      if (!this.dislamaMerkezi) {
        this.dislamaMerkezi = konum;
        this.olaylar.onModDegisti("dislama");
        return;
      }
      const yaricap = Math.max(100, Math.round(mesafeM(this.dislamaMerkezi, konum)));
      this.olaylar.onDislama(this.dislamaMerkezi, yaricap);
      this.dislamaMerkezi = null;
      this.modAyarla("gez");
    }
  }

  modAyarla(mod: HaritaModu): void {
    this.mod = mod;
    if (mod !== "dislama") this.dislamaMerkezi = null;
    this.kap.dataset.mod = mod;
    this.balon?.remove();
    if (mod === "nokta_secim") this.noktalariGoster(true);
    if (mod === "kamera_secim") this.kameralariGoster(true);
    this.isYap(() => this.noktaBoyutuAyarla());
    this.olaylar.onModDegisti(mod);
  }

  /** Dokunma hedefi küçük olduğu için tıklama noktasının çevresinde arama yapılır. */
  private yakindakiler(e: MapMouseEvent, katmanlar: string[]) {
    const t = 14;
    const kutu: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: e.point.x - t, y: e.point.y - t },
      { x: e.point.x + t, y: e.point.y + t },
    ];
    const mevcut = katmanlar.filter((k) => this.harita!.getLayer(k));
    if (!mevcut.length) return [];
    return this.harita!.queryRenderedFeatures(kutu as never, { layers: mevcut });
  }

  /** Künyesi gösterilebilecek tüm katmanlar: sorgu katmanları ve genel nokta katmanları. */
  private kunyeKatmanlari(): string[] {
    const out: string[] = [];
    for (const kaynak of this.eklenenKatmanlar) out.push(`${kaynak}-nokta`, `${kaynak}-dolgu`);
    out.push("tum-kameralar", "tum-noktalar");
    return out;
  }

  /** Gez modunda bir ögeye dokununca künye balonu açılır. */
  private balonGoster(e: MapMouseEvent): void {
    const ozellikler = this.yakindakiler(e, this.kunyeKatmanlari());
    this.balon?.remove();
    if (!ozellikler.length) return;
    // Nokta katmanları çokgenlerin önünde değerlendirilir; nokta yoksa çokgene düşülür.
    const f = ozellikler.find((x) => x.geometry.type === "Point") ?? ozellikler[0];
    const kunye = this.olaylar.kunyeCoz(f.properties as Record<string, unknown>, String(f.layer?.id ?? ""));
    if (!kunye) return;
    const kacir = (m: string) => m.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const govde = kunye.satirlar.filter(Boolean).map((x) => `<div class="balon-satir">${kacir(x)}</div>`).join("");
    this.balon = new Popup({ closeButton: true, maxWidth: "240px", className: "nokta-balonu" })
      .setLngLat(e.lngLat)
      .setHTML(`<div class="balon-baslik">${kacir(kunye.baslik)}</div>${govde}`)
      .addTo(this.harita!);
  }

  dislamaMerkeziVar(): boolean {
    return this.dislamaMerkezi !== null;
  }

  /** Tüm POI noktaları katmanı; nokta seçiminde zorunlu, diğer zaman isteğe bağlı. */
  noktalariEkle(noktalar: NoktaGorunumu[]): void {
    this.isYap(() => {
      if (this.noktalarEklendi) return;
      const harita = this.harita!;
      harita.addSource("tum-noktalar", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: noktalar.map((n) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: n.konum },
            properties: {
              poi_id: n.id, kategori: n.kategori_adi, ilce: n.ilce,
              mahalle: n.mahalle, kamera_durumu: n.kamera_durumu,
            },
          })),
        } as never,
      });
      harita.addLayer({
        id: "tum-noktalar",
        type: "circle",
        source: "tum-noktalar",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 5],
          "circle-color": "#9e9e9e",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });
      this.noktalarEklendi = true;
      this.noktaBoyutuAyarla();
    });
  }

  /** Seçim modunda noktalar dokunulabilir büyüklüğe çıkar. */
  private noktaBoyutuAyarla(): void {
    const harita = this.harita;
    if (!harita) return;
    // MapLibre ifade tipleri katı olduğu için yarıçap ifadeleri açıkça işaretlenir.
    const buyuk = ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 9] as unknown as never;
    const kucukNokta = ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 5] as unknown as never;
    const kucukKamera = ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 6] as unknown as never;
    if (harita.getLayer("tum-noktalar")) {
      const secim = this.mod === "nokta_secim";
      harita.setPaintProperty("tum-noktalar", "circle-radius", secim ? buyuk : kucukNokta);
      harita.setPaintProperty("tum-noktalar", "circle-color", secim ? "#e65100" : "#9e9e9e");
    }
    if (harita.getLayer("tum-kameralar")) {
      const secim = this.mod === "kamera_secim";
      harita.setPaintProperty("tum-kameralar", "circle-radius", secim ? buyuk : kucukKamera);
      harita.setPaintProperty("tum-kameralar", "circle-color", secim ? "#e65100" : "#b71c1c");
    }
  }

  /** Tüm ŞEHİRGÖZ kameraları; kamera sorgusunda seçilebilir. */
  kameralariEkle(kameralar: KameraGorunumu[]): void {
    this.isYap(() => {
      if (this.kameralarEklendi) return;
      const harita = this.harita!;
      harita.addSource("tum-kameralar", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: kameralar.map((k) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: k.konum },
            properties: { kamera_kodu: k.kod, tur_adi: k.tur_adi, ilce: k.ilce, yol_adi: k.yol_adi, yon: k.yon },
          })),
        } as never,
      });
      harita.addLayer({
        id: "tum-kameralar",
        type: "circle",
        source: "tum-kameralar",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 6],
          "circle-color": "#b71c1c",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1,
        },
      });
      this.kameralarEklendi = true;
    });
  }

  kameralariGoster(gorunur?: boolean): void {
    if (gorunur === undefined) return;
    this.isYap(() => {
      if (this.harita?.getLayer("tum-kameralar")) this.harita.setLayoutProperty("tum-kameralar", "visibility", gorunur ? "visible" : "none");
    });
  }

  kameralarGorunur(): boolean {
    return this.harita?.getLayer("tum-kameralar") ? this.harita.getLayoutProperty("tum-kameralar", "visibility") === "visible" : false;
  }

  noktalariGoster(gorunur?: boolean): void {
    if (gorunur === undefined) return;
    this.isYap(() => {
      if (this.harita?.getLayer("tum-noktalar")) this.harita.setLayoutProperty("tum-noktalar", "visibility", gorunur ? "visible" : "none");
    });
  }

  noktalarGorunur(): boolean {
    return this.harita?.getLayer("tum-noktalar") ? this.harita.getLayoutProperty("tum-noktalar", "visibility") === "visible" : false;
  }

  /** Sorgu katmanlarını ekler ve görünürlüklerini ayarlar. */
  katmanlariGuncelle(sonuclar: SonucGorunumu[], gizli: Set<string>): void {
    this.isYap(() => {
      const harita = this.harita!;
      for (const s of sonuclar) {
        const kaynak = `q-${s.sorgu_id}`;
        if (!this.eklenenKatmanlar.has(kaynak)) {
          harita.addSource(kaynak, { type: "geojson", data: s.katman.veri as never });
          harita.addLayer({
            id: `${kaynak}-dolgu`, type: "fill", source: kaynak,
            filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
            paint: { "fill-color": s.katman.renk, "fill-opacity": 0.25 },
          });
          harita.addLayer({
            id: `${kaynak}-sinir`, type: "line", source: kaynak,
            filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"], ["==", ["geometry-type"], "LineString"]],
            paint: { "line-color": s.katman.renk, "line-width": 2 },
          });
          harita.addLayer({
            id: `${kaynak}-nokta`, type: "circle", source: kaynak,
            filter: ["==", ["geometry-type"], "Point"],
            paint: { "circle-radius": 6, "circle-color": s.katman.renk, "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
          });
          this.eklenenKatmanlar.add(kaynak);
        }
        const gorunur = !gizli.has(s.sorgu_id) ? "visible" : "none";
        for (const son of ["dolgu", "sinir", "nokta"]) {
          const id = `${kaynak}-${son}`;
          if (harita.getLayer(id)) harita.setLayoutProperty(id, "visibility", gorunur);
        }
      }
    });
  }

  cizimleriGuncelle(c: Cizimler): void {
    this.isYap(() => {
      const features: unknown[] = [];
      for (const d of c.dislamalar) {
        features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [daireCokgen(d.merkez, d.yaricap_m)] }, properties: { tip: "dislama", id: d.id } });
      }
      for (const t of c.tahminler) {
        features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [daireCokgen(t.konum, DOGRU_YARICAP_M)] }, properties: { tip: "tahmin", dogru: t.dogru } });
      }
      for (const r of c.raptiyeler) {
        features.push({ type: "Feature", geometry: { type: "Point", coordinates: r.konum }, properties: { tip: "raptiye", id: r.id, not: r.not } });
      }
      if (c.gercekKonum) {
        features.push({ type: "Feature", geometry: { type: "Point", coordinates: c.gercekKonum }, properties: { tip: "gercek" } });
      }
      const kaynak = this.harita!.getSource("cizimler") as { setData: (d: unknown) => void } | undefined;
      kaynak?.setData({ type: "FeatureCollection", features });
      // Çizim katmanları harita kurulurken eklendiği için sorgu katmanlarının altında kalır;
      // oyuncunun kendi işaretleri ve gerçek konum her zaman en üstte görünmelidir.
      for (const id of ["dislama-dolgu", "dislama-cizgi", "tahmin-halka", "raptiye-nokta", "gercek-nokta"]) {
        if (this.harita!.getLayer(id)) this.harita!.moveLayer(id);
      }
    });
  }

  /**
   * Yeni dosyaya geçerken önceki dosyanın izlerini siler: sorgu katmanları, çizimler ve balon.
   * Nokta ve kamera katmanları dosyadan bağımsızdır, yerinde kalır ama gizlenir.
   */
  turuSifirla(): void {
    this.isYap(() => {
      const harita = this.harita!;
      for (const kaynak of this.eklenenKatmanlar) {
        for (const son of ["dolgu", "sinir", "nokta"]) {
          const id = `${kaynak}-${son}`;
          if (harita.getLayer(id)) harita.removeLayer(id);
        }
        if (harita.getSource(kaynak)) harita.removeSource(kaynak);
      }
      this.eklenenKatmanlar.clear();
      const cizimler = harita.getSource("cizimler") as { setData: (d: unknown) => void } | undefined;
      cizimler?.setData({ type: "FeatureCollection", features: [] });
      this.balon?.remove();
      this.balon = null;
      this.noktalariGoster(false);
      this.kameralariGoster(false);
    });
    this.modAyarla("gez");
  }

  /** Bir katmanın kapsadığı alana yaklaştırır. */
  katmanaGit(sonuc: SonucGorunumu): void {
    this.isYap(() => {
      const veri = sonuc.katman.veri as { features: { geometry: { type: string; coordinates: unknown } }[] };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const gez = (k: unknown): void => {
        if (Array.isArray(k) && typeof k[0] === "number" && typeof k[1] === "number") {
          minX = Math.min(minX, k[0]); maxX = Math.max(maxX, k[0]);
          minY = Math.min(minY, k[1]); maxY = Math.max(maxY, k[1]);
        } else if (Array.isArray(k)) for (const alt of k) gez(alt);
      };
      for (const f of veri.features ?? []) gez(f.geometry.coordinates);
      if (minX === Infinity) return;
      this.harita!.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, maxZoom: 15, duration: 600 });
    });
  }

  merkezle(konum: Konum, zoom = 15): void {
    this.isYap(() => this.harita!.flyTo({ center: konum, zoom, duration: 700 }));
  }
}

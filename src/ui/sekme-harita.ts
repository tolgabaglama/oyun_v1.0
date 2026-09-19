// HARİTA sekmesi: harita kapsayıcısı, araç çubuğu ve katman paneli.
// Harita nesnesi burada yaratılmaz; main.ts'teki tek örnek buraya takılır.

import { el } from "./dom.ts";
import type { DislamaDairesi, Raptiye, SonucGorunumu } from "../app/gorunum.ts";
import type { HaritaModu, HaritaYoneticisi } from "./harita.ts";

export interface HaritaSekmesiSecenekleri {
  harita: HaritaYoneticisi;
  gecmis: SonucGorunumu[];
  gizli: Set<string>;
  raptiyeler: Raptiye[];
  dislamalar: DislamaDairesi[];
  mod: HaritaModu;
  noktalarGorunur: boolean;
  kameralarGorunur: boolean;
  /** Seçim bekleyen sorgunun adı; yoksa null. */
  bekleyenSorguAdi: string | null;
  onKatmanDegis: (sorguId: string, gorunur: boolean) => void;
  onNoktalarDegis: (gorunur: boolean) => void;
  onKameralarDegis: (gorunur: boolean) => void;
  onModDegis: (mod: HaritaModu) => void;
  onKatmanaGit: (sorguId: string) => void;
  onRaptiyeSil: (id: string) => void;
  onDislamaSil: (id: string) => void;
  onSecimIptal: () => void;
  turBitti: boolean;
}

const MOD_ACIKLAMALARI: Record<HaritaModu, string> = {
  gez: "Noktaya dokununca künyesi açılır. Tahmin için haritaya uzun basın.",
  nokta_secim: "Sorgulanacak noktaya dokunun.",
  kamera_secim: "Sorgulanacak kameraya dokunun.",
  raptiye: "Raptiye koymak için haritaya dokunun.",
  dislama: "Dışlama dairesi: önce merkeze, sonra kenarına dokunun.",
};

export function sekmeHarita(s: HaritaSekmesiSecenekleri): HTMLElement {
  const panel = el("aside", { sinif: "katman-paneli", hidden: true },
    el("div", { sinif: "katman-baslik" }, "KATMANLAR"),
    el("div", { sinif: "katman-listesi" },
      el("label", { sinif: "katman-satiri" },
        el("input", {
          type: "checkbox", checked: s.noktalarGorunur,
          onchange: (e: Event) => s.onNoktalarDegis((e.currentTarget as HTMLInputElement).checked),
        }),
        el("span", { sinif: "katman-renk", style: "background:#9e9e9e" }),
        el("span", { sinif: "katman-ad" }, "Tüm noktalar"),
      ),
      el("label", { sinif: "katman-satiri" },
        el("input", {
          type: "checkbox", checked: s.kameralarGorunur,
          onchange: (e: Event) => s.onKameralarDegis((e.currentTarget as HTMLInputElement).checked),
        }),
        el("span", { sinif: "katman-renk", style: "background:#b71c1c" }),
        el("span", { sinif: "katman-ad" }, "ŞEHİRGÖZ kameraları"),
      ),
      ...(s.gecmis.length
        ? s.gecmis.map((g) =>
            el("label", { sinif: "katman-satiri" },
              el("input", {
                type: "checkbox", checked: !s.gizli.has(g.sorgu_id),
                onchange: (e: Event) => s.onKatmanDegis(g.sorgu_id, (e.currentTarget as HTMLInputElement).checked),
              }),
              el("span", { sinif: "katman-renk", style: `background:${g.katman.renk}` }),
              el("span", { sinif: "katman-ad" }, `${g.sorgu_id} ${g.sensor_adi}`),
              el("button", { type: "button", sinif: "katman-git", onclick: () => s.onKatmanaGit(g.sorgu_id) }, "git"),
            ),
          )
        : [el("p", { sinif: "bos-metin kucuk" }, "Henüz katman yok.")]),
      (s.raptiyeler.length > 0 || s.dislamalar.length > 0) && el("div", { sinif: "katman-grup" }, "İŞARETLER"),
      ...s.raptiyeler.map((r) =>
        el("div", { sinif: "katman-satiri" },
          el("span", { sinif: "katman-renk", style: "background:#f9a825" }),
          el("span", { sinif: "katman-ad" }, r.not || "Raptiye"),
          el("button", { type: "button", sinif: "katman-git", onclick: () => s.onRaptiyeSil(r.id) }, "sil"),
        ),
      ),
      ...s.dislamalar.map((d) =>
        el("div", { sinif: "katman-satiri" },
          el("span", { sinif: "katman-renk", style: "background:#888888" }),
          el("span", { sinif: "katman-ad" }, `Dışlama, ${d.yaricap_m} m`),
          el("button", { type: "button", sinif: "katman-git", onclick: () => s.onDislamaSil(d.id) }, "sil"),
        ),
      ),
    ),
  );

  const aracDugmesi = (mod: HaritaModu, etiket: string) =>
    el("button", {
      type: "button",
      sinif: "arac-dugme" + (s.mod === mod ? " aktif" : ""),
      disabled: s.turBitti || s.mod === "nokta_secim" || s.mod === "kamera_secim",
      onclick: () => s.onModDegis(s.mod === mod ? "gez" : mod),
    }, etiket);

  return el("div", { sinif: "sekme-icerik harita-sekmesi" },
    el("div", { sinif: "harita-arac" },
      s.bekleyenSorguAdi
        ? el("div", { sinif: "secim-uyari" },
            el("span", {}, `${s.bekleyenSorguAdi}: ${s.mod === "kamera_secim" ? "kamera" : "nokta"} seçin`),
            el("button", { type: "button", onclick: s.onSecimIptal }, "iptal"),
          )
        : el("div", { sinif: "arac-sira" },
            aracDugmesi("raptiye", "Raptiye"),
            aracDugmesi("dislama", "Dışlama"),
            el("button", {
              type: "button", sinif: "arac-dugme",
              onclick: (e: Event) => {
                const p = (e.currentTarget as HTMLElement).closest(".harita-sekmesi")!.querySelector(".katman-paneli") as HTMLElement;
                p.hidden = !p.hidden;
              },
            }, "Katmanlar"),
          ),
    ),
    el("div", { sinif: "harita-alan" }, s.harita.kap, panel),
    el("div", { sinif: "harita-ipucu" }, s.turBitti ? "Tur bitti." : MOD_ACIKLAMALARI[s.mod]),
  );
}

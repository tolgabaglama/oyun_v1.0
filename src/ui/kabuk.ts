// Tur kabuğu: üst şerit, sekme içeriği ve alt sekme çubuğu.

import { el } from "./dom.ts";
import type { UstSerit } from "../app/gorunum.ts";

export type SekmeKimligi = "dosya" | "sorgu" | "pano" | "harita";

export const SEKMELER: { id: SekmeKimligi; ad: string }[] = [
  { id: "dosya", ad: "DOSYA" },
  { id: "sorgu", ad: "SORGU" },
  { id: "pano", ad: "PANO" },
  { id: "harita", ad: "HARİTA" },
];

export function ustSeritCiz(s: UstSerit, onMenu: () => void): HTMLElement {
  return el("header", { sinif: "ust-serit" },
    el("button", { type: "button", sinif: "menu-dugme", title: "Ana ekran", onclick: onMenu }, "≡"),
    el("div", { sinif: "serit-kutu" }, el("span", { sinif: "serit-etiket" }, "PUAN"), el("strong", { sinif: "serit-deger" }, String(s.puan))),
    el("div", { sinif: "serit-kutu" }, el("span", { sinif: "serit-etiket" }, "SORGU"), el("strong", { sinif: "serit-deger" }, String(s.sorgu_sayisi))),
    el("div", { sinif: "serit-kutu" }, el("span", { sinif: "serit-etiket" }, "ZORLUK"), el("strong", { sinif: "serit-deger" }, s.zorluk_adi)),
    s.aday_sayisi !== null && el("div", { sinif: "serit-kutu" }, el("span", { sinif: "serit-etiket" }, "ADAY"), el("strong", { sinif: "serit-deger" }, String(s.aday_sayisi))),
    s.yanlis_tahmin > 0 && el("div", { sinif: "serit-kutu uyari" }, el("span", { sinif: "serit-etiket" }, "YANLIŞ"), el("strong", { sinif: "serit-deger" }, `${s.yanlis_tahmin}/2`)),
  );
}

export function sekmeCubugu(aktif: SekmeKimligi, onSecim: (id: SekmeKimligi) => void): HTMLElement {
  return el("nav", { sinif: "sekme-cubugu" },
    ...SEKMELER.map((s) =>
      el("button", {
        type: "button",
        sinif: "sekme-dugme" + (s.id === aktif ? " aktif" : ""),
        onclick: () => onSecim(s.id),
      }, s.ad),
    ),
  );
}

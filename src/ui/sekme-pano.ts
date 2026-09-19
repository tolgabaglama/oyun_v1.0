// PANO sekmesi: sorgu sonuçlarının ham kayıt dökümü ve oyuncunun not alanı.
// Kesişim hesaplanmaz; kayıtlar olduğu gibi listelenir, çıkarım oyuncuya aittir.

import { el } from "./dom.ts";
import type { SonucGorunumu } from "../app/gorunum.ts";

export interface PanoSekmesiSecenekleri {
  gecmis: SonucGorunumu[];
  notlar: string;
  /** Not değişince çağrılır; ekran yeniden çizilmez, yalnızca kaydedilir. */
  onNotDegisti: (metin: string) => void;
  onHaritayaGit: (sorguId: string) => void;
  /** DOSYA sekmesinden gelindiğinde vurgulanacak sorgu. */
  vurgulu: string | null;
}

/** Zaman ayrı sütunda gösterildiği için metnin başındaki gün ve saat tekrarı kırpılır. */
function kisaMetin(metin: string): string {
  const kirpik = metin.replace(/^\d+\. gün(\s+\d{2}:\d{2})?[:,]?\s*/, "");
  return kirpik.length ? kirpik.charAt(0).toUpperCase() + kirpik.slice(1) : metin;
}

export function sekmePano(s: PanoSekmesiSecenekleri): HTMLElement {
  const notKutusu = el("textarea", {
    rows: "4",
    placeholder: "Notlarınız: çıkarımlar, elenen bölgeler, akla takılanlar...",
    oninput: (e: Event) => s.onNotDegisti((e.currentTarget as HTMLTextAreaElement).value),
  });
  notKutusu.value = s.notlar;

  // Geçmiş en yeniden eskiye gelir; pano da öyle gösterir, en son sorgu en üstte.
  const bloklar = s.gecmis.map((g) => {
    const kayitlar = [...g.kayitlar].sort((a, b) => a.gun - b.gun || a.saat.localeCompare(b.saat));
    const blok = el("section", { sinif: "pano-blok" + (g.sorgu_id === s.vurgulu ? " vurgulu" : "") },
      el("div", { sinif: "pano-baslik" },
        el("span", { sinif: "dokum-sira" }, g.sorgu_id),
        el("span", { sinif: "pano-ad" }, g.sensor_adi),
        el("button", { type: "button", sinif: "pano-harita-dugme", onclick: () => s.onHaritayaGit(g.sorgu_id) }, "haritada"),
      ),
      el("div", { sinif: "pano-alt" },
        `${g.kurum} · ${g.bos ? "kayıt yok" : `${g.kayitlar.length} kayıt`}${g.parametre_metni ? ` · ${g.parametre_metni}` : ""}`,
      ),
      g.bos
        ? el("p", { sinif: "bos-metin" }, "Bu sorgu kayıt döndürmedi.")
        : el("table", { sinif: "kayit-tablo" },
            el("tbody", {},
              ...kayitlar.map((k) =>
                el("tr", {},
                  el("td", { sinif: "kayit-zaman" }, `${k.gun}. gün`),
                  el("td", { sinif: "kayit-saat" }, k.saat),
                  el("td", { sinif: "kayit-metin" }, kisaMetin(k.metin)),
                ),
              ),
            ),
          ),
    );
    return blok;
  });

  const kok = el("div", { sinif: "sekme-icerik pano-sekmesi" },
    el("section", { sinif: "bolum not-bolumu" },
      el("h2", {}, "NOT DEFTERİ"),
      notKutusu,
      el("p", { sinif: "ipucu" }, "Notlar dava ile birlikte saklanır. Sistem kesişim hesaplamaz, çıkarım size aittir."),
    ),
    s.gecmis.length === 0
      ? el("p", { sinif: "bos-metin orta" }, "Pano boş. SORGU sekmesinden bir sorgu yapın.")
      : el("div", { sinif: "pano-listesi" }, ...bloklar),
  );

  if (s.vurgulu) {
    // Vurgulu blok görünür alana getirilir.
    setTimeout(() => kok.querySelector(".pano-blok.vurgulu")?.scrollIntoView({ block: "start" }), 0);
  }
  return kok;
}

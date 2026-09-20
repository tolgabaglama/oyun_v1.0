// PANO sekmesi: sorgu sonuçlarının ham kayıt dökümü ve oyuncunun not alanı.
// Kesişim hesaplanmaz; kayıtlar olduğu gibi listelenir, çıkarım oyuncuya aittir.

import { el } from "./dom.ts";
import type { SonucGorunumu } from "../app/gorunum.ts";

export type PanoSiralamasi = "sensore_gore" | "kronolojik";

export interface PanoSekmesiSecenekleri {
  gecmis: SonucGorunumu[];
  siralama: PanoSiralamasi;
  onSiralamaDegis: (s: PanoSiralamasi) => void;
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

  const siralamaCubugu = el("div", { sinif: "siralama-cubugu" },
    el("span", { sinif: "siralama-etiket" }, "SIRALAMA"),
    el("button", {
      type: "button", sinif: "siralama-dugme" + (s.siralama === "sensore_gore" ? " aktif" : ""),
      onclick: () => s.onSiralamaDegis("sensore_gore"),
    }, "Sensöre göre"),
    el("button", {
      type: "button", sinif: "siralama-dugme" + (s.siralama === "kronolojik" ? " aktif" : ""),
      onclick: () => s.onSiralamaDegis("kronolojik"),
    }, "Zaman sırası"),
  );

  // Kronolojik görünüm: tüm sorguların kayıtları tek listede, en yeni kayıt üstte.
  const kronolojikListe = () => {
    const hepsi = s.gecmis.flatMap((g) => g.kayitlar.map((k) => ({ k, g })));
    hepsi.sort((a, b) => b.k.gun - a.k.gun || b.k.saat.localeCompare(a.k.saat));
    if (!hepsi.length) return el("p", { sinif: "bos-metin orta" }, "Kayıt yok.");
    return el("table", { sinif: "kayit-tablo kronolojik" },
      el("tbody", {},
        ...hepsi.map(({ k, g }) =>
          el("tr", {},
            el("td", { sinif: "kayit-zaman" }, k.gorece_zaman ?? "sabit kayıt"),
            el("td", { sinif: "kayit-metin" },
              el("span", { sinif: "kayit-kaynak" }, g.sorgu_id),
              el("span", {}, kisaMetin(k.metin)),
              k.konum_metni && el("span", { sinif: "kayit-konum" }, k.konum_metni),
            ),
          ),
        ),
      ),
    );
  };

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
                  el("td", { sinif: "kayit-zaman" }, k.gorece_zaman ?? "sabit"),
                  el("td", { sinif: "kayit-metin" },
                    el("span", {}, kisaMetin(k.metin)),
                    k.konum_metni && el("span", { sinif: "kayit-konum" }, k.konum_metni),
                  ),
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
      el("p", { sinif: "ipucu" }, "Notlar dosya ile birlikte saklanır. Sistem kesişim hesaplamaz, çıkarım size aittir."),
    ),
    s.gecmis.length === 0
      ? el("p", { sinif: "bos-metin orta" }, "Pano boş. SORGU sekmesinden bir sorgu yapın.")
      : el("div", {}, siralamaCubugu,
          s.siralama === "kronolojik"
            ? el("div", { sinif: "pano-listesi" }, el("section", { sinif: "pano-blok" }, kronolojikListe()))
            : el("div", { sinif: "pano-listesi" }, ...bloklar)),
  );

  if (s.vurgulu) {
    // Vurgulu blok görünür alana getirilir.
    setTimeout(() => kok.querySelector(".pano-blok.vurgulu")?.scrollIntoView({ block: "start" }), 0);
  }
  return kok;
}

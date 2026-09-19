// DOSYA sekmesi: hedefin künyesi, ihbar notu ve yapılan sorguların dökümü.

import { el } from "./dom.ts";
import type { DosyaGorunumu, SonucGorunumu, UstSerit } from "../app/gorunum.ts";
import { TAVAN_PUAN } from "../app/oturum.ts";

export interface DosyaSekmesiSecenekleri {
  dosya: DosyaGorunumu;
  onSeedKopyala: () => void;
  gecmis: SonucGorunumu[];
  serit: UstSerit;
  /** Sorgu satırına basınca o sorgunun kayıtlarına gitmek için. */
  onSorguSec: (sorguId: string) => void;
}

function alanSatiri(etiket: string, deger: string): HTMLElement {
  return el("div", { sinif: "alan-satiri" },
    el("span", { sinif: "alan-etiket" }, etiket),
    el("span", { sinif: "alan-deger" }, deger),
  );
}

export function sekmeDosya(s: DosyaSekmesiSecenekleri): HTMLElement {
  const { dosya, gecmis, serit } = s;
  // Geçmiş en yeniden eskiye gelir; dökümde sorgu sırasına göre gösterilir.
  const sirali = [...gecmis].reverse();
  const toplamMaliyet = sirali.reduce((t, g) => t + g.maliyet, 0);

  return el("div", { sinif: "sekme-icerik dosya-sekmesi" },
    el("div", { sinif: "su-an-serit" },
      el("span", { sinif: "su-an-etiket" }, "ŞU AN"),
      el("strong", {}, dosya.su_an_metni),
    ),
    el("section", { sinif: "bolum" },
      el("h2", {}, `DAVA ${String(dosya.seed).padStart(4, "0")} / ${dosya.zorluk_adi.toUpperCase()}`),
      el("div", { sinif: "seed-satiri" },
        el("span", {}, "Dava numarası: ", el("strong", {}, String(dosya.seed))),
        el("button", { type: "button", sinif: "kopyala-dugme", onclick: s.onSeedKopyala }, "kopyala"),
      ),
      alanSatiri("Ad soyad", dosya.ad),
      alanSatiri("Yaş", String(dosya.yas)),
      el("div", { sinif: "ihbar-kutu" },
        el("div", { sinif: "ihbar-baslik" }, "İHBAR NOTU"),
        el("p", { sinif: "ihbar-metin" }, dosya.ihbar_notu || "Not girilmemiş."),
      ),
      el("p", { sinif: "ipucu" }, "İhbar notundaki bilgi eksik olabilir, bazen yanlıştır."),
    ),

    el("section", { sinif: "bolum" },
      el("h2", {}, `YAPILAN SORGULAR (${sirali.length})`),
      sirali.length === 0
        ? el("p", { sinif: "bos-metin" }, "Henüz sorgu yapılmadı. SORGU sekmesinden başlayın.")
        : el("div", { sinif: "sorgu-dokum" },
            ...sirali.map((g) =>
              el("button", { type: "button", sinif: "dokum-satiri", onclick: () => s.onSorguSec(g.sorgu_id) },
                el("span", { sinif: "dokum-sira" }, g.sorgu_id),
                el("span", { sinif: "dokum-orta" },
                  el("span", { sinif: "dokum-ad" }, g.sensor_adi),
                  el("span", { sinif: "dokum-alt" },
                    `${g.kurum} · ${g.bos ? "kayıt yok" : `${g.kayitlar.length} kayıt`}${g.parametre_metni ? ` · ${g.parametre_metni}` : ""}`,
                  ),
                ),
                el("span", { sinif: "dokum-maliyet" + (g.ucretsiz_tekrar ? " ucretsiz" : "") },
                  g.ucretsiz_tekrar ? "tekrar" : `-${g.maliyet}`),
              ),
            ),
          ),
      el("div", { sinif: "hesap-satiri" },
        el("span", {}, "Tavan puan"), el("strong", {}, String(TAVAN_PUAN)),
      ),
      el("div", { sinif: "hesap-satiri" },
        el("span", {}, "Sorgu gideri"), el("strong", {}, toplamMaliyet ? `-${toplamMaliyet}` : "0"),
      ),
      serit.yanlis_tahmin > 0 && el("div", { sinif: "hesap-satiri" },
        el("span", {}, `Yanlış tahmin (${serit.yanlis_tahmin})`), el("strong", {}, `-${serit.yanlis_tahmin * 250}`),
      ),
      el("div", { sinif: "hesap-satiri toplam" },
        el("span", {}, "Kalan puan"), el("strong", {}, String(serit.puan)),
      ),
    ),
  );
}

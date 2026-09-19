// SORGU sekmesi: sensörler kademeye göre gruplu liste.
// Sorgu penceresi main.ts'te tutulur, çünkü haritadan nokta seçildikten sonra geri açılır.

import { el } from "./dom.ts";
import { KADEME_ADLARI, type SensorGorunumu } from "../app/gorunum.ts";

export interface SorguSekmesiSecenekleri {
  sensorler: SensorGorunumu[];
  onSensorSec: (sensorId: string) => void;
  turBitti: boolean;
}

export function sekmeSorgu(s: SorguSekmesiSecenekleri): HTMLElement {
  const kok = el("div", { sinif: "sekme-icerik sorgu-sekmesi" });

  for (const kademe of [1, 2, 3, 4]) {
    const grup = s.sensorler.filter((x) => x.kademe === kademe);
    if (!grup.length) continue;
    kok.append(
      el("div", { sinif: "kademe-baslik" },
        el("span", {}, `KADEME ${kademe} · ${KADEME_ADLARI[kademe]}`),
        el("span", { sinif: "kademe-maliyet" }, `${grup[0].maliyet} puan`),
      ),
      el("div", { sinif: "sensor-listesi" },
        ...grup.map((x) => {
          const parametreli = x.parametreler.length > 0;
          // Parametresiz sensörün tekrarı ücretsizdir; parametrelide her yeni seçim tam ücrete tabidir.
          const ucretEtiketi = x.sorulmus ? "tekrar" : `${x.maliyet}p`;
          const altMetin = [
            x.kurum,
            x.kapsam_metni,
            x.varyant !== "tek sorgu" ? `${x.varyant} varyant` : null,
            parametreli && x.yapilan_sorgu_sayisi > 0 ? `${x.yapilan_sorgu_sayisi} sorgu yapıldı` : null,
            x.es_varyant ? `eşi: ${x.es_varyant.ad} (${x.es_varyant.maliyet}p)` : null,
          ].filter(Boolean).join(" · ");
          return el("button", {
            type: "button",
            sinif: "sensor-satiri" + (x.kapali_sebep ? " kapali" : "") + (x.sorulmus ? " sorulmus" : ""),
            disabled: Boolean(x.kapali_sebep) || s.turBitti,
            onclick: () => s.onSensorSec(x.id),
          },
            el("span", { sinif: "sensor-orta" },
              el("span", { sinif: "sensor-ad" }, x.ad),
              el("span", { sinif: "sensor-alt" }, altMetin),
              x.kapali_sebep && el("span", { sinif: "sensor-kapali" }, x.kapali_sebep),
            ),
            el("span", { sinif: "sensor-maliyet" + (x.sorulmus ? " ucretsiz" : "") }, ucretEtiketi),
          );
        }),
      ),
    );
  }
  return kok;
}

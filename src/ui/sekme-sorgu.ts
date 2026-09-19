// SORGU sekmesi: sensörler kademeye göre gruplu liste, sorgu onayı ve sonuç penceresi.

import { el } from "./dom.ts";
import { KADEME_ADLARI, type ParametreGorunumu, type SensorGorunumu, type SonucGorunumu } from "../app/gorunum.ts";

export interface SorguSekmesiSecenekleri {
  sensorler: SensorGorunumu[];
  /** Sorguyu yapar; parametreler eksikse hata fırlatır. */
  onSorgula: (sensorId: string, parametreler: Record<string, string | number>) => SonucGorunumu;
  /** Haritadan nokta seçimi gerektiğinde çağrılır. */
  onNoktaSec: (sensorId: string, mevcut: Record<string, string | number>) => void;
  turBitti: boolean;
}

/** Sorgu onay ve parametre penceresi. */
function sorguPenceresi(s: SensorGorunumu, secenekler: SorguSekmesiSecenekleri, kapat: () => void): HTMLElement {
  const degerler: Record<string, string | number> = {};
  const noktaGerekli = s.parametreler.some((p) => p.tip === "poi");

  const alan = (p: ParametreGorunumu): HTMLElement => {
    if (p.tip === "poi") {
      return el("div", { sinif: "parametre-alani" },
        el("label", {}, p.etiket),
        el("p", { sinif: "ipucu" }, "Sorgulanacak noktayı haritadan seçmeniz gerekiyor."),
        el("button", { type: "button", sinif: "genis", onclick: () => { kapat(); secenekler.onNoktaSec(s.id, degerler); } },
          "Haritadan nokta seç"),
      );
    }
    const kutu = el("select", { onchange: (e: Event) => { degerler[p.ad] = (e.currentTarget as HTMLSelectElement).value; } },
      ...(p.secenekler ?? []).map((o) => el("option", { value: o.deger }, o.etiket)),
    );
    if (p.secenekler?.length) degerler[p.ad] = p.secenekler[0].deger;
    return el("div", { sinif: "parametre-alani" }, el("label", {}, p.etiket), kutu);
  };

  const govde = el("div", { sinif: "pencere-govde" },
    el("p", { sinif: "pencere-alt" }, `${s.kurum} · Kademe ${s.kademe} · ${s.kapsam_metni}`),
    el("p", { sinif: "pencere-aciklama" }, `Sonuç haritada ${s.ayak_izi_metni} olarak görünür.`),
    ...s.parametreler.map(alan),
    el("div", { sinif: "maliyet-kutu" },
      s.sorulmus
        ? el("span", { sinif: "ucretsiz" }, "Bu sorgu daha önce yapıldı, tekrarı ücretsizdir.")
        : el("span", {}, "Veri maliyeti: ", el("strong", {}, `${s.maliyet} puan`)),
    ),
  );

  const dugmeler = el("div", { sinif: "dugme-sira" },
    el("button", { type: "button", onclick: kapat }, "Vazgeç"),
    !noktaGerekli && el("button", {
      type: "button", sinif: "birincil",
      onclick: () => {
        try {
          secenekler.onSorgula(s.id, degerler);
          kapat();
        } catch (e) {
          govde.append(el("div", { sinif: "hata-kutu" }, (e as Error).message));
        }
      },
    }, "Sorgula"),
  );

  return el("div", { sinif: "pencere-perde", onclick: (e: Event) => { if (e.target === e.currentTarget) kapat(); } },
    el("div", { sinif: "pencere" },
      el("div", { sinif: "pencere-baslik" }, s.ad),
      govde,
      dugmeler,
    ),
  );
}

/** Sorgu sonucu penceresi. */
export function sonucPenceresi(sonuc: SonucGorunumu, kapat: () => void, onHaritayaGit: (id: string) => void): HTMLElement {
  return el("div", { sinif: "pencere-perde", onclick: (e: Event) => { if (e.target === e.currentTarget) kapat(); } },
    el("div", { sinif: "pencere" },
      el("div", { sinif: "pencere-baslik" }, `${sonuc.sorgu_id} · ${sonuc.sensor_adi}`),
      el("div", { sinif: "pencere-govde" },
        el("p", { sinif: "pencere-alt" }, `${sonuc.kurum} · ${sonuc.aciklama}${sonuc.ucretsiz_tekrar ? " · tekrar, ücretsiz" : ""}`),
        sonuc.bos
          ? el("p", { sinif: "bos-metin" }, "Bu sorgu kayıt döndürmedi. Boş sonuç da bir bilgidir.")
          : el("ul", { sinif: "kayit-listesi" },
              ...sonuc.kayitlar.slice(0, 40).map((k) => el("li", {}, k.metin)),
            ),
        sonuc.kayitlar.length > 40 && el("p", { sinif: "ipucu" }, `İlk 40 kayıt gösterildi, tamamı PANO sekmesinde.`),
      ),
      el("div", { sinif: "dugme-sira" },
        el("button", { type: "button", onclick: kapat }, "Kapat"),
        !sonuc.bos && el("button", { type: "button", sinif: "birincil", onclick: () => { kapat(); onHaritayaGit(sonuc.sorgu_id); } }, "Haritada göster"),
      ),
    ),
  );
}

export function sekmeSorgu(s: SorguSekmesiSecenekleri): HTMLElement {
  const kok = el("div", { sinif: "sekme-icerik sorgu-sekmesi" });
  const kademeler = [1, 2, 3, 4];
  for (const kademe of kademeler) {
    const grup = s.sensorler.filter((x) => x.kademe === kademe);
    if (!grup.length) continue;
    const maliyet = grup[0].maliyet;
    kok.append(
      el("div", { sinif: "kademe-baslik" },
        el("span", {}, `KADEME ${kademe} · ${KADEME_ADLARI[kademe]}`),
        el("span", { sinif: "kademe-maliyet" }, `${maliyet} puan`),
      ),
      el("div", { sinif: "sensor-listesi" },
        ...grup.map((x) =>
          el("button", {
            type: "button",
            sinif: "sensor-satiri" + (x.kapali_sebep ? " kapali" : "") + (x.sorulmus ? " sorulmus" : ""),
            disabled: Boolean(x.kapali_sebep) || s.turBitti,
            onclick: () => {
              const pencere: HTMLElement = sorguPenceresi(x, s, () => pencere.remove());
              kok.append(pencere);
            },
          },
            el("span", { sinif: "sensor-orta" },
              el("span", { sinif: "sensor-ad" }, x.ad),
              el("span", { sinif: "sensor-alt" },
                `${x.kurum} · ${x.kapsam_metni}${x.varyant !== "tek sorgu" ? ` · ${x.varyant} varyant` : ""}${x.es_varyant ? ` · eşi: ${x.es_varyant.ad} (${x.es_varyant.maliyet}p)` : ""}`,
              ),
              x.kapali_sebep && el("span", { sinif: "sensor-kapali" }, x.kapali_sebep),
            ),
            el("span", { sinif: "sensor-maliyet" }, x.sorulmus ? "tekrar" : `${x.maliyet}p`),
          ),
        ),
      ),
    );
  }
  return kok;
}

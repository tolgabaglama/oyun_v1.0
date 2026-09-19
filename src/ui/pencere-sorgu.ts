// Sorgu onay penceresi. Parametreler doldurulur, seçilen nokta gösterilir, ücret canlı hesaplanır.

import { el } from "./dom.ts";
import type { ParametreGorunumu, SensorGorunumu, SonucGorunumu } from "../app/gorunum.ts";

export interface SorguPenceresiSecenekleri {
  sensor: SensorGorunumu;
  /** Şimdiye kadar doldurulmuş parametreler; haritadan dönünce korunur. */
  degerler: Record<string, string | number>;
  /** Seçilen nokta veya kameranın okunur adı. */
  secimAdi: (ad: string, deger: string) => string;
  /** Bu parametrelerle sorgu daha önce yapıldı mı. */
  ucretsizMi: (degerler: Record<string, string | number>) => boolean;
  onHaritadanSec: (parametreAdi: string, tip: "poi" | "kamera") => void;
  onSorgula: (degerler: Record<string, string | number>) => void;
  onKapat: () => void;
}

export function sorguPenceresi(s: SorguPenceresiSecenekleri): HTMLElement {
  const { sensor } = s;
  const degerler: Record<string, string | number> = { ...s.degerler };
  const maliyetKutusu = el("div", { sinif: "maliyet-kutu" });
  const eksikUyari = el("p", { sinif: "eksik-uyari", hidden: true }, "Sorgu için seçim yapılmalı.");

  const maliyetiTazele = () => {
    const ucretsiz = s.ucretsizMi(degerler);
    maliyetKutusu.replaceChildren(
      ucretsiz
        ? el("span", { sinif: "ucretsiz" }, "Bu sorgu aynı seçimlerle daha önce yapıldı, tekrarı ücretsizdir.")
        : el("span", {}, "Veri maliyeti: ", el("strong", {}, `${sensor.maliyet} puan`)),
    );
  };

  const eksikler = () => sensor.parametreler.filter((p) => p.zorunlu && degerler[p.ad] === undefined);

  const alan = (p: ParametreGorunumu): HTMLElement => {
    if (p.tip === "poi" || p.tip === "kamera") {
      const secili = degerler[p.ad];
      return el("div", { sinif: "parametre-alani" },
        el("label", {}, p.etiket),
        secili !== undefined
          ? el("div", { sinif: "secim-kutu" },
              el("span", { sinif: "secim-metni" }, s.secimAdi(p.ad, String(secili))),
              el("button", { type: "button", sinif: "secim-degistir", onclick: () => s.onHaritadanSec(p.ad, p.tip as "poi" | "kamera") }, "değiştir"),
            )
          : el("button", { type: "button", sinif: "genis", onclick: () => s.onHaritadanSec(p.ad, p.tip as "poi" | "kamera") },
              p.tip === "kamera" ? "Haritadan kamera seç" : "Haritadan nokta seç"),
      );
    }
    const kutu = el("select", {
      onchange: (e: Event) => {
        degerler[p.ad] = (e.currentTarget as HTMLSelectElement).value;
        maliyetiTazele();
      },
    }, ...(p.secenekler ?? []).map((o) => el("option", {
      value: o.deger,
      selected: (degerler[p.ad] !== undefined ? String(degerler[p.ad]) : p.varsayilan ?? p.secenekler?.[0]?.deger) === o.deger,
    }, o.etiket)));
    if (degerler[p.ad] === undefined && p.secenekler?.length) degerler[p.ad] = p.varsayilan ?? p.secenekler[0].deger;
    return el("div", { sinif: "parametre-alani" }, el("label", {}, p.etiket), kutu);
  };

  const govde = el("div", { sinif: "pencere-govde" },
    el("p", { sinif: "pencere-alt" }, `${sensor.kurum} · Kademe ${sensor.kademe} · ${sensor.kapsam_metni}`),
    el("p", { sinif: "pencere-aciklama" }, `Sonuç haritada ${sensor.ayak_izi_metni} olarak görünür.`),
    ...sensor.parametreler.map(alan),
    eksikUyari,
    maliyetKutusu,
  );
  maliyetiTazele();

  return el("div", { sinif: "pencere-perde", onclick: (e: Event) => { if (e.target === e.currentTarget) s.onKapat(); } },
    el("div", { sinif: "pencere" },
      el("div", { sinif: "pencere-baslik" }, sensor.ad),
      govde,
      el("div", { sinif: "dugme-sira" },
        el("button", { type: "button", onclick: s.onKapat }, "Vazgeç"),
        el("button", {
          type: "button", sinif: "birincil",
          onclick: () => {
            if (eksikler().length) { eksikUyari.hidden = false; return; }
            s.onSorgula(degerler);
          },
        }, "Sorgula"),
      ),
    ),
  );
}

/** Sorgu sonucu penceresi. */
export function sonucPenceresi(sonuc: SonucGorunumu, kapat: () => void, onHaritayaGit: (id: string) => void): HTMLElement {
  return el("div", { sinif: "pencere-perde", onclick: (e: Event) => { if (e.target === e.currentTarget) kapat(); } },
    el("div", { sinif: "pencere" },
      el("div", { sinif: "pencere-baslik" }, `${sonuc.sorgu_id} · ${sonuc.sensor_adi}`),
      el("div", { sinif: "pencere-govde" },
        el("p", { sinif: "pencere-alt" },
          `${sonuc.kurum} · ${sonuc.aciklama}${sonuc.ucretsiz_tekrar ? " · tekrar, ücretsiz" : ` · ${sonuc.maliyet} puan`}`),
        sonuc.parametre_metni && el("p", { sinif: "pencere-aciklama" }, sonuc.parametre_metni),
        sonuc.bos
          ? el("p", { sinif: "bos-metin" }, "Bu sorgu kayıt döndürmedi. Boş sonuç da bir bilgidir.")
          : el("ul", { sinif: "kayit-listesi" },
              ...sonuc.kayitlar.slice(0, 40).map((k) =>
                el("li", {},
                  k.gorece_zaman ? el("span", { sinif: "kayit-gorece" }, k.gorece_zaman) : null,
                  el("span", {}, k.metin),
                  k.konum_metni && el("span", { sinif: "kayit-konum" }, k.konum_metni),
                ),
              ),
            ),
        sonuc.kayitlar.length > 40 && el("p", { sinif: "ipucu" }, "İlk 40 kayıt gösterildi, tamamı PANO sekmesinde."),
      ),
      el("div", { sinif: "dugme-sira" },
        el("button", { type: "button", onclick: kapat }, "Kapat"),
        !sonuc.bos && el("button", { type: "button", sinif: "birincil", onclick: () => { kapat(); onHaritayaGit(sonuc.sorgu_id); } }, "Haritada göster"),
      ),
    ),
  );
}

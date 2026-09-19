// Tur sonu ekranı: sonuç, puan dökümü, par karşılaştırması ve farkındalık özeti.

import { el } from "./dom.ts";
import { TAVAN_PUAN } from "../app/oturum.ts";
import type { TurSonuGorunumu } from "../app/gorunum.ts";

export interface TurSonuSecenekleri {
  ozet: TurSonuGorunumu;
  hedefAdi: string;
  seed: number;
  onSeedKopyala: () => void;
  onHaritayiIncele: () => void;
  onYeniDava: () => void;
  onAnaEkran: () => void;
}

function satir(etiket: string, deger: string, sinif = ""): HTMLElement {
  return el("div", { sinif: `hesap-satiri ${sinif}` }, el("span", {}, etiket), el("strong", {}, deger));
}

export function ekranTurSonu(s: TurSonuSecenekleri): HTMLElement {
  const o = s.ozet;
  const basarili = o.sonuc === "dogru";

  return el("div", { sinif: "ekran tur-sonu-ekrani" },
    el("header", { sinif: "sonuc-baslik" + (basarili ? " basarili" : " basarisiz") },
      el("div", { sinif: "sonuc-etiket" }, basarili ? "DOSYA KAPANDI" : "DOSYA DÜŞTÜ"),
      el("h1", {}, basarili ? "HEDEF BULUNDU" : "HEDEF BULUNAMADI"),
      el("div", { sinif: "sonuc-alt" }, `${s.hedefAdi} · ${o.gercek_yer_metni}`),
    ),

    el("div", { sinif: "seed-serit" },
      el("span", {}, "Dava numarası: ", el("strong", {}, String(s.seed))),
      el("button", { type: "button", sinif: "kopyala-dugme", onclick: s.onSeedKopyala }, "kopyala"),
    ),

    el("div", { sinif: "sonuc-govde" },
      el("section", { sinif: "bolum" },
        el("h2", {}, "PUAN"),
        satir("Tavan puan", String(TAVAN_PUAN)),
        satir(`Sorgu gideri (${o.sorgu_sayisi} sorgu)`, o.sorgu_maliyeti ? `-${o.sorgu_maliyeti}` : "0"),
        o.yanlis_tahmin > 0 && satir(`Yanlış tahmin (${o.yanlis_tahmin})`, `-${o.ceza}`),
        satir("Kazanılan puan", String(o.puan), "toplam"),
      ),

      el("section", { sinif: "bolum" },
        el("h2", {}, "PAR KARŞILAŞTIRMASI"),
        el("p", { sinif: "par-metni" }, o.par_metni),
        satir("Bu davanın par değeri", `${o.par} puan gider`),
        satir("Sizin gideriniz", `${o.sorgu_maliyeti + o.ceza} puan`),
        el("div", { sinif: "par-yolu" },
          el("div", { sinif: "par-yolu-baslik" }, "EN VERİMLİ YOL"),
          ...o.par_yolu.map((a, i) =>
            el("div", { sinif: "par-adim" },
              el("span", { sinif: "par-sira" }, String(i + 1)),
              el("span", { sinif: "par-ad" }, a.sensor_adi),
              el("span", { sinif: "par-maliyet" }, `${a.maliyet}p`),
              el("span", { sinif: "par-aday" }, `${a.kalan_aday} aday`),
            ),
          ),
        ),
        el("p", { sinif: "ipucu" }, "Par yalnızca kesin kanıtları sayar. Davranış çıkarımıyla par'ın altına inebilirsiniz."),
      ),

      el("section", { sinif: "bolum farkindalik" },
        el("h2", {}, "DİJİTAL İZ"),
        el("p", { sinif: "farkindalik-cumle" }, o.farkindalik_cumlesi),
        el("table", { sinif: "kaynak-tablo" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Kaynak"), el("th", {}, "Bıraktığı"), el("th", {}, "Baktığınız"),
          )),
          el("tbody", {},
            ...o.kaynaga_gore.map((k) =>
              el("tr", { sinif: k.kullanilan > 0 ? "kullanildi" : "" },
                el("td", {}, el("span", { sinif: "kaynak-ad" }, k.sensor_adi), el("span", { sinif: "kaynak-kurum" }, k.kurum)),
                el("td", { sinif: "sayi" }, String(k.toplam)),
                el("td", { sinif: "sayi" }, k.kullanilan > 0 ? String(k.kullanilan) : "-"),
              ),
            ),
          ),
        ),
        el("p", { sinif: "ipucu" }, "Bu kayıtların tamamı kurgusaldır. Gerçek hayatta benzer kayıtlar farklı kurumlarda tutulur."),
      ),
    ),

    el("footer", { sinif: "sonuc-alt-cubuk" },
      el("button", { type: "button", onclick: s.onHaritayiIncele }, "Haritayı incele"),
      el("button", { type: "button", sinif: "birincil", onclick: s.onYeniDava }, "Yeni dava"),
    ),
  );
}

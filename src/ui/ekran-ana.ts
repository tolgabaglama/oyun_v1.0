// Ana ekran: yeni tur (zorluk ve seed), yarım kalan tura devam.

import { el } from "./dom.ts";
import { ZORLUK_ADLARI, type Zorluk } from "../app/gorunum.ts";

export interface AnaEkranSecenekleri {
  sonZorluk: Zorluk;
  sonSeed: number;
  devamEdenVar: boolean;
  devamOzeti: string;
  onBaslat: (seed: number, zorluk: Zorluk) => void;
  onDevam: () => void;
  onSil: () => void;
}

const ZORLUK_ACIKLAMALARI: Record<Zorluk, string> = {
  kolay: "Kalan aday sayısı görünür. Hedef evinde.",
  standart: "Aday sayısı görünmez. Hedef işinde veya üçüncü noktasında.",
  uzman: "Kademe 4 sensörler kapalı. Hedef rutin dışı bir yerde.",
};

export function anaEkran(s: AnaEkranSecenekleri): HTMLElement {
  let zorluk: Zorluk = s.sonZorluk;
  const seedKutusu = el("input", { type: "number", min: "1", max: "999999", value: String(s.sonSeed), id: "seed-kutusu" });

  const aciklama = el("p", { sinif: "zorluk-aciklama" }, ZORLUK_ACIKLAMALARI[zorluk]);
  const dugmeler = (["kolay", "standart", "uzman"] as Zorluk[]).map((z) =>
    el("button", {
      type: "button",
      sinif: "zorluk-dugme" + (z === zorluk ? " secili" : ""),
      onclick: (e: Event) => {
        zorluk = z;
        aciklama.textContent = ZORLUK_ACIKLAMALARI[z];
        for (const d of (e.currentTarget as HTMLElement).parentElement!.children) d.classList.remove("secili");
        (e.currentTarget as HTMLElement).classList.add("secili");
      },
    }, ZORLUK_ADLARI[z]),
  );

  return el("div", { sinif: "ekran ana-ekran" },
    el("header", { sinif: "ana-baslik" },
      el("div", { sinif: "ana-kurum" }, "T.C. SİBER İSTİHBARAT"),
      el("h1", {}, "MOBİL SORGU"),
      el("div", { sinif: "ana-surum" }, "Sürüm 0.1 / Saha testi"),
    ),
    s.devamEdenVar && el("section", { sinif: "bolum" },
      el("h2", {}, "Yarım kalan dava"),
      el("p", { sinif: "devam-ozeti" }, s.devamOzeti),
      el("div", { sinif: "dugme-sira" },
        el("button", { type: "button", sinif: "birincil", onclick: s.onDevam }, "Devam et"),
        el("button", { type: "button", onclick: s.onSil }, "Dosyayı kapat"),
      ),
    ),
    el("section", { sinif: "bolum" },
      el("h2", {}, "Yeni dava"),
      el("label", { for: "zorluk" }, "Zorluk"),
      el("div", { sinif: "zorluk-sira", id: "zorluk" }, ...dugmeler),
      aciklama,
      el("label", { for: "seed-kutusu" }, "Dava numarası"),
      seedKutusu,
      el("p", { sinif: "ipucu" }, "Aynı numara her zaman aynı davayı verir. Numara çözülemeyen bir dava üretirse sonraki numaraya geçilir."),
      el("button", {
        type: "button",
        sinif: "birincil genis",
        onclick: () => s.onBaslat(Math.max(1, Number(seedKutusu.value) || 1), zorluk),
      }, "Dosyayı aç"),
    ),
    el("footer", { sinif: "ana-alt" }, "Tüm kişiler, kurumlar ve kayıtlar kurgusaldır."),
  );
}

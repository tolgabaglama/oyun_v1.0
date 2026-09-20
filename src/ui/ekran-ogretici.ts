// Öğretici ekranı. Metin docs/tutorial_metni.md dosyasından okunur, tek kaynak orasıdır.
// Oyuncuya yalnızca kural bölümleri gösterilir; dosyanın sonundaki geliştirme notları atlanır.

import ogreticiMetni from "../../docs/tutorial_metni.md?raw";
import { el } from "./dom.ts";

/** Geliştirme notlarının başladığı başlık; bu satırdan sonrası oyuncuya gösterilmez. */
const NOT_BASLIGI = "# Kafa karıştırıcı bulduğum kurallar";

interface Bolum {
  baslik: string;
  satirlar: string[];
}

function bolumlereAyir(metin: string): Bolum[] {
  const kesik = metin.split(NOT_BASLIGI)[0];
  const bolumler: Bolum[] = [];
  for (const satir of kesik.split("\n")) {
    if (satir.startsWith("## ")) bolumler.push({ baslik: satir.slice(3).trim(), satirlar: [] });
    else if (bolumler.length) bolumler.at(-1)!.satirlar.push(satir);
  }
  return bolumler;
}

/** Kalın işaretini ögeye çevirir; başka biçimlendirme kullanılmaz. */
function kalinliAyir(metin: string): (HTMLElement | string)[] {
  return metin.split(/\*\*(.+?)\*\*/g).map((parca, i) => (i % 2 === 1 ? el("strong", {}, parca) : parca));
}

function tabloCiz(satirlar: string[]): HTMLElement {
  const hucreler = (s: string) => s.split("|").slice(1, -1).map((h) => h.trim());
  const baslik = hucreler(satirlar[0]);
  const govde = satirlar.slice(2).map(hucreler);
  return el("table", { sinif: "ogretici-tablo" },
    el("thead", {}, el("tr", {}, ...baslik.map((h) => el("th", {}, h)))),
    el("tbody", {}, ...govde.map((satir) => el("tr", {}, ...satir.map((h) => el("td", {}, ...kalinliAyir(h)))))),
  );
}

/** Bölüm gövdesini paragraf, liste ve tabloya çevirir. */
function govdeCiz(satirlar: string[]): HTMLElement {
  const kap = el("div", { sinif: "ogretici-govde" });
  let liste: string[] = [];
  let tablo: string[] = [];
  let paragraf: string[] = [];

  const paragrafiBitir = () => {
    if (paragraf.length) kap.append(el("p", {}, ...kalinliAyir(paragraf.join(" "))));
    paragraf = [];
  };
  const listeyiBitir = () => {
    if (liste.length) kap.append(el("ul", {}, ...liste.map((x) => el("li", {}, ...kalinliAyir(x)))));
    liste = [];
  };
  const tabloyuBitir = () => {
    if (tablo.length >= 2) kap.append(tabloCiz(tablo));
    tablo = [];
  };

  for (const ham of satirlar) {
    const satir = ham.trim();
    if (satir.startsWith("|")) { paragrafiBitir(); listeyiBitir(); tablo.push(satir); continue; }
    tabloyuBitir();
    if (satir.startsWith("- ")) { paragrafiBitir(); liste.push(satir.slice(2)); continue; }
    listeyiBitir();
    if (!satir) { paragrafiBitir(); continue; }
    paragraf.push(satir);
  }
  paragrafiBitir();
  listeyiBitir();
  tabloyuBitir();
  return kap;
}

export interface OgreticiSecenekleri {
  /** Kapatınca çağrılır; ilk açılışta oyuna, menüden açıldığında menüye döner. */
  onKapat: () => void;
  kapatmaEtiketi: string;
}

export function ekranOgretici(s: OgreticiSecenekleri): HTMLElement {
  const bolumler = bolumlereAyir(ogreticiMetni);
  let sayfa = 0;

  const govde = el("div", { sinif: "ogretici-icerik" });
  const baslik = el("h1", { sinif: "ogretici-baslik" });
  const sayac = el("span", { sinif: "ogretici-sayac" });
  const geri = el("button", { type: "button", onclick: () => { sayfa--; ciz(); } }, "Geri");
  const ileri = el("button", { type: "button", sinif: "birincil" });

  function ciz(): void {
    const b = bolumler[sayfa];
    baslik.textContent = b.baslik;
    sayac.textContent = `${sayfa + 1} / ${bolumler.length}`;
    govde.replaceChildren(govdeCiz(b.satirlar));
    govde.scrollTop = 0;
    geri.disabled = sayfa === 0;
    const sonSayfa = sayfa === bolumler.length - 1;
    ileri.textContent = sonSayfa ? s.kapatmaEtiketi : "İleri";
    ileri.onclick = sonSayfa ? s.onKapat : () => { sayfa++; ciz(); };
  }
  ciz();

  return el("div", { sinif: "ekran ogretici-ekrani" },
    el("header", { sinif: "ogretici-ust" },
      el("div", { sinif: "ogretici-kurum" }, "HİZMET İÇİ EĞİTİM"),
      baslik,
      sayac,
    ),
    govde,
    el("footer", { sinif: "ogretici-alt" },
      geri,
      el("button", { type: "button", onclick: s.onKapat }, "Atla"),
      ileri,
    ),
  );
}

// Uygulama girişi ve ekran yönlendirici.
// Ekranlar yalnızca src/app katmanını kullanır; motor tipleri buraya girmez.

import "maplibre-gl/dist/maplibre-gl.css";
import { el, temizle } from "./dom.ts";
import { anaEkran } from "./ekran-ana.ts";
import { sekmeCubugu, ustSeritCiz, type SekmeKimligi } from "./kabuk.ts";
import { sekmeDosya } from "./sekme-dosya.ts";
import { veriYukleWeb, katalogYukleWeb } from "../engine/data-web.ts";
import { DavaBulunamadi, Oturum } from "../app/oturum.ts";
import { ayarOku, ayarYaz, turOku, turSil, turYaz } from "../app/depo.ts";
import { ZORLUK_ADLARI, type Zorluk } from "../app/gorunum.ts";
import type { Veri } from "../engine/data.ts";
import type { SensorKatalogu } from "../engine/schema.ts";

type Ekran = "ana" | "tur";

interface Uygulama {
  veri: Veri;
  katalog: SensorKatalogu;
  ekran: Ekran;
  oturum: Oturum | null;
  sekme: SekmeKimligi;
}

const kok = document.getElementById("uygulama")!;
let uyg: Uygulama;

function kaydet(): void {
  if (uyg.oturum) {
    uyg.oturum.aktifSekme = uyg.sekme;
    turYaz(uyg.oturum.kaydet());
  }
}

function anaEkranaDon(): void {
  kaydet();
  uyg.ekran = "ana";
  ciz();
}

function turBaslat(seed: number, zorluk: Zorluk): void {
  try {
    uyg.oturum = Oturum.baslat(seed, zorluk, uyg.veri, uyg.katalog);
  } catch (e) {
    hataGoster(e instanceof DavaBulunamadi ? e.message : "Dava üretilemedi.");
    return;
  }
  uyg.sekme = "dosya";
  uyg.ekran = "tur";
  ayarYaz({ son_zorluk: zorluk, son_seed: seed });
  kaydet();
  ciz();
}

function hataGoster(mesaj: string): void {
  const kutu = el("div", { sinif: "hata-kutu" }, mesaj);
  kok.prepend(kutu);
  setTimeout(() => kutu.remove(), 4000);
}

/** Vurgulanacak sorgu; DOSYA sekmesinden PANO'ya geçerken kullanılır. */
let vurguluSorgu: string | null = null;

function sekmeIcerigi(sekme: SekmeKimligi): HTMLElement {
  const o = uyg.oturum!;
  if (sekme === "dosya") {
    return sekmeDosya({
      dosya: o.dosya(),
      gecmis: o.gecmis(),
      serit: o.ustSerit(),
      onSorguSec: (sorguId) => {
        vurguluSorgu = sorguId;
        uyg.sekme = "pano";
        kaydet();
        ciz();
      },
    });
  }
  return el("div", { sinif: "sekme-icerik yer-tutucu" },
    el("p", {}, `${sekme.toUpperCase()} sekmesi bir sonraki adımda eklenecek.`),
  );
}

function turEkrani(): HTMLElement {
  const o = uyg.oturum!;
  return el("div", { sinif: "ekran tur-ekrani" },
    ustSeritCiz(o.ustSerit(), anaEkranaDon),
    sekmeIcerigi(uyg.sekme),
    sekmeCubugu(uyg.sekme, (id) => {
      uyg.sekme = id;
      kaydet();
      ciz();
    }),
  );
}

function ciz(): void {
  if (uyg.ekran === "tur" && uyg.oturum) {
    temizle(kok, turEkrani());
    return;
  }
  const ayar = ayarOku();
  const kayit = turOku();
  let devamOzeti = "";
  if (kayit) {
    devamOzeti = `Dava ${kayit.seed}, ${ZORLUK_ADLARI[kayit.zorluk]}, ${kayit.sorgular.length} sorgu yapılmış.`;
  }
  temizle(kok, anaEkran({
    sonZorluk: (ayar.son_zorluk as Zorluk) ?? "standart",
    sonSeed: ayar.son_seed,
    devamEdenVar: Boolean(kayit),
    devamOzeti,
    onBaslat: turBaslat,
    onDevam: () => {
      if (!kayit) return;
      try {
        uyg.oturum = Oturum.yukle(kayit, uyg.veri, uyg.katalog);
        uyg.sekme = (uyg.oturum.aktifSekme as SekmeKimligi) ?? "dosya";
        uyg.ekran = "tur";
        ciz();
      } catch (e) {
        turSil();
        hataGoster(e instanceof DavaBulunamadi ? e.message : "Kayıt açılamadı.");
        ciz();
      }
    },
    onSil: () => {
      turSil();
      uyg.oturum = null;
      ciz();
    },
  }));
}

async function basla(): Promise<void> {
  temizle(kok, el("div", { sinif: "yukleniyor" },
    el("p", {}, "VERİ TABANLARINA BAĞLANILIYOR"),
    el("div", { sinif: "yukleme-cubugu" }, el("span", {})),
  ));
  try {
    const veri = await veriYukleWeb();
    uyg = { veri, katalog: katalogYukleWeb(), ekran: "ana", oturum: null, sekme: "dosya" };
    ciz();
  } catch (e) {
    console.error(e);
    temizle(kok, el("div", { sinif: "hata-kutu" }, "Veri yüklenemedi. Sayfayı yenileyin."));
  }
}

void basla();

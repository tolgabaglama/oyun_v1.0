// Tarayıcı için veri okuyucu. data/processed dosyalarını Vite adresleriyle indirir,
// motorun indekslerini kurar. Node okuyucusunun (data-node.ts) eşidir.

import poiUrl from "../../data/processed/poi_istanbul.geojson?url";
import istasyonUrl from "../../data/processed/istasyonlar_istanbul.geojson?url";
import durakUrl from "../../data/processed/duraklar_istanbul.geojson?url";
import kameraUrl from "../../data/processed/kameralar_istanbul.geojson?url";
import bazHucreUrl from "../../data/processed/baz_hucreleri_istanbul.geojson?url";
import ilceUrl from "../../data/processed/ilceler_istanbul.geojson?url";
import mahalleUrl from "../../data/processed/mahalleler_istanbul.geojson?url";
import gecisler from "../data/gecisler.json";
import isimler from "../data/isimler.json";
import sensorler from "../data/sensors.json";

import { veriKur, type Gecis, type Veri } from "./data.ts";
import type { SensorKatalogu } from "./schema.ts";

async function jsonAl(url: string): Promise<never> {
  const cevap = await fetch(url);
  if (!cevap.ok) throw new Error(`Veri indirilemedi: ${url}`);
  return (await cevap.json()) as never;
}

export async function veriYukleWeb(): Promise<Veri> {
  const [poi, istasyonlar, duraklar, kameralar, bazHucreleri, ilceler, mahalleler] = await Promise.all(
    [poiUrl, istasyonUrl, durakUrl, kameraUrl, bazHucreUrl, ilceUrl, mahalleUrl].map(jsonAl),
  );
  // JSON içe aktarımlarının tipleri gevşektir; motor tipine burada bağlanır.
  return veriKur({
    poi, istasyonlar, duraklar, kameralar, bazHucreleri, ilceler, mahalleler,
    gecisler: gecisler as unknown as { gecisler: Gecis[] },
    isimler,
  });
}

export function katalogYukleWeb(): SensorKatalogu {
  return sensorler as unknown as SensorKatalogu;
}

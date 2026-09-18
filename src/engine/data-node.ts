// Node için veri okuyucu: data/processed ve src/data dosyalarını okur, indeksleri kurar.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { veriKur, type Veri } from "./data.ts";
import type { SensorKatalogu } from "./schema.ts";

const oku = (yol: string) => JSON.parse(readFileSync(yol, "utf8"));

export function veriYukleNode(kok = process.cwd()): Veri {
  const p = (d: string) => join(kok, "data/processed", d);
  return veriKur({
    poi: oku(p("poi_istanbul.geojson")),
    istasyonlar: oku(p("istasyonlar_istanbul.geojson")),
    duraklar: oku(p("duraklar_istanbul.geojson")),
    kameralar: oku(p("kameralar_istanbul.geojson")),
    bazHucreleri: oku(p("baz_hucreleri_istanbul.geojson")),
    gecisler: oku(join(kok, "src/data/gecisler.json")),
    isimler: oku(join(kok, "src/data/isimler.json")),
  });
}

export function katalogYukleNode(kok = process.cwd()): SensorKatalogu {
  return oku(join(kok, "src/data/sensors.json")) as SensorKatalogu;
}

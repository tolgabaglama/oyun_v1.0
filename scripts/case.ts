// Tek dava üretir ve okunur biçimde yazar.
// Kullanım: npm run case -- --seed 123 --zorluk standart

import { veriYukleNode, katalogYukleNode } from "../src/engine/data-node.ts";
import { davaKur, OracleReddi } from "../src/engine/oracle.ts";
import { UretimReddi } from "../src/engine/generator.ts";
import { zamanMetni, type Zorluk } from "../src/engine/schema.ts";
import { sorgula } from "../src/engine/query.ts";

function arg(ad: string, varsayilan: string): string {
  const i = process.argv.indexOf(`--${ad}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : varsayilan;
}

const seed = Number(arg("seed", "1"));
const zorluk = arg("zorluk", "standart") as Zorluk;
const veri = veriYukleNode();
const katalog = katalogYukleNode();

let dava;
try {
  dava = davaKur(seed, zorluk, veri, katalog);
} catch (e) {
  const neden = e instanceof UretimReddi || e instanceof OracleReddi ? e.neden : String(e);
  console.log(`Dava reddedildi. Seed ${seed}, zorluk ${zorluk}. Neden: ${neden}`);
  process.exit(1);
}

const g = dava.gercek;
const cizgi = "=".repeat(78);
console.log(cizgi);
console.log(`DAVA  seed ${dava.seed}  zorluk ${dava.zorluk}  üretici ${dava.uretici_surumu}`);
console.log(cizgi);
console.log(`\nDOSYA (oyuncunun gördüğü)`);
console.log(`  ${dava.profil.ad} ${dava.profil.soyad}, ${dava.profil.yas}`);
console.log(`  İhbar notu: ${dava.profil.ihbar_notu}`);

console.log(`\nGİZLİ GERÇEK`);
const yer = (ad: string, y: typeof g.ev) => `  ${ad.padEnd(12)} ${y.poi_id} ${y.kategori.padEnd(12)} ${y.ilce} / ${y.mahalle ?? "-"}  hücre ${y.hucre_kodu}  ${y.yaka}`;
console.log(yer("Ev", g.ev));
console.log(yer("İş", g.is));
console.log(yer("Üçüncü", g.ucuncu));
console.log(`  ${"Ulaşım".padEnd(12)} ${g.ulasim}   ödeme ${g.odeme}   telefon ${g.telefon}   araç ${g.arac_var ? g.plaka : "yok"}`);
if (g.kayitli_adres_poi_id) console.log(`  ${"Kayıtlı adres".padEnd(12)} ${g.kayitli_adres_poi_id} (gürültü: gerçek ev değil)`);
console.log(yer("ŞU AN", g.su_anki_konum));
console.log(`  ${"Zaman".padEnd(12)} ${zamanMetni(g.su_anki_zaman)}`);

console.log(`\nKAYITLAR  toplam ${dava.ozet.toplam_kayit}, gürültü ${dava.ozet.gurultu_kayit}, olay ${dava.olaylar.length}`);
const sensorMap = new Map(katalog.sensorler.map((s) => [s.id, s]));
for (const s of katalog.sensorler) {
  const n = dava.ozet.sensor_basina[s.id] ?? 0;
  if (!n) continue;
  const gurultu = dava.kayitlar.filter((k) => k.sensor_id === s.id && k.gurultu !== null).length;
  console.log(`  ${s.id.padEnd(18)} kademe ${s.kademe}  ${String(s.maliyet).padStart(3)}p  ${String(n).padStart(3)} kayıt${gurultu ? `  (${gurultu} gürültü)` : ""}`);
}

console.log(`\nPAR  ${dava.par.deger} puan  (${dava.par.yol.length} sorgu, başlangıç ${dava.par.baslangic_aday} aday)`);
for (const [i, adim] of dava.par.yol.entries()) {
  const s = sensorMap.get(adim.sensor_id)!;
  console.log(`  ${i + 1}. ${s.ad.padEnd(34)} ${String(adim.maliyet).padStart(3)}p  ->  ${adim.kalan_aday} aday`);
}
console.log(`\nPAR YOLUNUN DÖNDÜRDÜĞÜ`);
for (const adim of dava.par.yol) {
  const r = sorgula(dava, veri, katalog, adim.sensor_id, adim.parametreler ?? {});
  console.log(`  ${r.sensor_adi} (${r.kurum})`);
  for (const k of r.kayitlar.slice(0, 4)) console.log(`     ${k.metin}`);
  if (r.kayitlar.length > 4) console.log(`     ... ${r.kayitlar.length - 4} kayıt daha`);
}
console.log();

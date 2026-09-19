// Toplu dava üretir ve rapor yazar.
// Kullanım: npm run batch -- 300

import { veriYukleNode, katalogYukleNode } from "../src/engine/data-node.ts";
import { parHesapla, OracleReddi } from "../src/engine/oracle.ts";
import { davaUret, UretimReddi } from "../src/engine/generator.ts";
import type { Dava, Zorluk } from "../src/engine/schema.ts";
import { davaDogrula } from "../src/engine/schema.ts";

const adet = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 300);
const veri = veriYukleNode();
const katalog = katalogYukleNode();
const ZORLUKLAR: Zorluk[] = ["kolay", "standart", "uzman"];

const red: Record<string, number> = {};
const kabul: Dava[] = [];
const rolToplam: Record<string, number> = {};
const rolKabul: Record<string, number> = {};
let denetimHatasi = 0;

const t0 = Date.now();
for (let seed = 1; seed <= adet; seed++) {
  const zorluk = ZORLUKLAR[seed % 3];
  let dava: Dava;
  try {
    dava = davaUret(seed, zorluk, veri, katalog);
  } catch (e) {
    const neden = e instanceof UretimReddi ? e.neden : `HATA: ${(e as Error).message}`;
    red[neden] = (red[neden] ?? 0) + 1;
    continue;
  }
  // Üretilen davanın rolü, oracle kabul etse de etmese de sayılır.
  const rol = dava.gercek.su_anki_konum.rol;
  rolToplam[rol] = (rolToplam[rol] ?? 0) + 1;
  try {
    dava.par = parHesapla(dava, veri, katalog);
    kabul.push(dava);
    rolKabul[rol] = (rolKabul[rol] ?? 0) + 1;
    if (davaDogrula(dava, katalog).length) denetimHatasi++;
  } catch (e) {
    const neden = e instanceof OracleReddi ? e.neden : `HATA: ${(e as Error).message}`;
    red[neden] = (red[neden] ?? 0) + 1;
  }
}
const sure = Date.now() - t0;

const sayi = (a: number[]) => ({
  n: a.length,
  ort: a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0,
  min: a.length ? Math.min(...a) : 0,
  max: a.length ? Math.max(...a) : 0,
  ortanca: a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0,
});

const cizgi = "=".repeat(78);
console.log(cizgi);
console.log(`TOPLU ÜRETİM RAPORU   ${adet} seed   ${sure} ms   (${(sure / adet).toFixed(1)} ms/dava)`);
console.log(cizgi);

const toplamRed = Object.values(red).reduce((a, b) => a + b, 0);
console.log(`\nKABUL   ${kabul.length} / ${adet}   (%${((kabul.length / adet) * 100).toFixed(1)})`);
console.log(`RED     ${toplamRed} / ${adet}   (%${((toplamRed / adet) * 100).toFixed(1)})`);
console.log(`Şema denetiminden geçemeyen: ${denetimHatasi}`);

console.log(`\nRED NEDENLERİ`);
for (const [neden, n] of Object.entries(red).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${neden.padEnd(24)} ${String(n).padStart(4)}   %${((n / adet) * 100).toFixed(1)}`);
}
if (!toplamRed) console.log("  (yok)");

console.log(`\nZORLUĞA GÖRE`);
console.log(`  ${"zorluk".padEnd(10)} ${"kabul".padStart(6)} ${"par ort".padStart(8)} ${"par ortanca".padStart(12)} ${"par min-max".padStart(12)} ${"kayıt ort".padStart(10)} ${"olay ort".padStart(9)} ${"gürültü ort".padStart(12)}`);
for (const z of ZORLUKLAR) {
  const d = kabul.filter((x) => x.zorluk === z);
  const par = sayi(d.map((x) => x.par.deger));
  const kayit = sayi(d.map((x) => x.kayitlar.length));
  const olay = sayi(d.map((x) => x.olaylar.length));
  const gur = sayi(d.map((x) => x.ozet.gurultu_kayit));
  console.log(`  ${z.padEnd(10)} ${String(par.n).padStart(6)} ${String(par.ort).padStart(8)} ${String(par.ortanca).padStart(12)} ${`${par.min}-${par.max}`.padStart(12)} ${String(kayit.ort).padStart(10)} ${String(olay.ort).padStart(9)} ${String(gur.ort).padStart(12)}`);
}

console.log(`\nPAR DAĞILIMI`);
const kovalar = new Map<string, number>();
for (const d of kabul) {
  const k = Math.floor(d.par.deger / 100) * 100;
  const ad = `${k}-${k + 99}`;
  kovalar.set(ad, (kovalar.get(ad) ?? 0) + 1);
}
for (const [ad, n] of [...kovalar.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
  console.log(`  ${ad.padEnd(10)} ${String(n).padStart(4)}  ${"#".repeat(Math.round((n / kabul.length) * 60))}`);
}

console.log(`\nPAR YOLU UZUNLUĞU`);
const uzunluk = new Map<number, number>();
for (const d of kabul) uzunluk.set(d.par.yol.length, (uzunluk.get(d.par.yol.length) ?? 0) + 1);
for (const [u, n] of [...uzunluk.entries()].sort((a, b) => a[0] - b[0])) console.log(`  ${u} sorgu     ${String(n).padStart(4)}   %${((n / kabul.length) * 100).toFixed(1)}`);

console.log(`\nEN SIK PAR YOLLARI`);
const yollar = new Map<string, number>();
for (const d of kabul) {
  const y = d.par.yol.map((a) => a.sensor_id).join(" + ");
  yollar.set(y, (yollar.get(y) ?? 0) + 1);
}
for (const [y, n] of [...yollar.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${y.padEnd(46)} ${String(n).padStart(4)}`);

console.log(`\nŞU ANKI KONUM ROLÜNE GÖRE KABUL   (üretilen davalar içinde oracle'ın çözebildiği oran)`);
console.log(`  ${"rol".padEnd(12)} ${"üretilen".padStart(9)} ${"kabul".padStart(6)} ${"kabul oranı".padStart(12)} ${"kabuller içindeki pay".padStart(22)}`);
for (const rol of ["ev", "is", "ucuncu", "rutin_disi"]) {
  const t = rolToplam[rol] ?? 0;
  const n = rolKabul[rol] ?? 0;
  const oran = t ? `%${((n / t) * 100).toFixed(1)}` : "-";
  const pay = kabul.length ? `%${((n / kabul.length) * 100).toFixed(1)}` : "-";
  console.log(`  ${rol.padEnd(12)} ${String(t).padStart(9)} ${String(n).padStart(6)} ${oran.padStart(12)} ${pay.padStart(22)}`);
}

console.log(`\nSPOR SALONU ÜYELİĞİ`);
const uye = kabul.filter((d) => d.gercek.spor_salonu_uyesi).length;
console.log(`  üye olan kabul edilmiş dava: ${uye} / ${kabul.length}  (%${((uye / kabul.length) * 100).toFixed(1)})`);
const turnikeli = kabul.filter((d) => (d.ozet.sensor_basina.spor_turnike ?? 0) > 0).length;
console.log(`  turnike kaydı bulunan dava:  ${turnikeli} / ${kabul.length}`);

console.log(`\nSENSÖR KULLANIMI (par yollarında)`);
const sensorSayim = new Map<string, number>();
for (const d of kabul) for (const a of d.par.yol) sensorSayim.set(a.sensor_id, (sensorSayim.get(a.sensor_id) ?? 0) + 1);
for (const [s, n] of [...sensorSayim.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${s.padEnd(20)} ${String(n).padStart(4)}   %${((n / kabul.length) * 100).toFixed(1)} davada`);
}
console.log();

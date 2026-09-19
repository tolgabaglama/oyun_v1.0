// Yerel depolama. Yarım kalan tur ve son kullanılan ayarlar burada tutulur.
// Tarayıcı depolaması kapalıysa oyun çalışmaya devam eder, yalnızca kayıt yapılmaz.

import type { KayitliOturum } from "./oturum.ts";

const ANAHTAR_TUR = "iz.tur";
const ANAHTAR_AYAR = "iz.ayar";

export interface Ayarlar {
  son_zorluk: string;
  son_seed: number;
}

function guvenliOku<T>(anahtar: string): T | null {
  try {
    const ham = localStorage.getItem(anahtar);
    return ham ? (JSON.parse(ham) as T) : null;
  } catch {
    return null;
  }
}

function guvenliYaz(anahtar: string, deger: unknown): void {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger));
  } catch {
    // Depolama kapalı veya dolu; oyun kayıtsız devam eder.
  }
}

export function turOku(): KayitliOturum | null {
  const k = guvenliOku<KayitliOturum>(ANAHTAR_TUR);
  return k && k.surum === 2 ? k : null;
}

export function turYaz(kayit: KayitliOturum): void {
  guvenliYaz(ANAHTAR_TUR, kayit);
}

export function turSil(): void {
  try {
    localStorage.removeItem(ANAHTAR_TUR);
  } catch {
    // yok sayılır
  }
}

export function ayarOku(): Ayarlar {
  return guvenliOku<Ayarlar>(ANAHTAR_AYAR) ?? { son_zorluk: "standart", son_seed: 1 };
}

export function ayarYaz(a: Ayarlar): void {
  guvenliYaz(ANAHTAR_AYAR, a);
}

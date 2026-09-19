import { defineConfig } from "vite";

// GitHub Pages proje sayfası alt dizinde yayınlanır: https://<kullanici>.github.io/<depo>/
// Bu yüzden derlemede base depo adına ayarlanır. Geliştirme sunucusunda kök kalır.
const DEPO_ADI = "oyun_v1.0";

export default defineConfig(({ command }) => ({
  base: command === "build" ? `/${DEPO_ADI}/` : "/",
  server: { port: 5173, open: false },
  // MapLibre kendi arka plan çalışanını (worker) ayrı bir dosya olarak yükler.
  // Vite'ın bağımlılık ön-paketleyicisi bu dosyayı kaybediyor, bu yüzden MapLibre hariç tutulur.
  optimizeDeps: { exclude: ["maplibre-gl"] },
}));

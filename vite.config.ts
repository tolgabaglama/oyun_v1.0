import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, open: false },
  // MapLibre kendi arka plan çalışanını (worker) ayrı bir dosya olarak yükler.
  // Vite'ın bağımlılık ön-paketleyicisi bu dosyayı kaybediyor, bu yüzden MapLibre hariç tutulur.
  optimizeDeps: { exclude: ["maplibre-gl"] },
});

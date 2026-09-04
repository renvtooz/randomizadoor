import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" usa rutas relativas, así que el build funciona igual en la raíz de un
// dominio, en GitHub Pages (https://usuario.github.io/repo/) o en cualquier subcarpeta,
// sin tener que ajustar nada aquí.
export default defineConfig({
  plugins: [react()],
  base: "./",
});

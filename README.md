# Física II — Banco de preguntas

Aplicación web para profesores de Física II (electromagnetismo): permite crear preguntas
a mano o generarlas con IA a partir de un tema o concepto, guardarlas en un banco propio,
y armar evaluaciones sorteando preguntas al azar. Puede exportar **una sola prueba o decenas
de pruebas distintas a la vez** (una por estudiante), cada una convertida automáticamente en
su propio Google Form mediante un script de Google Apps Script.

## Funciones principales

- Crear preguntas manualmente (opción múltiple o verdadero/falso).
- Generar preguntas con IA (Claude) a partir de un tema, un concepto específico, la dificultad
  y la cantidad deseada, con revisión y edición antes de guardarlas.
- Crear tus propios temas además de los sugeridos de electromagnetismo.
- Banco de preguntas con filtros por tema y dificultad.
- Armar de 1 a 200 pruebas distintas en un solo paso, cada una con un subconjunto aleatorio
  de preguntas (y, opcionalmente, con las alternativas también en orden distinto).
- Asignar cada prueba a un nombre de estudiante (opcional).
- Exportar todo a Google Forms de una sola vez: se genera un script de Apps Script que, al
  ejecutarlo en tu cuenta de Google, crea todos los formularios y además una hoja de cálculo
  con el enlace de cada uno, lista para repartir.

## Requisitos

- [Node.js](https://nodejs.org) 18 o superior.
- Una cuenta de Google (para ejecutar el script que crea los formularios).
- Opcional: una clave de API de Anthropic si quieres usar la generación de preguntas con IA.

## Instalación y uso local

```bash
npm install
npm run dev
```

Esto abre la aplicación en `http://localhost:5173`. Todo lo que crees (preguntas, temas,
la clave de API) se guarda solo en el `localStorage` de tu navegador; nada se envía a un
servidor propio.

## Exportar pruebas a Google Forms

1. En **Armar y exportar**, filtra por tema/dificultad, define cuántas preguntas por prueba y
   cuántas pruebas distintas necesitas, y sortéalas.
2. Completa el título y la descripción del formulario y genera el script.
3. Copia el código, ábrelo en <https://script.google.com> (proyecto nuevo), pégalo reemplazando
   el contenido por defecto, y ejecútalo (▶). Autoriza los permisos la primera vez.
4. El script crea todos los formularios y, al final, una hoja de cálculo nueva con el enlace
   para cada estudiante y el enlace de edición de cada prueba.

## Compilar para producción

```bash
npm run build
```

Genera una carpeta `dist/` lista para publicar en cualquier hosting estático (GitHub Pages,
Vercel, Netlify, etc.).

### Publicar en GitHub Pages

El proyecto ya incluye un flujo de GitHub Actions (`.github/workflows/deploy.yml`) que
compila y publica el sitio automáticamente cada vez que subes cambios a la rama `main`.
Solo tienes que activarlo una vez:

1. Sube el proyecto a GitHub (ver la siguiente sección si aún no lo has hecho).
2. En el repositorio, ve a **Settings → Pages**.
3. En "Build and deployment", en el campo **Source**, elige **GitHub Actions** (no "Deploy
   from a branch").
4. Ve a la pestaña **Actions** del repositorio: debería estar corriendo (o a punto de correr)
   el flujo "Deploy a GitHub Pages". Espera a que termine (círculo verde ✓).
5. Vuelve a **Settings → Pages**: ahí aparece el link público del sitio, algo como
   `https://tu-usuario.github.io/nombre-del-repo/`.

No necesitas tocar `vite.config.js`: ya está configurado con rutas relativas (`base: "./"`),
así que funciona sin importar el nombre del repositorio.

Cada vez que hagas `git push` a `main` con cambios nuevos, el sitio se vuelve a publicar solo.

## Subir este proyecto a GitHub

Desde la carpeta del proyecto:

```bash
git init
git add .
git commit -m "Primera versión: banco de preguntas de Física II"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/NOMBRE_DEL_REPO.git
git push -u origin main
```

Reemplaza `TU_USUARIO/NOMBRE_DEL_REPO` por el repositorio que crees en tu cuenta de GitHub
(botón "New repository").

## Estructura del proyecto

```
├── index.html
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx        # punto de entrada de React
    ├── index.css       # estilos base de la página
    ├── App.jsx          # toda la aplicación (vistas, lógica y estilos del banco)
    └── lib/
        └── storage.js  # persistencia en localStorage
```

## Licencia

MIT — úsalo, modifícalo y compártelo libremente con tus colegas.

# Forja Labs — Web

Landing page de Forja Labs. Stack: **Astro** + **Cloudflare Pages**.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre http://localhost:4321

## Deploy en Cloudflare Pages

### Primera vez

1. Sube el repo a GitHub
2. Ve a [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. Selecciona el repo `forja-labs-web`
4. Configuración de build:
   - **Framework preset:** Astro
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
5. Haz click en **Save and Deploy**

### DNS (apuntar forjalabs.cl)

En el panel DNS de NIC Chile (o donde tengas el dominio):
- Agrega un registro **CNAME**: `www` → `<tu-proyecto>.pages.dev`
- Para el apex (`forjalabs.cl`), usa un registro **A** apuntando a la IP de Cloudflare (te la muestra en el panel)

O bien: transfiere los nameservers a Cloudflare para gestión completa (recomendado).

### Deploy automático

Cada push a `main` hace deploy automático. Sin configuración adicional.

## Estructura

```
src/
  layouts/Layout.astro    # Layout base (head, fonts, estilos globales)
  pages/index.astro       # Landing page completa
public/
  favicon.svg
```

## Personalización

- Colores: variables CSS en `Layout.astro` (`:root`)
- Contenido: editar directamente `pages/index.astro`
- Correo de contacto: actualizar `hola@forjalabs.cl` cuando esté disponible

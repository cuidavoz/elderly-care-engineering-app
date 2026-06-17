# CuidaVoz 💜 — Web

Web app de CuidaVoz (servicio de cuidado de adultos mayores). Es la superficie
principal: cuidadores se registran/loguean, gestionan familias y adultos
mayores, y consultan reportes diarios, alertas e historial.

Esta etapa entrega el **esqueleto + autenticación + app shell**. La UI de datos
(reportes, alertas, chat) se conecta en una etapa posterior contra el backend
de CuidaVoz.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** + **shadcn/ui** (estilo `base-nova`, Base UI)
- **Supabase Auth** vía `@supabase/ssr` (cookies, SSR)
- Deploy futuro en Vercel

## Cómo correr

```bash
npm install
npm run dev
```

Abrí http://localhost:3000.

### Variables de entorno

Copiá `.env.example` a `.env.local` y completá:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Los valores **reales de desarrollo** salen de `npx supabase start` (lo provee el
módulo de Supabase del repo, en `../supabase`). Ese comando imprime la `API URL`
y la `anon key` del stack local de Supabase; pegalas en `.env.local`.

> El build (`npm run build`) tolera la ausencia de estas variables usando
> placeholders válidos por sintaxis. Las requests reales a Supabase sí necesitan
> los valores correctos en runtime.

## Estructura

```
src/
  app/
    layout.tsx              # Layout raíz (es-AR, fuentes Geist, Toaster)
    page.tsx                # Landing pública con CTA a login/signup
    (auth)/                 # Grupo de rutas de autenticación
      layout.tsx            # Layout centrado con branding
      actions.ts            # Server actions: login, signup, signout
      auth-form.tsx         # Formulario compartido (login/signup) + toasts
      login/page.tsx
      signup/page.tsx
    dashboard/              # Área protegida (requiere sesión)
      layout.tsx            # Verifica sesión en server -> redirige a /login
      page.tsx             # Placeholder del panel + nav de secciones
      _components/
        sidebar.tsx         # Nav: Reportes, Alertas, Consultar, Familia
        header.tsx          # Usuario logueado + botón de salir
  components/ui/            # Componentes shadcn (button, card, input, label, sonner)
  lib/
    supabase/
      client.ts             # createBrowserClient (componentes de cliente)
      server.ts             # createServerClient (RSC / actions, async cookies)
      proxy.ts              # updateSession: refresca sesión y protege rutas
      env.ts                # Lectura tolerante de env (no rompe el build)
    utils.ts                # cn()
  proxy.ts                  # Proxy de Next 16 (ex-"middleware"); usa updateSession
```

## Autenticación

- Email + contraseña con Supabase Auth.
- El refresh de sesión y la protección de rutas viven en `src/proxy.ts`
  (Next.js 16 renombró `middleware` a `proxy`).
- `/dashboard` además verifica la sesión en el server component como defensa en
  profundidad.

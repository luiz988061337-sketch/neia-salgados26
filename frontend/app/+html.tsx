import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

/**
 * HTML template for Expo Router web PWA (Néia Salgados).
 * Adds manifest, theme color, apple-touch icons and Service Worker registration.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1" />
        <title>Néia Salgados — O sabor que faz a diferença</title>
        <meta name="description" content="Peça salgados fresquinhos com entrega rápida ou retirada no balcão." />

        {/* PWA */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#F4B821" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="Néia Salgados" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Néia Salgados" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />

        {/* OpenGraph / share */}
        <meta property="og:title" content="Néia Salgados" />
        <meta property="og:description" content="O sabor que faz a diferença — entrega e retirada." />
        <meta property="og:image" content="/icon-512.png" />
        <meta property="og:type" content="website" />

        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { background: #F4B821; margin: 0; }
              body { overscroll-behavior-y: none; }
              #root { min-height: 100vh; }
            `,
          }}
        />

        {/* Service Worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {});
                });
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

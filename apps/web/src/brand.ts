// Marca de la instalación, en un solo lugar (ADR-057). Otro cliente = otro brand.ts + otro
// logo en public/. El manifest (public/manifest.webmanifest) e index.html son estáticos y
// repiten estos textos a mano: si cambian acá, cambiarlos también allá.
export const BRAND = {
  appName: 'Hidrolavadora',
  orgName: 'Cooperativa de Remis',
  place: 'Ushuaia',
  /** Nombre completo, para títulos y el login. */
  fullName: 'Hidrolavadora · Cooperativa de Remis Ushuaia',
  /** Subtítulo corto debajo del nombre en los encabezados. */
  subtitle: 'Cooperativa de Remis · Ushuaia',
  logoSrc: '/brand/logo.jpg',
  logoAlt: 'Logo de la Cooperativa de Provisión para Transportistas de Ushuaia',
} as const;

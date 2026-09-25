// Fija el tema ANTES del primer pintado para que no parpadee al recargar.
// Archivo aparte y no inline: helmet() manda `script-src 'self'` y bloquearía un <script>
// inline sin avisar. Arranca SIEMPRE en claro (ADR-057); el oscuro es solo si el usuario
// lo eligió con el botón. Mantener la clave y los colores en sync con src/lib/useTheme.ts.
(function () {
  var theme = 'light';
  try {
    var saved = window.localStorage.getItem('hidro:theme');
    if (saved === 'dark' || saved === 'light') theme = saved;
  } catch (e) {
    /* Safari privado / almacenamiento bloqueado: queda claro */
  }
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0E1411' : '#F7F5EE');
})();

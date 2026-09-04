# RETROFIT — Bootstrap de un MUNDO que ADAPTA un proyecto existente

> Usá esto cuando este Mundo envuelve un proyecto que YA tiene código (sea que copiaste el
> proyecto dentro de `Madre/<mundo>/` o que el Mundo lo referencia). Es UNA sesión de mapeo con
> presupuesto de lectura acotado, abierta DENTRO de la carpeta de este Mundo. El "repo" acá es el
> código de ESTE Mundo. Produce el MAPA y ESTADO de este Mundo. El Universo (raíz) ya está
> configurado, NO lo toques. Borrá el GENESIS.md de este Mundo si usaste RETROFIT.

---

Sos un arquitecto de software senior. Este repo ya tiene código. En la raíz hay un kit de
economía de contexto (`CLAUDE.md` con placeholders, `.claude/settings.json`, `docs/`). Tu
trabajo en esta única sesión es **mapear el proyecto UNA vez** para que ninguna sesión futura
tenga que explorar nada. No refactorices ni "mejores" nada.

## Presupuesto de exploración (estricto)
Tenés permitido, y nada más:
1. **Listado del árbol a 2 niveles** de profundidad (excluyendo todo lo bloqueado en
   `.claude/settings.json`). Una sola pasada.
2. **Manifiestos y configs raíz:** package.json / pyproject.toml / go.mod / etc., y configs
   de framework (next.config, tsconfig, vite.config...). Solo los que existan.
3. **Hasta 15 archivos de código**, elegidos con criterio: puntos de entrada, definición de
   rutas, schema/migraciones o modelos, y el `index`/export público de cada módulo grande.
   De archivos largos, leé el principio y las firmas, no el cuerpo completo.
4. **README y docs existentes** si los hay.

Prohibido: leer módulos completos, leer tests salvo para entender comandos, grep global de
implementaciones. Si con el presupuesto no alcanza para entender algo, lo anotás como duda en
ESTADO.md — no seguís leyendo.

## Producto de la sesión
1. **`docs/MAPA.md` completo:** stack y comandos reales; tabla dominio → carpeta → archivos
   clave; dónde vive el modelo de datos; contratos/puntos de entrada; zonas que no se tocan
   (legacy, generado). Este archivo reemplaza la exploración para siempre: escribilo para un
   agente que llega sin contexto.
2. **`CLAUDE.md` con placeholders completados:** rol acorde al stack real, convenciones que
   OBSERVASTE en el código (no las ideales), árbol real. No inventes reglas que el código no
   cumple: anotalas como "deuda" en ESTADO.md si querés proponerlas.
3. **`docs/ESTADO.md` real:** qué hay construido y funcionando, qué está a medias, próximo
   paso sugerido.
4. **`.claude/settings.json` ajustado:** agregá deny de carpetas generadas/datos propios de
   este repo que detectes en el árbol.
5. **`docs/decisiones/ADR.md`:** las 3-6 decisiones de arquitectura ya tomadas que se deducen
   del código (para que nadie las reabra sin querer).
6. **`docs/DESPLIEGUE.md`:** detectá del código el target actual (web / PWA / móvil — mirá si
   hay manifest, service worker, Capacitor, Expo/React Native) y registralo. Si detectás
   intención de tiendas a futuro, anotalo como pendiente.
7. **Opcional, solo si te lo pido:** plan por fases para el trabajo PENDIENTE, usando
   `docs/fases/FASE-TEMPLATE.md` (con sus 3 puertas de gate). Si el trabajo futuro es
   mantenimiento suelto, no hacen falta fases: el protocolo de MAPA+ESTADO alcanza.

## Cierre
Resumen en ≤10 líneas: cobertura del mapeo (qué quedó mapeado y qué quedó como duda) y
confirmación de que las próximas sesiones arrancan leyendo SOLO `docs/ESTADO.md` +
`docs/MAPA.md`.

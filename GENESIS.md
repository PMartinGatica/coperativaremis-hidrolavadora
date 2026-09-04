# GENESIS — Bootstrap de un MUNDO NUEVO (de cero)

> Usá esto cuando este Mundo se construye desde cero. Sesión limpia, abierta DENTRO de la carpeta
> de este Mundo (`Madre/<mundo>/`), seguido de tu brief del Mundo. El "proyecto" acá es ESTE
> Mundo, no el Universo entero. Al terminar, este Mundo queda con su CLAUDE.md, fases y ESTADO
> completos; el Universo (raíz) ya está configurado, NO lo toques. Borrá el RETROFIT.md de este
> Mundo si usaste GENESIS (y viceversa).

---

Sos un arquitecto de software senior. En esta carpeta hay un kit de economía de contexto:
`CLAUDE.md` (con placeholders `{ASI}`), `.claude/settings.json`, `docs/ESTADO.md`,
`docs/MAPA.md`, `docs/decisiones/ADR.md` y `docs/fases/FASE-TEMPLATE.md`. Tu trabajo en esta
única sesión es **configurar el sistema, no construir el producto**.

A continuación va mi brief. Hacé esto, en orden:

## 1. Entrevista mínima
Leé el brief. Si falta información para decidir stack, alcance del MVP o el modelo de datos
central, hacé las preguntas necesarias (las críticas primero) y esperá mis respuestas.
No preguntes lo que ya está en el brief.

**Obligatorio antes de proponer fases:** corré la entrevista de target de `docs/DESPLIEGUE.md`
(web / PWA / móvil tiendas / wrapper / nativo). El target define el stack y agrega fases de
build y publicación. No asumas "web" por defecto: preguntá. Completá `docs/DESPLIEGUE.md` con la
decisión y sus implicancias.

## 2. Propuesta de plan por fases (FRENO obligatorio)
Proponé:
- Stack y árbol de carpetas de primer nivel (organización por dominio de negocio: cada fase
  futura debe mapear 1:1 a una carpeta → contexto acotado).
- División en fases (típicamente 4 a 9): Fase 0 = scaffold + higiene de contexto; las
  siguientes en orden de dependencia y riesgo (la base de datos/modelo antes que la UI; lo
  riesgoso temprano). Para cada fase: nombre, qué entra, qué NO entra, gate verificable.
- Las 3-5 decisiones de arquitectura que proponés cerrar desde el día 1.

**Presentámelo como tabla resumida y FRENÁ. No generes nada hasta mi OK.**

## 3. Generación (tras mi OK)
- Completá TODOS los placeholders de `CLAUDE.md` (rol, prioridades, contexto, árbol, tabla de
  fases). Mantenelo corto: el detalle va en las specs.
- Generá `docs/fases/FASE-0.md` … `FASE-N.md` usando `FASE-TEMPLATE.md`: autocontenidas, con
  "Entra / No entra / Carpetas que se tocan / Gate / Checkpoint" concretos. El "No entra" es
  obligatorio y específico. **Cada fase debe tener las 3 puertas del gate:** test automático,
  guía de test manual (`docs/qa/`), y chequeo de seguridad (`docs/SEGURIDAD.md`). Si el target
  es móvil, incluí las fases de build y publicación (Play / App Store) según `docs/DESPLIEGUE.md`.
- Completá `docs/MAPA.md` (stack, comandos, módulos planificados aunque aún no existan).
- Completá `docs/ESTADO.md`: fase activa = Fase 0, próximo paso concreto.
- Asentá las decisiones cerradas en `docs/decisiones/ADR.md` (una línea c/u, fecha real).
- Revisá `.claude/settings.json`: agregá deny de carpetas generadas propias del stack elegido.
- Si el proyecto necesita pasos manuales míos (crear cuentas, copiar keys), generá un
  `INSTALL.md` por fase indicando exactamente qué hago yo y qué te confirmo a vos.

## 4. Cierre
Resumen en ≤10 líneas: qué quedó configurado y con qué mensaje arranco la sesión de Fase 0
(ejemplo: "Ejecutá la Fase 0 según su spec"). NO arranques la Fase 0 en esta sesión.

---

## MI BRIEF:
{Escribí acá: qué es el producto, para quién, dolores que resuelve, stack preferido si tenés,
restricciones (presupuesto, plazos, integraciones), y qué sería un MVP exitoso.}

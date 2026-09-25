# Guía de test manual — Identidad visual + app instalable · Mundo: HIDRO SELF-SERVICE

> La puerta (b) del gate. El agente escribe esta guía; el HUMANO la sigue a mano y la valida.
> Cubre lo que las pruebas automáticas NO juzgan: si se ve bien de verdad en un celular, afuera,
> con los colores de la cooperativa; si los mensajes se entienden; si la app se instala.
> Plan: `docs/designs/identidad-visual-pwa.md` · Canvas aprobado:
> https://claude.ai/artifact/2RFkcFivkUJqc3SDEEYF8G · ADR-057.
>
> **Cada bloque gris de acá abajo se copia tal cual (Ctrl+C) y se pega tal cual (Ctrl+V).**
> No hay que escribir nada a mano ni entender lo que dice. Si algo no coincide EXACTO con lo que
> dice "Tiene que aparecer", parar, sacar una captura de pantalla y avisar — no seguir adivinando.

## Qué vas a validar
Que la app del cliente y el panel se vean con la marca de la cooperativa (marfil + verde), que el
modo oscuro funcione y se recuerde, que las patentes argentinas y extranjeras se traten bien, y que
la app se pueda instalar en el celular.

---

## Preparación (hacerla una vez, antes del Paso 1 de la tabla)

Al final vas a tener **dos ventanas azules (terminales) abiertas a la vez, sin cerrarlas**, más el
navegador. Es más largo de leer que de hacer: son 4 pasos, todos de copiar y pegar.

### Paso A — Compilar el proyecto

1. Abrí el **Explorador de archivos** de Windows (el ícono de la carpeta amarilla en la barra de tareas).
2. Hacé clic en la barra de direcciones de arriba (donde se ve la ruta de carpetas), borrá lo que
   haya y pegá esto, después **Enter**:
   ```
   D:\insolva\Desarrollo\Madre\mundos\hidro-self-service
   ```
3. Ahora hacé clic DE NUEVO en esa misma barra de arriba, borrá lo que haya, escribí `powershell` y
   apretá **Enter**.
   → Se abre una ventana con fondo azul oscuro. Esa es la terminal. Ya va a estar parada en la
   carpeta correcta — no hace falta escribir ninguna ruta ahí adentro.
4. Copiá esta línea completa y pegala en la ventana azul (clic derecho para pegar, o Ctrl+V), después
   **Enter**:
   ```powershell
   npm run build
   ```
5. Esperá unos 10 a 15 segundos, sin tocar nada.
   **✅ Tiene que aparecer** (el número de segundos puede variar):
   ```
   ✓ built in 11.75s
   ```
   **❌ Si en cambio ves texto en rojo con la palabra "error"**: PARÁ ACÁ. Sacá una captura de
   pantalla de toda la ventana y avisá. No sigas con los pasos de abajo.

### Paso B — Prender el "servidor" en modo DEMO (la máquina de mentira)

> ⚠️ **Muy importante.** Si te salteás el `demo` de abajo, el sistema va a intentar cobrar de
> verdad con Mercado Pago en cada prueba. Seguí la letra exacta de estas tres líneas.

1. En la **misma ventana azul** del Paso A (ya terminó de compilar, volvió a mostrar el cursor
   parpadeando), copiá y pegá esta línea, **Enter**:
   ```powershell
   cd D:\insolva\Desarrollo\Madre\mundos\hidro-self-service\apps\api
   ```
   *(Es la ruta completa a propósito: así funciona sin importar en qué carpeta haya quedado
   la ventana si ya la usaste antes. Si ves un error como "no se encuentra la ruta" con
   `apps\api\apps\api`, es justamente por usar una ruta corta desde el lugar equivocado —
   con esta línea de acá arriba no pasa.)*
2. Copiá y pegá esta línea, **Enter**:
   ```powershell
   $env:PAYMENT_PROVIDER = "demo"
   ```
3. Copiá y pegá esta línea, **Enter**:
   ```powershell
   node dist\index.js
   ```
4. Esperá 2 o 3 segundos. Va a aparecer bastante texto técnico — no hay que entenderlo, solo
   revisar que en algún renglón diga literalmente:
   ```
   "payments":"DEMO MODE"
   ```
   **❌ Si en cambio ves texto en rojo, o dice `EADDRINUSE`**: probablemente ya había una de estas
   ventanas abierta de una prueba anterior. Cerrá TODAS las ventanas azules, esperá 5 segundos, y
   volvé a empezar desde el Paso A.
5. **⚠️ NO CIERRES esta ventana.** Mientras esté abierta con el cursor ahí parpadeando (sin volver
   a mostrar el signo `>`), el servidor está prendido. Si la cerrás sin querer, la app deja de
   andar: hay que repetir el Paso B entero.

### Paso C — Prender la página web (en una SEGUNDA ventana, aparte)

1. Abrí el **Explorador de archivos** de nuevo (una ventana nueva — la ventana azul del Paso B se
   deja abierta tal cual está, aparte).
2. Igual que antes: barra de direcciones → pegar `D:\insolva\Desarrollo\Madre\mundos\hidro-self-service` → **Enter**.
3. Barra de direcciones otra vez: escribir `powershell` → **Enter**. Se abre una **segunda** ventana
   azul (distinta de la del Paso B, que sigue aparte).
4. Copiá y pegá esta línea, **Enter**:
   ```powershell
   npm run dev:web
   ```
5. **✅ Tiene que aparecer** algo parecido a esto:
   ```
   VITE v6.4.3  ready in 621 ms

   ➜  Local:   http://127.0.0.1:5173/
   ```
6. **⚠️ Tampoco cierres esta ventana** durante toda la prueba.

En este punto tenés **dos ventanas azules abiertas** (Paso B y Paso C) y no se tocan más hasta
terminar. Si en algún momento una pantalla no carga, lo primero es mirar que las dos sigan abiertas.

### Paso D — Abrir la página en el navegador

1. Abrí Chrome, Edge o el navegador que uses normalmente (no el Explorador de archivos).
2. Hacé clic en la barra de direcciones de arriba del navegador (donde van las páginas web) y
   escribí o pegá:
   ```
   http://127.0.0.1:5173/machine/HIDRO-01
   ```
3. **Enter.** Tiene que cargar la página de la hidrolavadora con fondo color hueso y el logo de la
   cooperativa arriba. Si carga en blanco o da error, revisá el Paso C (¿sigue abierta la ventana?).

**Recién ahora empezá con la tabla de "Pasos" de abajo.**

### Para el celular real (Pasos 11 a 14 de la tabla)

El `127.0.0.1` de arriba solo funciona en esta PC. Para el celular hace falta la versión ya
publicada en internet: `https://hidro-api.insolvadev.com`. Esos 4 pasos se hacen **después del
deploy**, no ahora — están señalados en la tabla.

---

## Pasos

| # | Acción | Resultado esperado | ¿OK? |
|---|--------|--------------------|------|
| 1 | Abrir `http://127.0.0.1:5173/machine/HIDRO-01` (Paso D de arriba) | Fondo marfil, logo circular de la cooperativa arriba, debajo dos líneas: "Hidrolavadora" y "Cooperativa de Remis · Ushuaia", abajo dice "Paso 1 de 3" | ☐ |
| 2 | Tocar el botón redondo de arriba a la derecha (ícono de luna) | Todo pasa a oscuro (fondo casi negro, verde más claro) sin recargar la página | ☐ |
| 3 | Apretar F5 (recargar la página) | Sigue en oscuro y **no parpadea** en claro antes de quedar oscuro | ☐ |
| 4 | Tocar el mismo botón (ahora es un sol) | Vuelve a marfil | ☐ |
| 5 | Hacer clic en el recuadro de patente y escribir `ag 945-rs` | Queda `AG945RS` (mayúsculas, sin espacios ni guión) y abajo aparece "✓ Patente argentina" | ☐ |
| 6 | Borrar y escribir `BBCL42` | Aparece "Formato de otro país: tarifa de particular"; el recuadro de PIN sigue habilitado (no se pone gris) | ☐ |
| 7 | Tocar "Ver mi tarifa" con `BBCL42` cargada | Tarifa **$8.000**, categoría "Particular no asociado", sin ningún aviso naranja | ☐ |
| 8 | Tocar "Cambiar patente", escribir `ZZ999ZZ`, tocar "Ver mi tarifa" | $8.000 **y** recuadro naranja "Esta patente no figura registrada…" con botón "Corregir patente"; el botón de pagar queda gris (segundo plano) | ☐ |
| 9 | Tocar "Corregir patente", escribir `AE100AA` (patente de remis de prueba), tocar "Ver mi tarifa" | $500, "Remis de la cooperativa", "Lavados hoy 0 de 2", sin ningún aviso naranja | ☐ |
| 10 | Tocar "Pagar $500 con Mercado Pago" → en la pantalla de simulación tocar "APROBAR" → tocar "VOLVER A LA MÁQUINA" → abrir "la máquina simulada" y apretar el pulsador | "Pago aprobado", arriba dice "HIDRO-01 · Habilitada para vos" en verde, "Cuando veas la luz verde, apretá el botón", cuenta de 5:00 bajando; después un anillo con la cuenta del lavado; al final "¡Listo!" | ☐ |
| 10b | *(seguís en la PC, en la misma pantalla — todavía NO hace falta el celular)* En la pantalla "¡Listo!", tocar "Lavar de nuevo" | Vuelve al **paso 1** con `AE100AA` ya escrita y el PIN vacío para completar (no muestra $8.000 de entrada) | ☐ |

**A partir de acá (pasos 11 a 14) hace falta el celular Y que la web ya esté publicada en internet
(`https://hidro-api.insolvadev.com`).** Si todavía no se hizo el deploy: **saltealos por ahora**,
anotalos como pendientes, y seguí derecho con el paso 15 (que es de nuevo en la PC). Se completan
11-14 más tarde, cuando esté publicado.

| 11 | *(celular, con la versión ya publicada — no antes del deploy)* Abrir desde el QR | Se lee bien al sol; los botones se pueden tocar con el pulgar sin agrandar la pantalla | ☐ |
| 12 | *(Android, Chrome, versión publicada)* Menú (3 puntitos arriba a la derecha) → "Instalar app" | Aparece "Hidrolavadora" con el logo; al abrirla desde el ícono va directo a la máquina | ☐ |
| 13 | *(iPhone, Safari, versión publicada)* Botón de Compartir (el cuadrado con la flecha) → "Agregar a inicio" | Ícono con el logo; al abrirlo ocupa toda la pantalla (sin la barra de Safari arriba) | ☐ |
| 14 | *(celular, app ya instalada — producción en MODO DEMO)* Desde el ícono instalado: patente → "Pagar" → en la pantalla de pago simulado tocar "APROBAR" → "VOLVER A LA MÁQUINA". **En demo "Pagar" NO abre Mercado Pago**: abre la pantalla de simulación (APROBAR / RECHAZAR), no se cobra nada | Muestra "Pago aprobado" **sin salirse de la app instalada** | ☐ |
| 14b | *(PENDIENTE para el día de Mercado Pago real, no ahora)* Pagar de verdad desde la app instalada y volver de Mercado Pago | La vuelta cae en la app instalada y sigue sola a "Pago aprobado". **Riesgo a mirar en iPhone:** que la vuelta abra Safari en vez de la app | ☐ |
| 15 | En la PC, abrir `http://127.0.0.1:5173/admin` → ingresar usuario `admin@hidro.local` y contraseña `hidro-demo-2025` → tocar "Ingresar" | Menú lateral blanco con el logo, Dashboard con 6 números arriba, tarjetas de máquinas, tabla "Últimas sesiones" abajo | ☐ |
| 16 | Con el panel abierto: tocar el botón de luna, y después achicar la ventana del navegador (o mirarlo en el celular) | Oscuro se ve legible; con la ventana angosta el menú pasa arriba y se puede deslizar de costado | ☐ |

---

## Casos borde a probar

Estos no van en orden, se prueban aparte, con el sistema ya prendido (Preparación hecha):

- **Sin internet durante el lavado:** ⚠️ Este caso es en la pantalla **del cliente** (la del aro
  con la cuenta regresiva) — **NO** en la pantalla "ESP32 SIMULADOR" (la de "PRESIONAR PULSADOR").
  Esa otra pantalla es una herramienta de desarrollo y es NORMAL que diga "Simulador no
  disponible" sin conexión; eso no es un error, es la pantalla equivocada para este caso.
  1. Arrancar un lavado (patente `AE100AA` → tarifa → pagar → APROBAR → VOLVER A LA MÁQUINA →
     abrir la máquina simulada → PRESIONAR PULSADOR).
  2. Tocar la flechita **←** de arriba a la izquierda para volver a la pantalla del cliente — tiene
     que verse el aro grande con el tiempo bajando ("¡A lavar!"). Quedarse en ESTA pantalla.
  3. F12 → pestaña "Network" (o "Red") → el desplegable "No throttling" → elegir "Offline".
  4. **Tiene que aparecer** "Sin conexión. La máquina sigue funcionando." y la cuenta **seguir
     bajando** (antes de este arreglo, volvía al paso 1 — eso ya NO tiene que pasar).
  5. Volver el desplegable a "No throttling": el aviso desaparece solo.
- **Máquina que no existe:** en el navegador, ir a `http://127.0.0.1:5173/machine/NO-EXISTE` →
  tiene que decir "Esta máquina no existe" (antes de este arreglo quedaba cargando para siempre).
- **PIN a medio escribir:** escribir una patente válida (por ejemplo `AE100AA`) y en el PIN
  escribir solo `12`, tocar "Ver mi tarifa" → tiene que decir "El PIN son 4 dígitos." (NO tiene
  que decir "Patente inválida").
- **Máquina ocupada:** con un lavado en curso (otra pestaña del navegador en el mismo paso 10),
  abrir la máquina de nuevo en una pestaña nueva → aviso naranja "La máquina está en uso", **sin**
  el texto "Paso 1 de 3" arriba.
- **Patente muy corta o muy larga:** escribir `ABC` y tocar "Ver mi tarifa" → el botón deja tocar
  pero da "Patente inválida (ej: AG945RS)."; escribir 11 letras seguidas → mismo mensaje.
- **Error después de pagar:** durante un lavado en curso, en "la máquina simulada" tocar "SIMULAR
  CORTE DE INTERNET" → la pantalla del cliente tiene que mostrar qué pasó, "Tu pago quedó
  registrado" y un **código** para darle a la cooperativa.
- **Modo privado del navegador:** abrir una ventana de incógnito (Ctrl+Shift+N en Chrome) y entrar
  a la misma dirección → la página tiene que funcionar igual (no va a recordar el tema entre
  visitas, pero no se puede romper ni quedar en blanco).
- **Consola del navegador sin errores:** con la página abierta, apretar F12 → pestaña "Console" →
  no tiene que haber ningún renglón en rojo que diga "Content Security Policy".

---

## Al terminar la prueba

1. Volvé a las dos ventanas azules (Paso B y Paso C de la Preparación).
2. En cada una, apretá **Ctrl+C** (puede pedir confirmar con `S` + Enter) y después cerrá la
   ventana con la X.
3. Ya se puede cerrar también el navegador.

## Veredicto del humano
- [x] Todos los pasos OK → puerta (b) verde. **Validado por el humano el 2026-09-25:** 1–10b y
  casos borde en local; 11–14 en el celular contra producción (deploy `29c7783`). Queda
  pendiente solo el 14b, que depende de activar Mercado Pago real.
- [ ] Hay problemas → anotá cuáles (con número de paso) y la fase NO cierra:
  - …

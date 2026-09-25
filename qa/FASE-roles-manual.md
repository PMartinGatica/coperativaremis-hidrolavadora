# Guía de test manual — Roles y usuarios (admin / operador) · Mundo: HIDRO SELF-SERVICE

> La puerta (b) del gate. El agente escribe esta guía; el HUMANO la sigue a mano y la valida.
> Cubre lo que las pruebas automáticas NO juzgan: si una persona de la cooperativa entiende qué
> puede y qué no puede hacer, si los avisos se entienden, y si el alta de una cuenta se puede
> hacer sin ayuda. Plan: `docs/designs/roles-usuarios.md` · ADR-062.
>
> **Cada bloque gris de acá abajo se copia tal cual (Ctrl+C) y se pega tal cual (Ctrl+V).**
> Si algo no coincide con lo que dice "Tiene que aparecer", parar, sacar una captura y avisar.

## Qué vas a validar
Que existen tres tipos de cuenta y cada una ve solo lo suyo:

| Cuenta | Quién | Qué puede |
|---|---|---|
| **Soporte técnico (Insolva)** | nosotros (la cuenta de siempre) | todo lo técnico y crear cuentas; **no** destraba pagos |
| **Administrador** | Javier | todo lo del negocio: patentes, precios, límite diario, cuentas |
| **Operador** | la persona de mesa de entrada | mirar, destrabar pagos, detener la máquina |

---

## Preparación (una vez)

Es la misma de la guía anterior (`qa/FASE-identidad-visual-manual.md`, Pasos A a C): compilar,
prender el servidor en DEMO y prender la página. Resumen para quien ya la hizo:

1. Ventana azul 1, en `D:\insolva\Desarrollo\Madre\mundos\hidro-self-service`:
   ```powershell
   npm run build
   ```
2. En la misma ventana, una línea por vez:
   ```powershell
   cd D:\insolva\Desarrollo\Madre\mundos\hidro-self-service\apps\api
   ```
   ```powershell
   $env:PAYMENT_PROVIDER = "demo"
   ```
   ```powershell
   node dist\index.js
   ```
   **✅ Tiene que aparecer** `"payments":"DEMO MODE"`. No cerrar esta ventana. Para apagarla al
   final: **Ctrl+C** (nunca cerrarla con la X: se rompe la base de prueba).
3. Ventana azul 2, en la misma carpeta del proyecto:
   ```powershell
   npm run dev:web
   ```
4. Vas a usar **dos ventanas del navegador**: una normal y una **de incógnito** (Ctrl+Shift+N en
   Chrome/Edge). Así hay dos personas logueadas a la vez, como en la cooperativa.

> La primera vez que entres después de actualizar, el panel te va a mandar al login con el aviso
> "Tu cuenta fue modificada por un administrador". Es esperado: el cambio de roles cierra todas las
> sesiones abiertas una vez.

---

## Pasos

Anotá en un papel las claves que genera el sistema: las vas a usar en los pasos siguientes.

| # | Acción | Resultado esperado | ¿OK? |
|---|---|---|---|
| 1 | Ventana **normal**: abrir `http://127.0.0.1:5173/admin/login`, entrar con `admin@hidro.local` / `hidro-demo-2025` | Arriba a la derecha, un chip con **"Soporte técnico (Insolva)"**. En el menú, al final, **Usuarios** | |
| 2 | Tocar **Usuarios** | Una sola fila: "Soporte técnico (Insolva)", **sin** botón "Gestionar". Abajo: "Todavía no hay más cuentas" y una línea que explica para qué es la cuenta de Insolva | |
| 3 | **Nuevo usuario** → Nombre `Javier`, Email `javier@coop.local`, rol **Administrador**, tocar **Generar una** en la clave → **Crear cuenta** | Pantalla **"Cuenta creada"** con el email, la clave inicial, y dos botones: **Copiar** y **Enviar por WhatsApp**. El texto dice que la va a tener que cambiar al entrar | |
| 4 | Tocar **Copiar**, pegar en un Bloc de notas | Aparece un mensaje con el link al panel, el email y la clave | |
| 5 | **Listo** → **Nuevo usuario** otra vez con el mismo email `javier@coop.local` | Error al lado del formulario: **"Ya existe una cuenta con ese email."** Lo que escribiste no se borra | |
| 6 | Cerrar ese formulario. Chip de arriba → **Mi cuenta** | Nombre, email, rol. En "Cambiar clave": **"La clave de esta cuenta se gestiona desde el servidor."** (sin formulario) | |
| 7 | **Salir**. Entrar con `javier@coop.local` y la clave inicial del paso 3 | Va directo a **Mi cuenta** con el aviso amarillo "Es tu primera vez: elegí una clave propia". El menú está vacío | |
| 8 | Poner la clave inicial en "Clave que te pasaron", una clave nueva **corta** (`12345`) → **Cambiar clave** | Error: "La clave nueva tiene que tener al menos 10 caracteres." | |
| 9 | Clave nueva `javier-clave-1` → **Cambiar clave** | Vuelve al **Dashboard**, sin pedir login de nuevo. Chip: **"Javier · Administrador"** | |
| 10 | **Usuarios** → **Nuevo usuario**: `Pedro`, `pedro@coop.local`, **Operador**, **Generar una** → Crear | "Cuenta creada". Anotar la clave. En la lista: Pedro con "Falta que entre" | |
| 11 | En la fila de la cuenta de Insolva | Está, con el rol "Soporte técnico (Insolva)", **sin** botón Gestionar | |
| 12 | En tu propia fila (dice "(vos)") → **Gestionar** | El selector de Rol está **gris** con el motivo "No podés cambiarte el rol a vos mismo". "Desactivar cuenta" gris con "No podés desactivar tu propia cuenta" | |
| 13 | Cerrar. **Ajustes** | Solo **"Lavados por día POR PATENTE"** se puede editar. Los demás (TTL, heartbeat, etc.) aparecen como texto con la línea "Los ajustes técnicos los maneja el soporte técnico de Insolva." | |
| 14 | Cambiar lavados por día a `3` → **GUARDAR** | "✓ GUARDADO" (sin error de permiso). Volver a ponerlo en `2` y guardar | |
| 15 | **Máquinas** | En cada máquina: EDITAR, GENERAR QR y DETENER MÁQUINA. **No** aparece "ROTAR SECRET" | |
| 16 | Ventana de **incógnito**: `http://127.0.0.1:5173/admin/login`, entrar como `pedro@coop.local` con su clave inicial, cambiarla por `pedro-clave-1` | Vuelve al Dashboard. Chip: **"Pedro · Operador"**. En el menú **no** está "Usuarios" | |
| 17 | (Pedro) **Patentes** | Se ve la lista, con la línea "Solo un administrador puede cambiar esto." **Sin** formulario de alta y **sin** botones de borrar | |
| 18 | (Pedro) **Máquinas** | Solo GENERAR QR y DETENER MÁQUINA | |
| 19 | (Pedro) **Ajustes** | Todo como texto, con "Solo un administrador puede cambiar esto." Sin botón GUARDAR | |
| 20 | (Pedro) En la barra de direcciones: `http://127.0.0.1:5173/admin/users` | Vuelve al Dashboard (no ve la página) | |
| 21 | Ventana **normal** (Javier): **Usuarios** → Pedro → **Gestionar** → **Desactivar cuenta** | Confirmación: **"Pedro queda afuera del panel en el acto."** → **Sí, desactivar**. Pedro queda atenuado, "Desactivada", al final de la lista | |
| 22 | Ventana de **incógnito** (Pedro): esperar hasta 10 segundos, o tocar cualquier sección | Lo saca al login con el aviso **"Tu cuenta fue desactivada por un administrador."** | |
| 23 | (Pedro) Intentar entrar con `pedro-clave-1` | "Credenciales inválidas." (el mismo mensaje que una clave mal) | |
| 24 | (Javier) Pedro → Gestionar → **Reactivar cuenta**; después **Resetear clave** → **Sí, resetear** | Pantalla "Clave reseteada" con la clave nueva y Copiar / WhatsApp | |
| 25 | (Pedro) Entrar con la clave reseteada | Lo manda a Mi cuenta a elegir clave propia (como el paso 7) | |
| 26 | (Javier) **Registros** | Aparecen `USER_CREATED`, `USER_UPDATED`, `USER_PASSWORD_RESET` con el email de Javier, y `PASSWORD_CHANGED` de Pedro. En ningún lado se ve una clave | |
| 27 | (Pedro, con su clave propia) abrir en el celular o achicar la ventana a lo ancho de un celular | El chip de arriba muestra solo "Pedro" (sin cortar el logo), el menú se desliza de costado. Todo se toca con el dedo sin errar | |
| 28 | **Destrabar un pago** — ventana normal, entrar de nuevo como `admin@hidro.local` → **Ajustes** → "Timeout de pago pendiente" en `60` → GUARDAR | ✓ GUARDADO | |
| 29 | Pestaña nueva: `http://127.0.0.1:5173/machine/HIDRO-01`, patente `AE100AA` → pagar, y en SIMULAR PAGO **no tocar nada**. Esperar 2 minutos | — | |
| 30 | (técnico) **Sesiones** → la última (PAYMENT_EXPIRED) → abrirla | En vez de los botones de reconciliar: "Destrabar pagos lo hace una persona de la cooperativa con su propia cuenta…" | |
| 31 | (Pedro, incógnito) abrir esa misma sesión → **Reintentar automático** | Responde con un mensaje de negocio ("Todavía no aparece ningún pago aprobado…"), **no** "No tenés permiso" | |
| 32 | (técnico) **Ajustes** → "Timeout de pago pendiente" otra vez en `600` → GUARDAR | ✓ GUARDADO | |

---

## En producción (después del deploy) — el arranque

Tras el deploy **no hay ningún administrador**: solo existe la cuenta de Insolva. Por eso:

| # | Acción | Resultado esperado | ¿OK? |
|---|---|---|---|
| P1 | Abrir `https://hidro-api.insolvadev.com/admin` con la sesión que tuvieras abierta | Te saca al login con "Tu cuenta fue modificada por un administrador. Volvé a entrar." (una sola vez) | |
| P2 | Entrar con la cuenta de Insolva → Usuarios → crear la de **Javier** (Administrador) → **Enviar por WhatsApp** a Javier | Javier recibe el link, el email y la clave inicial | |
| P3 | Javier entra desde su celular, elige su clave | Llega al Dashboard como "Administrador" | |
| P4 | Javier crea la cuenta del **operador** y se la pasa | El operador entra y cambia su clave | |
| P5 | El operador destraba un pago simulado (como los pasos 28–31) | Su email queda en Registros | |

> **Recomendación para Javier:** con una sola cuenta de administrador, si Javier se olvida la clave
> no hay otro admin que se la resetee. No queda trabado: la cuenta de Insolva **sí** puede resetear
> la clave de un admin (Usuarios → Gestionar → Resetear clave). Si más adelante suman una segunda
> persona de confianza, conviene que sea administrador también.

---

## Qué NO cubre esta guía
- Recuperar la clave por mail (no existe: la resetea un admin o Insolva).
- Que un admin no pueda entrar como otro admin reseteándole la clave: es un riesgo aceptado a esta
  escala (ADR-062). La auditoría registra quién reseteó.

## Validación
- [ ] Pasos 1–32 OK en la PC
- [ ] P1–P5 OK en producción
- Validado por: ______________ · Fecha: ______________

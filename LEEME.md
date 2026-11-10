# Aivoharjoitus: puesta en marcha

Web gratuita con tres tipos de acceso:

| Rol | Qué puede hacer |
|---|---|
| **Administrador** (ylläpitäjä) | Todo lo del usuario, y además: crear usuarios y administradores, cambiar roles, desactivar cuentas, enviar enlaces para cambiar la clave y abrir el código del programa (GitHub). |
| **Usuario** (ohjaaja) | Crear partidas con una duración aproximada, mostrar el enlace y el QR, iniciar la partida, ver la carrera en tiempo real y usar el botón Stop. |
| **Jugador** | Solo entra con el enlace o QR de una partida. Escribe su nombre y juega. No puede cambiar nada más. |

**Botón Stop:** al pulsarlo la primera vez, la partida pasa a terminar en unos 5 minutos. Cada pulsación siguiente quita 1 minuto. Si con una pulsación el tiempo llega a 0, la partida se corta en ese mismo momento.

## Cómo funciona una partida
- **Ejercicios mezclados:** Muisti, Luokittelu y Tarkkaavuus salen al azar, pero nunca más de dos preguntas seguidas de la misma categoría.
- **Niveles:** cada jugador elige su propio nivel inicial (1–4) al entrar. Todas sus categorías empiezan en ese nivel, y después cada una sube o baja por separado: 2 aciertos seguidos suben un nivel y 2 fallos seguidos bajan uno.
- **Quitar Tarkkaavuus:** en las preguntas de atención, el jugador tiene el botón «En näe kuvioita hyvin – poista tämä harjoitus». Después de confirmar, solo le salen Muisti y Luokittelu durante esa partida.
- **Color del grupo:** al entrar, cada jugador vota uno de 10 colores. Al pulsar «Aloita peli» se elige al azar entre los colores más votados, y ese es el color de la ficha del grupo.
- **Carrera:** los puntos de todos los jugadores se suman en un solo corredor, el **Ryhmä**. Corren con él cuatro corredores automáticos (Kettu, Jänis, Orava y Siili), con colores distintos del del grupo.
  - El automático más adelantado le disputa la carrera al grupo: va entre 2 casillas por detrás y 1 por delante. Cuando al grupo le faltan 4 casillas para la meta, se coloca justo 1 casilla por detrás y cruza la meta inmediatamente después del grupo.
  - Los demás nunca frenan: van entre 0 y 8 casillas por detrás del grupo, y cuando faltan 4 casillas para la meta, entre 1 y 8 por detrás.
  - Pista: el carril del grupo es verde, o marrón si el grupo eligió el verde. Los carriles de los automáticos alternan verde y marrón.
- **Tiempo:** no se muestra en ninguna pantalla. La duración que elige el ohjaaja es solo una orientación de cuánto va a durar la actividad.
- **Meta:** aparece aproximadamente un minuto antes del final previsto, a una distancia equivalente a más o menos un minuto de trabajo del grupo. **La partida espera a que el grupo llegue**: no termina por tiempo. Cuando la ficha del grupo cruza la meta, el grupo gana.
- **Final brusco:** si la partida se corta de golpe con Stop antes de que el grupo llegue a la meta, el grupo pierde.

**Claves:** el administrador pone una clave provisional al crear un usuario (se muestra solo en ese momento). Después las claves se guardan cifradas y nadie puede verlas. El administrador puede enviar un enlace para cambiarla, y cada usuario puede cambiar la suya en «Oma tili».

Todo funciona con el **plan gratuito Spark de Firebase** (Google) y **GitHub Pages**. No hace falta tarjeta de crédito. Se configura una sola vez, en unos 30-45 minutos.

---

## 1. Crear el proyecto de Firebase
1. Entra en https://console.firebase.google.com con una cuenta de Google y pulsa **Crear un proyecto**. Ponle de nombre, por ejemplo, `aivoharjoitus`. Google Analytics no es necesario.
2. En el menú, abre **Compilación → Authentication → Comenzar**. En la pestaña **Método de acceso**, activa:
   - **Correo electrónico/contraseña**
   - **Anónimo** (para los jugadores)
3. Abre **Compilación → Firestore Database → Crear base de datos**:
   - Ubicación: **europe-north1 (Finlandia)**, para que los datos se queden en la UE.
   - Modo: **producción**.
4. En Firestore, abre la pestaña **Reglas**. Borra lo que haya, pega el contenido completo del archivo `firestore.rules` y pulsa **Publicar**.
5. Abre **Configuración del proyecto** (el engranaje) → **Tus apps** → icono **`</>`** (Web). Registra la app (no hace falta Hosting). Copia los valores de `firebaseConfig` y pégalos en `js/firebase-config.js`, sustituyendo cada `PEGA_AQUI`.

## 2. Publicar la web en GitHub Pages
1. Crea una cuenta en https://github.com si no tienes.
2. Crea un repositorio **público** llamado `aivoharjoitus`.
3. Pulsa **Add file → Upload files** y arrastra **todo el contenido** de esta carpeta, con las carpetas `css` y `js` incluidas. Pulsa **Commit changes**.
4. Ve a **Settings → Pages**. En *Source* elige **Deploy from a branch**, en *Branch* elige **main** y **/(root)**, y pulsa **Save**.
5. En uno o dos minutos la web estará en `https://TU-USUARIO.github.io/aivoharjoitus/`.
6. Vuelve a Firebase: **Authentication → Configuración → Dominios autorizados → Agregar dominio**, y añade `TU-USUARIO.github.io`.
7. (Opcional) En `js/firebase-config.js`, pon en `REPO_URL` la dirección del repositorio, para que el administrador tenga un enlace directo al código.

## 3. Primer uso
1. Abre la web. Como todavía no hay ningún administrador, aparece **Käyttöönotto**. Crea ahí tu cuenta de administrador. Esta pantalla solo aparece una vez.
2. En **Käyttäjät** crea las cuentas de tus compañeros, como *Ohjaaja* o *Ylläpitäjä*.
3. En **Pelit**, crea una partida, elige la duración y pulsa **Luo peli ja näytä kutsu**. Aparecen el QR y el enlace.
4. Los jugadores escanean el QR, escriben su nombre y esperan. Cuando estén todos, pulsa **Aloita peli**.
5. Las fichas avanzan con cada respuesta correcta (1 a 4 puntos según el nivel), y en la pantalla aparece el nombre con los puntos.

**Prueba recomendada antes de usarla con el grupo:** crea una partida de 5 minutos y entra como jugador desde tu móvil. Comprueba que la ficha avanza y que el Stop funciona.

---

## Cambiar el programa
- **Preguntas:** están en `js/bank.js`. La primera opción de cada pregunta es siempre la correcta; el orden se mezcla al mostrarla.
- **Reglas del juego** (subir y bajar de nivel, tiempo de exposición): al principio de `js/exercise.js`.
- **Panel y partidas:** `js/app.js`.
- Para editar en GitHub, abre el archivo, pulsa el lápiz y luego **Commit changes**. La web se actualiza en uno o dos minutos.

## Datos y privacidad
- De los jugadores solo se guardan el nombre que escriben y sus puntos de cada partida. Es mejor usar el nombre de pila o un apodo.
- De los usuarios se guardan el nombre, el correo y el rol. Las claves las gestiona Firebase de forma cifrada.
- El plan gratuito permite unas 50.000 lecturas y 20.000 escrituras al día, más que suficiente para varios grupos.

## Seguridad (resumen de `firestore.rules`)
- Solo los administradores pueden ver o crear usuarios y cambiar roles. Nadie puede cambiar su propio rol.
- Solo el personal puede crear partidas. Solo quien creó la partida, o un administrador, puede iniciarla o pararla.
- Cada jugador solo puede crear y modificar su propia ficha: entre 1 y 4 puntos por respuesta, y solo mientras corre el tiempo.

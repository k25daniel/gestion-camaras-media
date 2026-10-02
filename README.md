# Gestión Cámaras Media

Sistema web de gestión, planificación de camarógrafos y control de ISOs de cámaras para los servicios de PAS Media, con sincronización en tiempo real desde **Planning Center Online (PCO) Services**.

---

## 🔑 Sincronización con Planning Center Online (Services)

La aplicación utiliza tus **Personal Access Tokens** oficiales de Planning Center:
👉 [https://api.planningcenteronline.com/personal_access_tokens](https://api.planningcenteronline.com/personal_access_tokens)

Obtendrás:
- **Application ID**
- **Secret**

### Opción 1: Google Apps Script Web App (Recomendado para GitHub Pages / Móvil)
Los navegadores bloquean por seguridad (CORS) las llamadas directas a la API de Planning Center. Usar Google Apps Script como puente permite sincronizar desde cualquier navegador sin ningún bloqueo:

1. Ve a [script.google.com](https://script.google.com) y crea un nuevo proyecto o abre tu proyecto existente.
2. Pega el código de [`codigo.gs`](./codigo.gs).
3. Haz clic en **Implementar** (Deploy) → **Nueva implementación** (New deployment).
4. Elige tipo: **Aplicación web** (Web app).
   - **Ejecutar como (Execute as):** *Yo (tu correo)*.
   - **Quién tiene acceso (Who has access):** *Cualquiera (Anyone)*. *(Indispensable para permitir la conexión desde la web)*.
5. Copia la **URL de la aplicación web** generada (termina en `/exec`).
6. En la aplicación web (botón *Sincronizar Planning Center*), ingresa:
   - Tu **Application ID**
   - Tu **Secret**
   - La **URL de tu Web App de Google Apps Script**
7. Presiona **Comenzar Sincronización**. Se sincronizarán automáticamente todos los miembros de Media y los planes futuros a Firebase.

---

### Opción 2: Servidor Local con Proxy Integrado
Si trabajas desde tu computadora local:

```bash
# Instalar dependencias e iniciar el servidor
npm start
```

Abre en tu navegador:
```
http://localhost:3000
```
El servidor Node.js local (`server.js`) enruta automáticamente las peticiones de Planning Center mediante `/pco-api` sin restricciones de CORS.

---

### Opción 3: Sincronizador por Terminal (Python CLI)
Para sincronizar directamente a Firebase sin abrir el navegador:

```bash
python3 scripts/sync_pco.py <TU_APPLICATION_ID> <TU_SECRET>
```

---

## 📹 Planificación de Cámaras e ISOs

Cada cámara en la pestaña de planificación permite:
- Asignar camarógrafo y capacitador.
- **Seleccionar el perfil ISO** (por ejemplo: *ISO 100*, *ISO 200*, *ISO 400*, *ISO 800*, *ISO 1600*, *ISO 3200*, o valor personalizado).
- Guardar la asignación y visualizar el historial con insignias detalladas de ISO por servicio.
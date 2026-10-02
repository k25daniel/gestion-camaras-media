# Gestión Cámaras Media

Sistema web de gestión, planificación de camarógrafos y control de ISOs de cámaras para los servicios de PAS Media, con sincronización de **Planning Center Online (PCO) Services**.

Todo el proyecto se encuentra y ejecuta 100% en GitHub y Firebase, sin necesidad de herramientas externas como Google Apps Script.

---

## 🔑 Sincronización con Planning Center Online (Services)

La aplicación utiliza tus **Personal Access Tokens** oficiales de Planning Center:
👉 [https://api.planningcenteronline.com/personal_access_tokens](https://api.planningcenteronline.com/personal_access_tokens)

Obtendrás:
- **Application ID**
- **Secret**

---

### Opción 1: GitHub Actions (Automático en la nube con 1 Clic)
La sincronización se ejecuta directamente en la infraestructura de GitHub hacia Firestore, sin problemas de CORS ni navegadores:

1. Ve a la pestaña **Actions** en tu repositorio de GitHub:
   👉 [Ejecutar Flujo de Sincronización en GitHub Actions](https://github.com/k25daniel/gestion-camaras-media/actions/workflows/pco-sync.yml)
2. Presiona el botón **Run workflow**.
3. Opcionalmente puedes ingresar tu **Application ID** y **Secret** en el formulario, o guardarlos de forma permanente en **Settings** → **Secrets and variables** → **Actions** (`PCO_APP_ID` y `PCO_SECRET`).
4. El flujo descargará automáticamente:
   - Los miembros de todos los equipos de Media (Servicio Finde, LINK, KZN, Servicio Jueves).
   - Todos los planes futuros y sus camarógrafos/directores asignados.
   - Los guardará en Firebase Firestore en segundos.

*Nota: Este flujo también corre de forma automática de martes a sábado.*

---

### Opción 2: Servidor Local en PC
Para trabajar localmente en tu computadora:

```bash
# Iniciar servidor con proxy PCO integrado
npm start
```

Abre en tu navegador:
```
http://localhost:3000
```
Desde la interfaz web presiona **Sincronizar Planning Center**, escribe tu Application ID y Secret, y el proxy local enrutará las peticiones en vivo sin ningún bloqueo.

---

### Opción 3: Sincronización Directa por Terminal
```bash
python3 scripts/sync_pco.py <TU_APPLICATION_ID> <TU_SECRET>
```

---

## 📹 Planificación de Cámaras e ISOs

Cada cámara en la pestaña de planificación permite:
- Asignar camarógrafo y capacitador.
- **Seleccionar el perfil ISO** (por ejemplo: *ISO 100*, *ISO 200*, *ISO 400*, *ISO 800*, *ISO 1600*, *ISO 3200*, o valor personalizado).
- Guardar la asignación y visualizar el historial con insignias detalladas de ISO por servicio.
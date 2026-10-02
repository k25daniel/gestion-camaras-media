/**
 * PAS MEDIA — Asignación automática con Planning Center Services
 * Integración híbrida con Google Apps Script y Gestión Cámaras Media
 * =================================================================
 */

// ==================== CONFIGURACIÓN ====================
const SHEET_ROSTER = "Roster";
const PC_BASE = "https://api.planningcenteronline.com/services/v2";
const PC_PEOPLE_BASE = "https://api.planningcenteronline.com/people/v2";
const MAX_PER_MONTH = 4;

const CANON = ["Productor","Realizador","Switcher","Camaras","JefeDePiso","PP","Arena","Luces","Transmision"];

// IDs oficiales de Planning Center Services para PAS Media
const TEAM_IDS = { 
  Finde: "2982202", 
  LINK: "3047884", 
  KZN: "3075184", 
  Jueves: "4496712" 
};

const SERVICE_TYPE_IDS = { 
  Finde: "753549", 
  LINK: "779373", 
  KZN: "779364", 
  Jueves: "1138448" 
};

const SERVICES = {
  Finde:  {label:"Servicio Finde", serviceTypeId: "753549", teamId: "2982202", weekday:6 /*Sábado*/, cost:2, needsRealizador:true, needsSwitcher:true, camaras:5,
           slots:["JefeDePiso","PP","Arena","Luces","Transmision"], hardRest:true},
  KZN:    {label:"KZN", serviceTypeId: "779364", teamId: "3075184", weekday:2 /*Martes*/, cost:1, camaras:0, slots:["PP","Luces"]},
  LINK:   {label:"LINK", serviceTypeId: "779373", teamId: "3047884", weekday:3 /*Miércoles*/, cost:1, needsRoS:true, camaras:3, slots:["PP","Luces","JefeDePiso"]},
  Jueves: {label:"Servicio Jueves", serviceTypeId: "1138448", teamId: "4496712", weekday:4 /*Jueves*/, cost:1, needsProductor:true, needsRoS:true, camaras:4,
           slots:["JefeDePiso","PP","Arena","Luces"]},
};

// ==================== WEB APP ENTRY POINTS (API PARA APLICACIÓN WEB) ====================

/**
 * Endpoint GET para ser consumido desde la aplicación web o navegador.
 * Soporta CORS automáticamente en Google Apps Script.
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  
  // Si se llama como API con parámetros (ej: ?action=sync)
  if (params.action || params.apiPath || params.appId) {
    return handleApiRequest_(params);
  }
  
  // Si se abre directamente en el navegador como interfaz WebApp
  try {
    return HtmlService.createHtmlOutputFromFile("WebApp")
      .setTitle("PAS Media - Planning Center")
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "ok",
      name: "PAS Media Planning Center API Bridge",
      version: "2.0",
      message: "Google Apps Script activo. Conéctate enviando parámetros como ?action=sync&appId=...&secret=..."
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Endpoint POST para llamadas con cuerpo JSON.
 */
function doPost(e) {
  var params = {};
  if (e && e.postData && e.postData.contents) {
    try {
      params = JSON.parse(e.postData.contents);
    } catch (err) {
      params = e.parameter || {};
    }
  } else if (e && e.parameter) {
    params = e.parameter;
  }
  return handleApiRequest_(params);
}

/**
 * Enrutador principal de la API para sincronizar o consultar Planning Center.
 */
function handleApiRequest_(params) {
  try {
    var action = (params.action || "sync").toLowerCase();
    
    // Obtener credenciales: desde parámetros o desde Propiedades del Script
    var appId = params.appId || params.app_id || PropertiesService.getScriptProperties().getProperty("PC_APP_ID");
    var secret = params.secret || PropertiesService.getScriptProperties().getProperty("PC_SECRET");
    
    // Opcional: si vienen credenciales y se pide recordarlas
    if (params.guardarCredenciales === "true" && params.appId && params.secret) {
      PropertiesService.getScriptProperties().setProperties({
        PC_APP_ID: String(params.appId).trim(),
        PC_SECRET: String(params.secret).trim()
      });
    }

    if (action === "ping") {
      return jsonResponse_({ status: "ok", message: "Conexión con Google Apps Script exitosa" });
    }

    if (!appId || !secret) {
      return jsonResponse_({
        status: "error",
        error: "Faltan credenciales: proporciona appId y secret de Planning Center Personal Access Tokens."
      });
    }

    var authHeader = "Basic " + Utilities.base64Encode(appId.trim() + ":" + secret.trim());

    // ACCIÓN: Proxy genérico para cualquier ruta de Planning Center
    if (action === "proxy" && params.apiPath) {
      var rawResult = pcDirectFetch_(params.apiPath, authHeader);
      return jsonResponse_(rawResult);
    }

    // ACCIÓN: Sincronización completa (Miembros de Media + Próximos Planes)
    if (action === "sync" || action === "get_members" || action === "get_team_members") {
      var syncResult = ejecutarSincronizacionCompleta_(authHeader, params);
      return jsonResponse_(syncResult);
    }

    // ACCIÓN: Solo planes
    if (action === "get_plans") {
      var planes = obtenerPlanesApi_(authHeader, params.startDate, params.endDate);
      return jsonResponse_({ status: "success", success: true, plans: planes });
    }

    // ACCIÓN: Solo bloqueos de una persona
    if (action === "get_blockouts" && params.personId) {
      var bloqueos = fetchBlockoutsForPersonDirect_(params.personId, params.startDate, params.endDate, authHeader);
      return jsonResponse_({ status: "success", success: true, blockouts: bloqueos });
    }

    return jsonResponse_({ status: "error", error: "Acción no reconocida: " + action });

  } catch (err) {
    return jsonResponse_({
      status: "error",
      error: err.message || String(err)
    });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================== FUNCIONES AUXILIARES DE CONSULTA API ====================

function pcDirectFetch_(path, authHeader) {
  var url = path.indexOf("http") === 0 ? path : (PC_BASE + (path.indexOf("/") === 0 ? path : "/" + path));
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: authHeader, Accept: "application/json" },
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  var body = resp.getContentText();
  if (code >= 300) {
    throw new Error("Planning Center HTTP " + code + ": " + body.slice(0, 300));
  }
  return JSON.parse(body);
}

function pcDirectFetchAll_(path, authHeader) {
  var all = [];
  var url = path.indexOf("http") === 0 ? path : (PC_BASE + (path.indexOf("/") === 0 ? path : "/" + path));
  
  for (var page = 0; page < 20; page++) {
    var resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: authHeader, Accept: "application/json" },
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code >= 300) throw new Error("Planning Center HTTP " + code + ": " + resp.getContentText().slice(0, 300));
    var json = JSON.parse(resp.getContentText());
    all = all.concat(json.data || []);
    var next = json.links && json.links.next;
    if (!next) break;
    url = next;
  }
  return all;
}

/**
 * Consulta los miembros de los 4 equipos de PAS Media y planes futuros
 */
function ejecutarSincronizacionCompleta_(authHeader, params) {
  var teamsToFetch = [
    { key: "Finde", serviceTypeId: "753549", teamId: "2982202", label: "Servicio Finde" },
    { key: "LINK", serviceTypeId: "779373", teamId: "3047884", label: "LINK" },
    { key: "KZN", serviceTypeId: "779364", teamId: "3075184", label: "KZN" },
    { key: "Jueves", serviceTypeId: "1138448", teamId: "4496712", label: "Servicio Jueves" }
  ];

  // Si el usuario especificó solo un teamId
  if (params.scope === "single_team" && params.teamId) {
    teamsToFetch = [{ key: "Custom", serviceTypeId: params.serviceTypeId || "753549", teamId: params.teamId, label: "Equipo " + params.teamId }];
  }

  var membersMap = {};

  teamsToFetch.forEach(function(t) {
    try {
      var path = "/service_types/" + t.serviceTypeId + "/teams/" + t.teamId + "/people?per_page=100";
      var rawPeople = pcDirectFetchAll_(path, authHeader);
      
      rawPeople.forEach(function(p) {
        var id = p.id;
        var attrs = p.attributes || {};
        var firstName = attrs.first_name || "";
        var lastName = attrs.last_name || "";
        var fullName = attrs.full_name || (firstName + " " + lastName).trim();

        if (!membersMap[id]) {
          membersMap[id] = {
            id: id,
            nombre: firstName,
            apellidos: lastName,
            nombreCompleto: fullName,
            equipos: [],
            teamIds: []
          };
        }
        if (membersMap[id].equipos.indexOf(t.label) < 0) {
          membersMap[id].equipos.push(t.label);
          membersMap[id].teamIds.push(t.teamId);
        }
      });
    } catch (e) {
      Logger.log("Error al consultar equipo " + t.label + ": " + e.message);
    }
  });

  // Convertir a lista de miembros ordenada alfabéticamente
  var membersList = Object.values(membersMap).sort(function(a, b) {
    return a.nombreCompleto.localeCompare(b.nombreCompleto);
  });

  // Traer también los próximos planes de cada servicio
  var planesList = [];
  try {
    planesList = obtenerPlanesApi_(authHeader, params.startDate, params.endDate);
  } catch (errPlanes) {
    Logger.log("No se pudieron obtener planes: " + errPlanes.message);
  }

  return {
    status: "success",
    success: true,
    count: membersList.length,
    members: membersList,
    plans: planesList,
    planesCount: planesList.length
  };
}

/**
 * Trae planes futuros de los 4 tipos de servicio
 */
function obtenerPlanesApi_(authHeader, startDate, endDate) {
  var serviceTypes = [
    { key: "Finde", id: "753549", label: "Servicio Finde" },
    { key: "LINK", id: "779373", label: "LINK" },
    { key: "KZN", id: "779364", label: "KZN" },
    { key: "Jueves", id: "1138448", label: "Servicio Jueves" }
  ];

  var allPlans = [];

  serviceTypes.forEach(function(st) {
    try {
      var data = pcDirectFetchAll_("/service_types/" + st.id + "/plans?per_page=100&filter=future&order=sort_date", authHeader);
      data.forEach(function(p) {
        var attrs = p.attributes || {};
        allPlans.push({
          id: p.id,
          serviceTypeKey: st.key,
          serviceTypeName: st.label,
          serviceTypeId: st.id,
          sortDate: attrs.sort_date,
          dates: attrs.dates || attrs.sort_date,
          title: attrs.title || st.label,
          seriesTitle: attrs.series_title || ""
        });
      });
    } catch (e) {
      Logger.log("Error consultando planes para " + st.label + ": " + e.message);
    }
  });

  allPlans.sort(function(a, b) {
    return new Date(a.sortDate) - new Date(b.sortDate);
  });

  return allPlans;
}

function fetchBlockoutsForPersonDirect_(personId, startDate, endDate, authHeader) {
  try {
    var raw = pcDirectFetchAll_("/people/" + personId + "/blockouts?per_page=100&filter=future", authHeader);
    return raw.map(function(d) {
      var attrs = d.attributes || {};
      return {
        id: d.id,
        starts_at: attrs.starts_at,
        ends_at: attrs.ends_at,
        reason: attrs.reason || ""
      };
    });
  } catch (e) {
    return [];
  }
}

// ==================== CREDENCIALES EN GOOGLE APPS SCRIPT ====================

function configurarCredenciales() {
  const ui = SpreadsheetApp.getUi();
  const r1 = ui.prompt("Application ID de Planning Center", "Lo encuentras en https://api.planningcenteronline.com/personal_access_tokens", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  const r2 = ui.prompt("Secret de Planning Center", "El secreto que te dio esa misma página (solo se muestra una vez ahí).", ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;

  PropertiesService.getScriptProperties().setProperties({
    PC_APP_ID: r1.getResponseText().trim(),
    PC_SECRET: r2.getResponseText().trim(),
  });
  ui.alert("Listo. Tus credenciales quedaron guardadas de forma segura en las propiedades del script.");
}

function pcAuthHeader_() {
  const props = PropertiesService.getScriptProperties();
  const appId = props.getProperty("PC_APP_ID");
  const secret = props.getProperty("PC_SECRET");
  if (!appId || !secret) {
    throw new Error("Primero configura tus credenciales de Planning Center en el menú o envíalas por parámetro.");
  }
  return "Basic " + Utilities.base64Encode(appId + ":" + secret);
}

function pcFetch_(path, query) {
  let url = PC_BASE + path;
  if (query) {
    const qs = Object.keys(query).map(function(k){ return encodeURIComponent(k) + "=" + encodeURIComponent(query[k]); }).join("&");
    url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
  }
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: pcAuthHeader_() },
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code >= 300) {
    throw new Error("Error " + code + " consultando Planning Center: " + resp.getContentText().slice(0, 300));
  }
  return JSON.parse(resp.getContentText());
}

function pcFetchAll_(path, query) {
  let all = [];
  let url = PC_BASE + path;
  if (query) {
    const qs = Object.keys(query).map(function(k){ return encodeURIComponent(k) + "=" + encodeURIComponent(query[k]); }).join("&");
    url += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
  }
  for (let page = 0; page < 20; page++) {
    const resp = UrlFetchApp.fetch(url, { headers: { Authorization: pcAuthHeader_() }, muteHttpExceptions: true });
    const code = resp.getResponseCode();
    if (code >= 300) throw new Error("Error " + code + " consultando Planning Center: " + resp.getContentText().slice(0, 300));
    const json = JSON.parse(resp.getContentText());
    all = all.concat(json.data || []);
    const next = json.links && json.links.next;
    if (!next) break;
    url = next;
  }
  return all;
}

// ==================== MENÚ EN GOOGLE SHEETS ====================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("PAS Media")
    .addItem("🚀 Abrir la aplicación", "mostrarLinkApp")
    .addSeparator()
    .addItem("🔑 Configurar credenciales de Planning Center", "configurarCredenciales")
    .addItem("🔒 Configurar código de acceso de la app", "configurarCodigoAcceso")
    .addToUi();
}

function configurarCodigoAcceso() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt("Código de acceso de la app", "Escribe el código que vas a pedirle a la gente antes de entrar:", ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const codigo = resp.getResponseText().trim();
  if (!codigo) { ui.alert("No escribiste ningún código."); return; }
  const hash = hashearCodigo_(codigo);
  PropertiesService.getScriptProperties().setProperty("APP_CODE_HASH", hash);
  ui.alert("✓ Código de acceso guardado (encriptado).");
}

function hashearCodigo_(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto);
  return bytes.map(function(b){ return (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"); }).join("");
}

function webVerificarCodigoAcceso(codigo) {
  const hashGuardado = PropertiesService.getScriptProperties().getProperty("APP_CODE_HASH");
  if (!hashGuardado) return true;
  return hashearCodigo_(String(codigo || "")) === hashGuardado;
}

function mostrarLinkApp() {
  let url;
  try { url = ScriptApp.getService().getUrl(); } catch (e) { url = null; }
  if (!url) {
    SpreadsheetApp.getUi().alert("Esta hoja todavía no está desplegada como Aplicación web. Ve a Extensiones → Apps Script → Implementar → Administrar implementaciones para obtener el link.");
    return;
  }
  const html = HtmlService.createHtmlOutputFromString(
    '<div style="font-family:sans-serif; padding:10px; text-align:center;">' +
    '<p>Abre la aplicación PAS Media en una pestaña nueva:</p>' +
    '<a href="' + url + '" target="_blank" style="display:inline-block; background:#F5A623; color:#141414; padding:10px 22px; border-radius:8px; text-decoration:none; font-weight:bold;">Abrir aplicación</a>' +
    '</div>'
  ).setWidth(340).setHeight(140);
  SpreadsheetApp.getUi().showModalDialog(html, "PAS Media");
}

function panelTieneCredenciales() {
  const props = PropertiesService.getScriptProperties();
  return !!(props.getProperty("PC_APP_ID") && props.getProperty("PC_SECRET"));
}

function panelGuardarCredenciales(appId, secret) {
  if (!appId || !secret) throw new Error("Faltan datos.");
  PropertiesService.getScriptProperties().setProperties({
    PC_APP_ID: appId.trim(),
    PC_SECRET: secret.trim(),
  });
  return true;
}

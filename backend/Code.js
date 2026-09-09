// ==========================================
// CONFIGURACIÓN DE PINES MAESTROS (Fallback)
// ==========================================
const MASTER_DIRECTOR_PIN = "2017";
const MASTER_ADMIN_PIN    = "1997";

// Registra una fila en la hoja de Auditoría
function logAuditoria(usuario, rol, accion, detalle) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    initSheetsIfNeeded(ss);
    var sheet = getSheetByNameRobust(ss, 'Auditoria');
    if (sheet) {
      var fechaHora = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "GMT-6", "yyyy-MM-dd HH:mm:ss");
      sheet.appendRow([fechaHora, String(usuario || 'Anónimo').trim(), String(rol || '').trim(), String(accion || '').trim(), String(detalle || '').trim()]);
    }
  } catch (err) {
    console.error("Error al registrar auditoria:", err);
  }
}

// Obtiene la lista de usuarios activos para el login
function getUsuariosLogin() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  initSheetsIfNeeded(ss);
  var userSheet = getSheetByNameRobust(ss, 'Usuarios');
  var data = userSheet.getDataRange().getValues();
  var usuarios = [];
  
  for (var i = 1; i < data.length; i++) {
    var nombre = String(data[i][0] || '').trim();
    var rol = String(data[i][2] || 'director').trim().toLowerCase();
    var activo = data[i][3] === true || String(data[i][3]).toLowerCase() === 'true' || data[i][3] === '';
    
    if (nombre && activo) {
      usuarios.push({
        nombre: nombre,
        rol: rol
      });
    }
  }
  return usuarios;
}

// Valida credenciales de un usuario
function authenticateUser(nombre, pin) {
  var cleanNombre = String(nombre || '').trim();
  var cleanPin = String(pin || '').trim();

  // Maestro Admin Fallback
  if (cleanPin === MASTER_ADMIN_PIN) {
    return {
      success: true,
      usuario: cleanNombre || "Admin Maestro",
      rol: "admin"
    };
  }

  // Maestro Director Fallback
  if (cleanPin === MASTER_DIRECTOR_PIN) {
    return {
      success: true,
      usuario: cleanNombre || "Director Maestro",
      rol: "director"
    };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  initSheetsIfNeeded(ss);
  var userSheet = getSheetByNameRobust(ss, 'Usuarios');
  var data = userSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowUser = String(data[i][0] || '').trim();
    var rowPin = String(data[i][1] || '').trim();
    var rowRol = String(data[i][2] || 'director').trim().toLowerCase();
    var rowActivo = data[i][3] === true || String(data[i][3]).toLowerCase() === 'true' || data[i][3] === '';

    if (rowUser.toLowerCase() === cleanNombre.toLowerCase() && rowActivo) {
      if (rowPin === cleanPin) {
        return {
          success: true,
          usuario: rowUser,
          rol: rowRol
        };
      }
    }
  }

  return { success: false, error: "Credenciales incorrectas" };
}

// Valida si las credenciales pasadas en peticiones tienen el rol requerido
function verifyAuthToken(usuario, pin, nivelRequerido) {
  var auth = authenticateUser(usuario, pin);
  if (!auth.success) return false;
  if (nivelRequerido === 'admin') return auth.rol === 'admin';
  if (nivelRequerido === 'director') return auth.rol === 'director' || auth.rol === 'admin';
  return true; // Cualquier usuario autenticado
}

function doGet(e) {
  var action = e.parameter.action;
  var output = {};
  
  try {
    if (action === 'getPublicUsuarios') {
      // Devuelve únicamente nombres y roles públicos para el dropdown de Login
      output = { usuarios: getUsuariosLogin() };
    } else if (action === 'login') {
      var user = e.parameter.usuario;
      var pin = e.parameter.pin;
      var res = authenticateUser(user, pin);
      if (res.success) {
        logAuditoria(res.usuario, res.rol, "Inicio de Sesión", "Ingreso exitoso al sistema");
        output = {
          success: true,
          usuario: res.usuario,
          rol: res.rol,
          data: getDatabaseData()
        };
      } else {
        logAuditoria(user || "Desconocido", "Desconocido", "Intento Fallido", "PIN inválido");
        output = { success: false, error: "Usuario o PIN incorrecto." };
      }
    } else if (action === 'getData') {
      var reqUser = e.parameter.usuario;
      var reqPin = e.parameter.pin;
      if (!verifyAuthToken(reqUser, reqPin, 'miembro')) {
        output = { error: "Acceso denegado. Se requiere autenticación." };
      } else {
        output = getDatabaseData();
      }
    } else if (action === 'getAuditoria') {
      var admUser = e.parameter.usuario;
      var admPin = e.parameter.pin;
      if (!verifyAuthToken(admUser, admPin, 'admin')) {
        output = { error: "Acceso denegado. Se requiere rol de Administrador." };
      } else {
        output = { logs: getAuditoriaLogs() };
      }
    } else {
      output = { error: "Acción no válida" };
    }
  } catch (err) {
    output = { error: err.message };
  }
  
  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var output = {};
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var usuario = body.usuario;
    var pin = body.pin;

    if (action === 'saveServicio') {
      output = saveServicio(usuario, pin, body.data, body.servicioId);
    } else if (action === 'deleteServicio') {
      output = deleteServicio(usuario, pin, body.servicioId);
    } else if (action === 'addMiembro') {
      output = addMiembro(usuario, pin, body.nombre, body.apellidos);
    } else if (action === 'toggleTagMiembro') {
      output = toggleTagMiembro(usuario, pin, body.idMiembro, body.tipoTag);
    } else if (action === 'deleteMiembro') {
      output = deleteMiembro(usuario, pin, body.idMiembro);
    } else {
      output = { error: "Acción POST no válida" };
    }
  } catch (err) {
    output = { error: err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAuditoriaLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  initSheetsIfNeeded(ss);
  var sheet = getSheetByNameRobust(ss, 'Auditoria');
  var data = sheet.getDataRange().getValues();
  var logs = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) {
      logs.push({
        fechaHora: Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone() || "GMT-6", "yyyy-MM-dd HH:mm:ss"),
        usuario: String(data[i][1] || ''),
        rol: String(data[i][2] || ''),
        accion: String(data[i][3] || ''),
        detalle: String(data[i][4] || '')
      });
    }
  }
  return logs.slice().reverse().slice(0, 100); // Últimos 100 registros en orden cronológico inverso
}

function parseCamData(raw) {
  if (!raw) return { asig: '', f_a: '', k_a: '', f_b: '', k_b: '', esCapacitacion: false, capacitador: '' };
  if (typeof raw === 'string' && raw.startsWith('{')) {
    try { return JSON.parse(raw); } catch(e) {}
  }
  return { asig: String(raw).trim(), f_a: '', k_a: '', f_b: '', k_b: '', esCapacitacion: false, capacitador: '' };
}

function getDatabaseData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  initSheetsIfNeeded(ss);
  var miembroSheet = ss.getSheetByName('Miembros');
  var srvSheet = ss.getSheetByName('Servicios');
  
  var miembroData = miembroSheet.getDataRange().getValues();
  var srvData = srvSheet.getDataRange().getValues();
  
  var miembros = [];
  for (var i = 1; i < miembroData.length; i++) {
    var mNombre = String(miembroData[i][0] || '').trim();
    var mApellidos = String(miembroData[i][1] || '').trim();
    if (mNombre !== '' && mNombre.toLowerCase() !== 'nombre') {
      miembros.push({ 
        id: mNombre + ' ' + mApellidos, 
        nombre: mNombre, 
        apellidos: mApellidos,
        esDirector: miembroData[i][2] === true || String(miembroData[i][2]).toLowerCase() === 'true',
        esCapacitador: miembroData[i][3] === true || String(miembroData[i][3]).toLowerCase() === 'true',
        esCamarografo: miembroData[i][4] === true || String(miembroData[i][4]).toLowerCase() === 'true',
        enCapacitacion: miembroData[i][5] === true || String(miembroData[i][5]).toLowerCase() === 'true'
      });
    }
  }
  miembros.sort((a, b) => a.nombre.localeCompare(b.nombre));
  
  var servicios = [];
  for (var j = 1; j < srvData.length; j++) {
    var sId = srvData[j][0];
    if (sId !== '' && sId !== undefined && String(sId).toLowerCase() !== 'id') {
      servicios.push({
        id: sId,
        director: srvData[j][1] || 'Sin Director',
        fecha: srvData[j][2] ? String(srvData[j][2]) : '',
        cam1: parseCamData(srvData[j][3]),
        cam2: parseCamData(srvData[j][4]),
        cam3: parseCamData(srvData[j][5]),
        cam4: parseCamData(srvData[j][6]),
        cam5: parseCamData(srvData[j][7]),
        cam6: parseCamData(srvData[j][8])
      });
    }
  }
  return { miembros: miembros, servicios: servicios.slice().reverse(), rawServicios: servicios };
}

function getSheetByNameRobust(ss, name) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === name.trim().toLowerCase()) return sheets[i];
  }
  return null;
}

function initSheetsIfNeeded(ss) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Miembros
  var miembroSheet = getSheetByNameRobust(ss, 'Miembros');
  if (!miembroSheet) miembroSheet = ss.insertSheet('Miembros');
  if (miembroSheet.getLastRow() === 0) miembroSheet.appendRow(['Nombre', 'Apellidos', 'EsDirector', 'EsCapacitador', 'EsCamarografo', 'EnCapacitacion']);

  // 2. Servicios
  var srvSheet = getSheetByNameRobust(ss, 'Servicios');
  if (!srvSheet) srvSheet = ss.insertSheet('Servicios');
  if (srvSheet.getLastRow() === 0) srvSheet.appendRow(['ID', 'Director', 'Fecha', 'Cam 1 (JSON)', 'Cam 2 (JSON)', 'Cam 3 (JSON)', 'Cam 4 (JSON)', 'Cam 5 (JSON)', 'Cam 6 (JSON)']);

  // 3. Usuarios
  var userSheet = getSheetByNameRobust(ss, 'Usuarios');
  if (!userSheet) {
    userSheet = ss.insertSheet('Usuarios');
    userSheet.appendRow(['Nombre', 'PIN', 'Rol', 'Activo']);
    // Usuarios iniciales de ejemplo
    userSheet.appendRow(['Administrador General', '1997', 'admin', true]);
    userSheet.appendRow(['Director de Turno', '2017', 'director', true]);
  }

  // 4. Auditoría
  var auditSheet = getSheetByNameRobust(ss, 'Auditoria');
  if (!auditSheet) {
    auditSheet = ss.insertSheet('Auditoria');
    auditSheet.appendRow(['Timestamp', 'Usuario', 'Rol', 'Accion', 'Detalle']);
  }
}

function addMiembro(usuario, pin, nombre, apellidos) {
  if (!verifyAuthToken(usuario, pin, 'admin')) throw new Error('Se requiere rol de Administrador.');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheetByName('Miembros').appendRow([String(nombre).trim(), String(apellidos).trim(), false, false, true, false]);
  logAuditoria(usuario, 'admin', 'Agregar Miembro', 'Añadió a: ' + nombre + ' ' + apellidos);
  return getDatabaseData();
}

function toggleTagMiembro(usuario, pin, idMiembro, tipoTag) {
  if (!verifyAuthToken(usuario, pin, 'admin')) throw new Error('Se requiere rol de Administrador.');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Miembros');
  var data = sheet.getDataRange().getValues();
  var colIndex = tipoTag === 'director' ? 3 : tipoTag === 'capacitador' ? 4 : tipoTag === 'camarografo' ? 5 : tipoTag === 'encapacitacion' ? 6 : -1;
  
  for (var i = 1; i < data.length; i++) {
    var currId = String(data[i][0]).trim() + ' ' + String(data[i][1]).trim();
    if (currId === idMiembro) {
      var val = data[i][colIndex - 1] === true || String(data[i][colIndex - 1]).toLowerCase() === 'true';
      sheet.getRange(i + 1, colIndex).setValue(!val);
      logAuditoria(usuario, 'admin', 'Modificar Rol Miembro', 'Cambió tag ' + tipoTag + ' para: ' + idMiembro);
      break;
    }
  }
  return getDatabaseData();
}

function deleteMiembro(usuario, pin, idMiembro) {
  if (!verifyAuthToken(usuario, pin, 'admin')) throw new Error('Se requiere rol de Administrador.');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Miembros');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((String(data[i][0]).trim() + ' ' + String(data[i][1]).trim()) === idMiembro) {
      sheet.deleteRow(i + 1);
      logAuditoria(usuario, 'admin', 'Eliminar Miembro', 'Eliminó a: ' + idMiembro);
      break;
    }
  }
  return getDatabaseData();
}

function saveServicio(usuario, pin, data, servicioId) {
  if (!verifyAuthToken(usuario, pin, 'director')) throw new Error('Se requiere rol de Director o Administrador.');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var srvSheet = ss.getSheetByName('Servicios');
  var srvData = srvSheet.getDataRange().getValues();
  var rowData = [data.director || 'Sin Director', data.fecha, JSON.stringify(data.cam1), JSON.stringify(data.cam2), JSON.stringify(data.cam3), JSON.stringify(data.cam4), JSON.stringify(data.cam5), JSON.stringify(data.cam6)];
  
  if (servicioId) {
    for (var j = 1; j < srvData.length; j++) {
      if (String(srvData[j][0]) === String(servicioId)) {
        srvSheet.getRange(j + 1, 2, 1, 8).setValues([rowData]);
        logAuditoria(usuario, 'director', 'Actualizar Servicio', 'Editó servicio fecha: ' + data.fecha + ' (Director: ' + data.director + ')');
        break;
      }
    }
  } else {
    srvSheet.appendRow([Date.now()].concat(rowData));
    logAuditoria(usuario, 'director', 'Crear Servicio', 'Creó nuevo servicio fecha: ' + data.fecha + ' (Director: ' + data.director + ')');
  }
  return getDatabaseData();
}

function deleteServicio(usuario, pin, servicioId) {
  if (!verifyAuthToken(usuario, pin, 'director')) throw new Error('Se requiere rol de Director o Administrador.');
  var srvSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Servicios');
  var srvData = srvSheet.getDataRange().getValues();
  for (var j = 1; j < srvData.length; j++) {
    if (String(srvData[j][0]) === String(servicioId)) {
      var srvFecha = srvData[j][2];
      srvSheet.deleteRow(j + 1);
      logAuditoria(usuario, 'director', 'Eliminar Servicio', 'Eliminó servicio fecha: ' + srvFecha + ' (ID: ' + servicioId + ')');
      break;
    }
  }
  return getDatabaseData();
}
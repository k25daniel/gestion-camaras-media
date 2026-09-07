const DIRECTOR_PIN = "2017";
const ADMIN_PIN    = "1997";

function verifyPin(pin, nivelRequerido) {
  var cleanPin = String(pin).trim();
  if (nivelRequerido === 'admin') return cleanPin === ADMIN_PIN;
  if (nivelRequerido === 'director') return cleanPin === DIRECTOR_PIN || cleanPin === ADMIN_PIN;
  return false;
}

function doGet(e) {
  var action = e.parameter.action;
  var output = {};
  
  try {
    if (action === 'getData') {
      output = getDatabaseData();
    } else if (action === 'verifyPin') {
      var pin = e.parameter.pin;
      var nivel = e.parameter.nivel;
      output = { success: verifyPin(pin, nivel) };
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
    var pin = body.pin;

    if (action === 'saveServicio') {
      output = saveServicio(pin, body.data, body.servicioId);
    } else if (action === 'deleteServicio') {
      output = deleteServicio(pin, body.servicioId);
    } else if (action === 'addMiembro') {
      output = addMiembro(pin, body.nombre, body.apellidos);
    } else if (action === 'toggleTagMiembro') {
      output = toggleTagMiembro(pin, body.idMiembro, body.tipoTag);
    } else if (action === 'deleteMiembro') {
      output = deleteMiembro(pin, body.idMiembro);
    } else {
      output = { error: "Acción POST no válida" };
    }
  } catch (err) {
    output = { error: err.message };
  }

  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// Funciones de base de datos intactas
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
  var miembroSheet = getSheetByNameRobust(ss, 'Miembros');
  if (!miembroSheet) miembroSheet = ss.insertSheet('Miembros');
  if (miembroSheet.getLastRow() === 0) miembroSheet.appendRow(['Nombre', 'Apellidos', 'EsDirector', 'EsCapacitador', 'EsCamarografo', 'EnCapacitacion']);

  var srvSheet = getSheetByNameRobust(ss, 'Servicios');
  if (!srvSheet) srvSheet = ss.insertSheet('Servicios');
  if (srvSheet.getLastRow() === 0) srvSheet.appendRow(['ID', 'Director', 'Fecha', 'Cam 1 (JSON)', 'Cam 2 (JSON)', 'Cam 3 (JSON)', 'Cam 4 (JSON)', 'Cam 5 (JSON)', 'Cam 6 (JSON)']);
}

function addMiembro(pin, nombre, apellidos) {
  if (!verifyPin(pin, 'admin')) throw new Error('PIN de Administrador incorrecto.');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.getSheetByName('Miembros').appendRow([String(nombre).trim(), String(apellidos).trim(), false, false, true, false]);
  return getDatabaseData();
}

function toggleTagMiembro(pin, idMiembro, tipoTag) {
  if (!verifyPin(pin, 'admin')) throw new Error('PIN de Administrador incorrecto.');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Miembros');
  var data = sheet.getDataRange().getValues();
  var colIndex = tipoTag === 'director' ? 3 : tipoTag === 'capacitador' ? 4 : tipoTag === 'camarografo' ? 5 : tipoTag === 'encapacitacion' ? 6 : -1;
  
  for (var i = 1; i < data.length; i++) {
    var currId = String(data[i][0]).trim() + ' ' + String(data[i][1]).trim();
    if (currId === idMiembro) {
      var val = data[i][colIndex - 1] === true || String(data[i][colIndex - 1]).toLowerCase() === 'true';
      sheet.getRange(i + 1, colIndex).setValue(!val);
      break;
    }
  }
  return getDatabaseData();
}

function deleteMiembro(pin, idMiembro) {
  if (!verifyPin(pin, 'admin')) throw new Error('PIN de Administrador incorrecto.');
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Miembros');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if ((String(data[i][0]).trim() + ' ' + String(data[i][1]).trim()) === idMiembro) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return getDatabaseData();
}

function saveServicio(pin, data, servicioId) {
  if (!verifyPin(pin, 'director')) throw new Error('PIN de Director incorrecto.');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var srvSheet = ss.getSheetByName('Servicios');
  var srvData = srvSheet.getDataRange().getValues();
  var rowData = [data.director || 'Sin Director', data.fecha, JSON.stringify(data.cam1), JSON.stringify(data.cam2), JSON.stringify(data.cam3), JSON.stringify(data.cam4), JSON.stringify(data.cam5), JSON.stringify(data.cam6)];
  
  if (servicioId) {
    for (var j = 1; j < srvData.length; j++) {
      if (String(srvData[j][0]) === String(servicioId)) {
        srvSheet.getRange(j + 1, 2, 1, 8).setValues([rowData]);
        break;
      }
    }
  } else {
    srvSheet.appendRow([Date.now()].concat(rowData));
  }
  return getDatabaseData();
}

function deleteServicio(pin, servicioId) {
  if (!verifyPin(pin, 'director')) throw new Error('PIN de Director incorrecto.');
  var srvSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Servicios');
  var srvData = srvSheet.getDataRange().getValues();
  for (var j = 1; j < srvData.length; j++) {
    if (String(srvData[j][0]) === String(servicioId)) {
      srvSheet.deleteRow(j + 1);
      break;
    }
  }
  return getDatabaseData();
}
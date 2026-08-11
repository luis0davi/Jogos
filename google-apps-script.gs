/**
 * MONITOR DE FORNOS — Google Apps Script
 *
 * 1) Crie uma planilha Google Sheets com uma aba chamada "leituras".
 * 2) Cabeçalhos na primeira linha:
 *    timestamp | id | nome | temperatura | meta | status | dispositivo
 * 3) Extensões > Apps Script e cole este arquivo.
 * 4) Publique como Web App: Executar como você; acesso: qualquer pessoa.
 * 5) Use a URL /exec no protótipo e no ESP8266.
 *
 * POST esperado pelo ESP8266:
 * {"id":"forno1","nome":"Forno 1","temperatura":1280,"meta":1300,"status":"Em operação","dispositivo":"esp8266-01"}
 *
 * GET ?action=latest retorna a última leitura de cada forno.
 */

const SHEET_NAME = "leituras";

function sheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    sheet_().appendRow([
      new Date(),
      data.id || "",
      data.nome || "",
      Number(data.temperatura || 0),
      Number(data.meta || 0),
      data.status || "",
      data.dispositivo || ""
    ]);
    return json_({ok:true});
  } catch(err) {
    return json_({ok:false,error:String(err)});
  }
}

function doGet(e) {
  const action = e.parameter.action || "latest";
  if (action !== "latest") return json_({ok:true,message:"Monitor de Fornos API"});
  const sh = sheet_();
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return json_([]);
  const rows = values.slice(1);
  const latest = {};
  rows.forEach(r => {
    const item = {timestamp:r[0], id:r[1], nome:r[2], temperatura:r[3], meta:r[4], status:r[5], dispositivo:r[6]};
    latest[item.id || item.nome] = item;
  });
  return json_(Object.values(latest));
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

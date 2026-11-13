/**
 * =====================================================================
 *  NEON RUSH — Backend database pengguna di Google Sheets
 *  Tempel seluruh isi file ini ke Google Apps Script (Extensions > Apps Script)
 *  Lihat PANDUAN_GOOGLE_SHEETS.md untuk langkah lengkap.
 * =====================================================================
 */

var SHEET_USERS = 'Users';
var HEADERS = ['username', 'passhash', 'salt', 'token', 'money', 'rep', 'wins', 'races', 'car',
  'data', 'created_at', 'last_login', 'updated_at'];
var COL = {};
HEADERS.forEach(function (h, i) { COL[h] = i + 1; }); // nomor kolom (1-based)

/** Jalankan SEKALI dari editor (pilih "setup" lalu klik Run) untuk membuat sheet & header. */
function setup() {
  var sh = getSheet_();
  SpreadsheetApp.getActive().toast('Sheet "' + SHEET_USERS + '" siap dipakai Neon Rush!');
  return sh.getName();
}

function getSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_USERS);
  if (!sh) sh = ss.insertSheet(SHEET_USERS);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#1b0b35').setFontColor('#ffffff');
    sh.setColumnWidth(COL.data, 300);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sha256_(s) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

/** Cari baris berdasarkan username (tidak peka huruf besar/kecil). Return nomor baris atau -1. */
function findRow_(sh, username) {
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var names = sh.getRange(2, COL.username, last - 1, 1).getValues();
  var key = String(username).toLowerCase();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).toLowerCase() === key) return i + 2;
  }
  return -1;
}

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'leaderboard') return json_(leaderboard_());
  return json_({ ok: true, msg: 'Neon Rush API aktif. Gunakan POST dari game.' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (err) {
    return json_({ ok: false, error: 'Server sibuk, coba lagi.' });
  }
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var a = body.action;
    if (a === 'ping') return json_({ ok: true });
    if (a === 'register') return json_(register_(body));
    if (a === 'login') return json_(login_(body));
    if (a === 'save') return json_(save_(body));
    if (a === 'leaderboard') return json_(leaderboard_());
    return json_({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return json_({ ok: false, error: 'Kesalahan server: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}

function register_(b) {
  var u = String(b.username || '').trim();
  if (!/^[a-zA-Z0-9_]{3,16}$/.test(u)) return { ok: false, error: 'Username 3-16 karakter (huruf, angka, _).' };
  if (!b.passhash || String(b.passhash).length !== 64) return { ok: false, error: 'Password tidak valid.' };
  var sh = getSheet_();
  if (findRow_(sh, u) > 0) return { ok: false, error: 'Username sudah dipakai.' };
  var salt = Utilities.getUuid();
  var token = Utilities.getUuid();
  var now = new Date();
  var data = String(b.data || '{}');
  if (data.length > 45000) return { ok: false, error: 'Data terlalu besar.' };
  var row = [];
  row[COL.username - 1] = u;
  row[COL.passhash - 1] = sha256_(salt + ':' + b.passhash);
  row[COL.salt - 1] = salt;
  row[COL.token - 1] = token;
  row[COL.money - 1] = 0;
  row[COL.rep - 1] = 0;
  row[COL.wins - 1] = 0;
  row[COL.races - 1] = 0;
  row[COL.car - 1] = '';
  row[COL.data - 1] = data;
  row[COL.created_at - 1] = now;
  row[COL.last_login - 1] = now;
  row[COL.updated_at - 1] = now;
  sh.appendRow(row);
  return { ok: true, token: token, username: u };
}

function login_(b) {
  var sh = getSheet_();
  var r = findRow_(sh, b.username);
  if (r < 0) return { ok: false, error: 'Username atau password salah.' };
  var vals = sh.getRange(r, 1, 1, HEADERS.length).getValues()[0];
  var salt = vals[COL.salt - 1];
  if (sha256_(salt + ':' + b.passhash) !== vals[COL.passhash - 1]) return { ok: false, error: 'Username atau password salah.' };
  var token = Utilities.getUuid();
  sh.getRange(r, COL.token).setValue(token);
  sh.getRange(r, COL.last_login).setValue(new Date());
  return { ok: true, token: token, username: vals[COL.username - 1], data: vals[COL.data - 1] };
}

function save_(b) {
  var sh = getSheet_();
  var r = findRow_(sh, b.username);
  if (r < 0) return { ok: false, error: 'Akun tidak ditemukan.' };
  var token = sh.getRange(r, COL.token).getValue();
  if (!b.token || b.token !== token) return { ok: false, error: 'Sesi berakhir, silakan login ulang.' };
  var data = String(b.data || '{}');
  if (data.length > 45000) return { ok: false, error: 'Data terlalu besar.' };
  var vals = [[Number(b.money) || 0, Number(b.rep) || 0, Number(b.wins) || 0, Number(b.races) || 0, String(b.car || ''), data]];
  sh.getRange(r, COL.money, 1, 6).setValues(vals); // money, rep, wins, races, car, data (kolom berurutan)
  sh.getRange(r, COL.updated_at).setValue(new Date());
  return { ok: true };
}

function leaderboard_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, rows: [] };
  var vals = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var rows = vals.map(function (v) {
    return { username: v[COL.username - 1], rep: Number(v[COL.rep - 1]) || 0, wins: Number(v[COL.wins - 1]) || 0,
      money: Number(v[COL.money - 1]) || 0, car: v[COL.car - 1] || '-' };
  });
  rows.sort(function (a, b) { return b.rep - a.rep || b.wins - a.wins; });
  return { ok: true, rows: rows.slice(0, 20) };
}

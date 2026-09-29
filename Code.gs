/**
 * 席替えアプリ（Google Apps Script）
 * スプレッドシートに紐付けず Script Properties に保存する単体Webアプリです。
 */
const STORE_KEY = 'seatChangeAppData_v1';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('席替えアプリ')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getAppData() {
  const raw = PropertiesService.getScriptProperties().getProperty(STORE_KEY);
  return raw ? JSON.parse(raw) : {
    config: { rows: 4, cols: 7, frontRows: 2 },
    students: [], pairs: { together: [], apart: [] }, previous: [], archives: [], savedAt: null
  };
}

function saveAppData(data) {
  validateData_(data);
  PropertiesService.getScriptProperties().setProperty(STORE_KEY, JSON.stringify(data));
  return getAppData();
}

function validateData_(data) {
  if (!data || !data.config) throw new Error('設定データが正しくありません。');
  ['rows', 'cols', 'frontRows'].forEach(k => {
    const v = Number(data.config[k]);
    if (!Number.isInteger(v) || v < 1 || v > 20) throw new Error('席の設定を確認してください。');
  });
  const names = (data.students || []).map(s => typeof s === 'string' ? s : s.name);
  if (new Set(names).size !== names.length || names.some(n => !String(n).trim())) {
    throw new Error('名簿に重複または空欄があります。');
  }
}

function generateSeating(data, count) {
  validateData_(data);
  // 画面からは {name, front} 形式で受け取り、以降は名前だけを使います。
  data = JSON.parse(JSON.stringify(data));
  data.frontStudents = (data.students || []).filter(s => typeof s === 'object' && s.front).map(s => s.name);
  data.students = (data.students || []).map(s => typeof s === 'string' ? s : s.name);
  count = Math.min(Math.max(Number(count) || 1, 1), 10);
  const capacity = data.config.rows * data.config.cols;
  if (data.students.length > capacity) throw new Error('児童数が席数を超えています。');

  const results = [];
  for (let i = 0; i < count; i++) {
    const result = createBestLayout_(data, 3000);
    if (result) results.push(result);
  }
  if (!results.length) throw new Error('条件を満たす席が作れませんでした。条件を少し減らして再度お試しください。');
  results.sort((a,b) => b.score - a.score);
  return results;
}

function createBestLayout_(data, tries) {
  const { rows, cols, frontRows } = data.config;
  const n = data.students.length;
  const seats = Array.from({length: rows * cols}, (_, i) => i);
  const positions = seats.slice(0, n);
  const front = new Set(seats.filter(i => Math.floor(i / cols) < frontRows));
  const previous = data.previous || [];
  const prevMap = {};
  previous.forEach((name, index) => { if (name) prevMap[name] = index; });
  const together = data.pairs.together || [];
  const apart = data.pairs.apart || [];
  let best = null;

  for (let t = 0; t < tries; t++) {
    const assignment = shuffle_(positions).slice();
    const layout = Array(rows * cols).fill('');
    data.students.forEach((name, i) => layout[assignment[i]] = name);
    const scoreInfo = score_(layout, cols, front, prevMap, together, apart, data.frontStudents || []);
    if (!best || scoreInfo.score > best.score) best = { layout, ...scoreInfo };
    if (best && best.violations === 0 && best.sameCount === 0) break;
  }
  return best;
}

function score_(layout, cols, front, prevMap, together, apart, frontStudents) {
  const pos = {}; layout.forEach((name, i) => { if (name) pos[name] = i; });
  let score = 0, violations = 0, sameCount = 0;
  Object.keys(pos).forEach(name => {
    if (prevMap[name] === pos[name]) { score -= 15; sameCount++; }
  });
  frontStudents.forEach(name => {
    if (!(name in pos)) return;
    if (front.has(pos[name])) score += 25;
    else { score -= 18; violations++; }
  });
  together.forEach(([a,b]) => {
    if (!(a in pos) || !(b in pos)) return;
    const d = distance_(pos[a], pos[b], cols);
    if (d === 1) score += 40;
    else { score -= d * 5; violations++; }
  });
  apart.forEach(([a,b]) => {
    if (!(a in pos) || !(b in pos)) return;
    const d = distance_(pos[a], pos[b], cols);
    if (d >= 3) score += 18;
    else { score -= (4 - d) * 30; violations++; }
  });
  return { score, violations, sameCount };
}

function distance_(a, b, cols) {
  return Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) + Math.abs((a % cols) - (b % cols));
}

function shuffle_(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

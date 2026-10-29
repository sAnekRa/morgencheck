'use strict';
const fields = [
  ['sleep', 'Wie erholsam war die Nacht?', [['bad', 'Schlecht'], ['medium', 'Mittel'], ['good', 'Gut']]],
  ['freshness', 'Wie frisch fühlst du dich?', [['tired', 'Müde'], ['normal', 'Normal'], ['fresh', 'Frisch']]],
  ['stress', 'Wie hoch ist dein Alltagsstress?', [['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch']]],
  ['complaints', 'Beschwerden / Gesundheit (mehrere möglich)', [['none', 'Keine'], ['known', 'Bekannte Beschwerden'], ['new_or_worse', 'Neu oder stärker'], ['illness', 'Krankheitssymptome']]],
  ['soreness', 'Muskelkater (separat von Gelenken / Sehnen)', [['none', 'Keiner'], ['noticeable', 'Spürbar, Bewegung frei'], ['limited', 'Bewegung beeinträchtigt']]],
  ['training', 'Trainingsmöglichkeit heute', [['planned', 'Wie geplant'], ['less_time', 'Weniger Zeit'], ['shift', 'Verschieben / frei']]],
];
const params = new URLSearchParams(location.search);
const day = params.get('day');
const revision = Number(params.get('revision'));
const zone = params.get('zone');
const mode = params.get('mode');
const telegram = window.Telegram?.WebApp;
const form = document.querySelector('#checkin');
const status = document.querySelector('#status');
const send = document.querySelector('#send');
const detail = document.querySelector('#complaint_detail');
function choiceGroup(name, title, choices, parent, multiple = false) {
  const group = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = title;
  group.append(legend);
  const options = document.createElement('div');
  options.className = 'options';
  for (const [value, label] of [...choices, ['', 'Überspringen']]) {
    const choice = document.createElement('label');
    choice.className = `choice${value ? '' : ' skip'}`;
    const input = document.createElement('input');
    input.type = multiple ? 'checkbox' : 'radio'; input.name = name; input.value = value;
    const text = document.createElement('span'); text.textContent = label;
    choice.append(input, text); options.append(choice);
  }
  group.append(options); parent.append(group);
}
const root = document.querySelector('#fields');
for (const [name, title, choices] of fields) {
  choiceGroup(name, title, choices, root, name === 'complaints');
  for (const branch of document.querySelectorAll(`[data-after="${name}"]`)) root.append(branch);
}
choiceGroup('stress_reason', 'Was trägt dazu bei? (freiwillig)', [['time', 'Zeitdruck'], ['mental', 'Psychische Belastung'], ['physical', 'Körperlicher Alltag'], ['other', 'Anderes']], document.querySelector('#stress-block'));
choiceGroup('known_change', 'Wie hat es sich verändert?', [['better', 'Besser'], ['unchanged', 'Unverändert'], ['worse', 'Schlechter']], document.querySelector('#known-block'));
choiceGroup('complaint_triggers', 'Wann spürst du es? (mehrere möglich)', [['rest', 'In Ruhe'], ['walking', 'Beim Gehen'], ['shoe', 'Bei Schuhkontakt'], ['movement', 'Bei bestimmter Bewegung']], document.querySelector('#detail-block'), true);
choiceGroup('daily_limited', 'Ist dein Alltag eingeschränkt?', [['yes', 'Ja'], ['no', 'Nein']], document.querySelector('#detail-block'));
choiceGroup('shift_choice', 'Wann passt es eher?', [['date', 'Tag wählen'], ['open', 'Noch offen']], document.querySelector('#shift-block'));
document.querySelector('#shift-block').append(document.querySelector('#shift-date-block'));
function selected(name) { return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value).filter(Boolean); }
function show(id, visible) {
  const block = document.querySelector(id);
  block.hidden = !visible;
  for (const input of block.querySelectorAll('input, textarea')) {
    input.disabled = !visible;
    if (!visible) {
      if (['checkbox', 'radio'].includes(input.type)) input.checked = false;
      else input.value = '';
    }
  }
}
function updateBranches() {
  show('#stress-block', selected('stress')[0] === 'high');
  document.querySelector('#time-hint').hidden = selected('stress_reason')[0] !== 'time';
  const complaints = selected('complaints');
  show('#known-block', complaints.includes('known'));
  const changed = complaints.includes('new_or_worse') || selected('known_change')[0] === 'worse';
  show('#detail-block', changed); detail.required = changed;
  show('#illness-block', complaints.includes('illness'));
  show('#soreness-block', selected('soreness')[0] === 'limited');
  show('#minutes-block', selected('training')[0] === 'less_time');
  show('#shift-block', selected('training')[0] === 'shift');
  show('#shift-date-block', selected('training')[0] === 'shift' && selected('shift_choice')[0] === 'date');
}
form.addEventListener('change', event => {
  const input = event.target;
  if (input.type === 'checkbox' && input.checked) {
    for (const peer of form.querySelectorAll(`input[name="${input.name}"]`)) {
      if (peer !== input && (!input.value || input.value === 'none' || !peer.value || peer.value === 'none')) peer.checked = false;
    }
  }
  updateBranches();
});
updateBranches();
let contextValid = false;
try {
  contextValid = /^\d{4}-\d{2}-\d{2}$/.test(day || '') &&
    new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day &&
    params.has('revision') && Number.isSafeInteger(revision) && revision >= 0 &&
    ['test', 'production'].includes(mode) && Boolean(zone);
  new Intl.DateTimeFormat('de-CH', {timeZone: zone}).format(new Date());
} catch { contextValid = false; }
const inTelegram = Boolean(telegram && telegram.platform !== 'unknown' && telegram.platform);
if (contextValid) {
  document.querySelector('#context').textContent = `${mode === 'test' ? 'TEST · ' : ''}${day} · ${zone}`;
  if (revision > 0) document.querySelector('#revision').textContent = 'Korrektur: Bitte den vollständigen Check neu ausfüllen. Übersprungene Felder werden als fehlend gespeichert. Frühere Versionen bleiben erhalten.';
}
if (!contextValid || !inTelegram) {
  status.textContent = 'Bitte über den «Morgencheck öffnen»-Tastaturknopf im privaten Bot-Chat starten. Ein normaler Weblink kann keine Antworten speichern.';
} else {
  telegram.ready(); telegram.expand(); send.disabled = false;
}
let requestId = null;
let attempted = false;
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!contextValid || !inTelegram || attempted || !form.reportValidity()) return;
  const values = new FormData(form);
  const answers = Object.fromEntries(fields.map(([name]) => [name, values.get(name) || null]));
  answers.schema_version = 2;
  answers.complaints = selected('complaints');
  if (!answers.complaints.length) answers.complaints = null;
  for (const key of ['stress_reason', 'known_change', 'daily_limited']) answers[key] = values.get(key) || null;
  for (const key of ['known_location', 'illness_kind', 'illness_since', 'soreness_region', 'soreness_movement']) answers[key] = values.get(key) || '';
  answers.complaint_triggers = selected('complaint_triggers');
  answers.minutes = values.get('minutes') ? Number(values.get('minutes')) : null;
  answers.shift_day = values.get('shift_choice') === 'open' ? 'open' : values.get('shift_day') || null;
  answers.note = document.querySelector('#note').value;
  answers.complaint_detail = detail.disabled ? '' : detail.value;
  if (!detail.disabled && !answers.complaint_detail.trim()) {
    status.textContent = 'Bitte Ort und Veränderung kurz ergänzen.'; return;
  }
  // Nothing is persisted in browser storage or sent to analytics/HTTP APIs.
  requestId ||= crypto.randomUUID();
  const payload = JSON.stringify({schema: 2, mode, request_id: requestId, day, base_revision: revision, answers});
  if (new TextEncoder().encode(payload).length > 4096) {
    status.textContent = 'Die Eingabe ist zu lang (maximal 4096 UTF-8-Bytes). Bitte kürzen.'; return;
  }
  attempted = true; send.disabled = true;
  try {
    telegram.sendData(payload);
    status.textContent = 'An Telegram übergeben, noch nicht als gespeichert bestätigt. Bitte die Bestätigung im Bot-Chat abwarten; bei Unsicherheit /morgenstatus nutzen.';
  } catch {
    attempted = false; requestId = null; send.disabled = false;
    status.textContent = 'Senden fehlgeschlagen. Deine Eingabe steht noch hier; bitte erneut versuchen.';
  }
});

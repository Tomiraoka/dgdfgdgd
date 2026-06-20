// Сборка data.js из data/*.json
// Запуск: node build-data.js
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
const outFile = path.join(__dirname, 'data.js');

const sources = [
  { key: 'Web',  file: 'web.json'  },
  { key: 'Java', file: 'java.json' },
];

const result = {};
for (const { key, file } of sources) {
  const full = path.join(dataDir, file);
  if (!fs.existsSync(full)) {
    console.error('Нет файла:', full);
    process.exit(1);
  }
  result[key] = JSON.parse(fs.readFileSync(full, 'utf8'));
  console.log(`✓ ${key}: ${result[key].variants.length} вариантов`);
}

const banner =
  '// Авто-сгенерированный файл с вопросами.\n' +
  '// НЕ РЕДАКТИРУЙТЕ вручную — правьте data/*.json и запускайте: node build-data.js\n' +
  '// Структура: { Web: {...}, Java: {...} }\n\n';

fs.writeFileSync(outFile, banner + 'window.QUIZ_DATA = ' + JSON.stringify(result) + ';\n');
console.log('→ data.js пересобран (' + fs.statSync(outFile).size + ' байт)');

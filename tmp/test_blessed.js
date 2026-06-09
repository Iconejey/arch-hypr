const blessed = require('neo-neo-blessed');
const screen = blessed.screen({ smartCSR: true });
const box = blessed.box({
  top: 'center', left: 'center', width: '50%', height: '50%',
  content: '{green-bg}{white-fg}Hello{/} World',
  tags: true, border: { type: 'line' }, style: { border: { fg: '#f0f0f0' } }
});
screen.append(box);
screen.render();
setTimeout(() => process.exit(0), 100);

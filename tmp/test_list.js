const blessed = require('neo-neo-blessed');
const screen = blessed.screen({ smartCSR: true });
const list = blessed.list({
  parent: screen,
  keys: true,
  tags: true,
  style: { selected: { bg: 'green', fg: 'white' } },
  items: [
    'Normal item',
    '{red-bg}Red background{/} item',
    'Another item'
  ]
});
list.focus();
screen.render();
setTimeout(() => process.exit(0), 100);

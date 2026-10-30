import { startEditor } from './editor.js';
startEditor().catch((e) => {
  console.error(e);
  const p = document.createElement('p');
  p.className = 'note';
  p.style.margin = '24px';
  p.textContent = 'No se pudo iniciar el editor: ' + e.message;
  document.getElementById('main').prepend(p);
});

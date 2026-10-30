import { startLab } from './lab.js';
startLab().catch((e) => {
  console.error(e);
  const p = document.createElement('p');
  p.className = 'note';
  p.style.margin = '24px';
  p.textContent = 'No se pudo iniciar el laboratorio 3D: ' + e.message;
  document.getElementById('main').prepend(p);
});

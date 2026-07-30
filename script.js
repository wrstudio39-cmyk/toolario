(function(){
  "use strict";
  const root = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');

  function applyTheme(t){
    root.setAttribute('data-theme', t);
    themeToggle.setAttribute('aria-pressed', t === 'light');
    themeToggle.setAttribute('aria-label', t === 'light' ? 'Switch to dark mode' : 'Switch to light mode');
    try{ localStorage.setItem('signal-theme', t); }catch(e){}
  }

  let savedTheme = 'dark';
  try{ savedTheme = localStorage.getItem('signal-theme') || (matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark'); }catch(e){}
  applyTheme(savedTheme);

  themeToggle.addEventListener('click', () => {
    applyTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });

  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();

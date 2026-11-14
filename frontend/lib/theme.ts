// Módulo neutro (sem 'use client'): o layout do servidor importa a chave como string.
export type Theme = 'sol' | 'noite';

export const THEME_STORAGE_KEY = 'ferry-captain-theme';

/** Aplica o tema salvo antes da primeira pintura (evita piscar de claro para escuro). */
export const THEME_BOOT_SCRIPT =
  `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='noite')document.documentElement.dataset.theme='noite'}catch(e){}`;

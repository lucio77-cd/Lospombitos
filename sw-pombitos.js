// sw-pombitos.js — Service Worker da Ordem
// Responsável pelas notificações push quando o lance é superado

const CACHE_NAME = 'pombitos-v1';

// ── INSTALL ──
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// ── ACTIVATE ──
self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// ── PUSH: recebe notificação do servidor ──
self.addEventListener('push', (e) => {
  if (!e.data) return;

  let dados;
  try {
    dados = e.data.json();
  } catch {
    dados = {
      titulo:  'Los Pombitos',
      corpo:   e.data.text(),
      icone:   '/icon-pombo.png',
    };
  }

  const opcoes = {
    body:    dados.corpo,
    icon:    dados.icone || '/icon-pombo.png',
    badge:   '/badge-pombo.png',
    vibrate: [200, 100, 200],
    tag:     dados.tag || 'pombitos',
    renotify: true,
    data: {
      url: dados.url || '/praia.html',
    },
    actions: [
      { action: 'ver',    title: '🔨 VER LEILÃO' },
      { action: 'fechar', title: 'Fechar' },
    ],
  };

  e.waitUntil(
    self.registration.showNotification(dados.titulo || '🕊️ Los Pombitos', opcoes)
  );
});

// ── CLICK NA NOTIFICAÇÃO ──
self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  if (e.action === 'fechar') return;

  const url = e.notification.data?.url || '/praia.html';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      // Se já tem uma aba aberta, foca nela
      for (const client of lista) {
        if (client.url.includes('pombitos') && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Senão abre uma nova
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

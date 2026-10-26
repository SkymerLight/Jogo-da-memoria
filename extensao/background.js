chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.commands.onCommand.addListener((comando, aba) => {
  if (comando !== 'capturar') return;
  chrome.runtime.sendMessage({ tipo: 'capturar', windowId: aba ? aba.windowId : undefined }).catch(() => {});
});

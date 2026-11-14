// 더 라인 service worker — 휴대폰 푸시 알림을 받아 보여주고, 누르면 그 콘텐츠 화면을 엽니다.
// (lib/notifications.js의 WebPushDevice가 등록, 보내는 쪽은 lib/publicationNotifier.js)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "은혜의 밤 더 라인";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "새 메시지가 올라왔어요.",
      icon: "/icon",
      badge: "/icon",
      tag: data.tag,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

// Service Worker untuk push notification

// Terima event push dari server
self.addEventListener("push", (event) => {
  let data = { title: "Jadwal Shalat", body: "Waktu shalat telah tiba." };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {
    // biarkan default
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      data: data.url || "./",
    })
  );
});

// Klik notifikasi -> buka/fokus halaman
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(event.notification.data || "./");
    })
  );
});
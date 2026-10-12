const DEVICE_STORAGE_KEY = 'chronos_device_signature';

export function getDeviceProfile(): { deviceId: string; deviceName: string } {
  let deviceId = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (!deviceId) {
    const randomBytes = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    deviceId = `dev_${randomBytes}`;
    localStorage.setItem(DEVICE_STORAGE_KEY, deviceId);
  }

  // Detect human-readable device name
  const ua = navigator.userAgent;
  let deviceType = 'Mobile Phone';

  if (/iPhone/i.test(ua)) {
    deviceType = 'Apple iPhone';
  } else if (/iPad/i.test(ua)) {
    deviceType = 'Apple iPad';
  } else if (/Android/i.test(ua)) {
    deviceType = 'Android Phone';
  } else if (/Windows/i.test(ua)) {
    deviceType = 'Windows PC';
  } else if (/Macintosh/i.test(ua)) {
    deviceType = 'MacBook / Mac';
  }

  // Detect browser
  let browser = 'Browser';
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox/i.test(ua)) {
    browser = 'Firefox';
  } else if (/Edg/i.test(ua)) {
    browser = 'Edge';
  }

  const deviceName = `${deviceType} (${browser})`;

  return {
    deviceId,
    deviceName,
  };
}

/**
 * For testing purposes: allows simulating switching to a "Second Device"
 * so the user/admin can test the auto-block security behavior right from the UI!
 */
export function simulateNewDevice(): string {
  const newDeviceId = `dev_simulated_phone2_${Math.random().toString(36).substring(2, 8)}`;
  localStorage.setItem(DEVICE_STORAGE_KEY, newDeviceId);
  return newDeviceId;
}

export function resetToDevice1(): string {
  const dev1 = `dev_original_phone1`;
  localStorage.setItem(DEVICE_STORAGE_KEY, dev1);
  return dev1;
}

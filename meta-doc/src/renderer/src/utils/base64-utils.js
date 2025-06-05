export function encodeJsonToBase64(jsonObj) {
  const jsonStr = JSON.stringify(jsonObj);
  const utf8Str = encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g,
    (_, p1) => String.fromCharCode('0x' + p1)
  );
  return btoa(utf8Str);
}

export function decodeBase64ToJson(base64Str) {
  const jsonStr = decodeURIComponent(Array.prototype.map.call(atob(base64Str), c =>
    '%' + c.charCodeAt(0).toString(16).padStart(2, '0')
  ).join(''));
  return JSON.parse(jsonStr);
}

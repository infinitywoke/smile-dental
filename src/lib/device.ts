// "Android · Chrome", "iPhone · Safari": the phone or computer and its browser, from its user agent (for
// notifications, error reports and the access log; nothing more precise is kept)
export function deviceName(userAgent: string): string {
  const ua = userAgent
  const os = /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iPhone' : /windows/i.test(ua) ? 'Windows' : /mac os/i.test(ua) ? 'Mac' : 'This device'
  const browser = /edg\//i.test(ua) ? 'Edge' : /samsungbrowser/i.test(ua) ? 'Samsung Internet' : /chrome|crios/i.test(ua) ? 'Chrome' : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) ? 'Safari' : 'browser'
  return `${os} · ${browser}`
}

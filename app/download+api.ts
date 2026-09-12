function redirectToDownloadPage(request: Request) {
  const target = new URL('/download/index.html', request.url);
  return Response.redirect(target, 308);
}

export function GET(request: Request) {
  return redirectToDownloadPage(request);
}

export function HEAD(request: Request) {
  return redirectToDownloadPage(request);
}

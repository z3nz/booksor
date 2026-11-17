// Sends www.booksor.com/<anything> to booksor.com/<anything> with a permanent redirect.
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'booksor.com';
    url.protocol = 'https:';
    return Response.redirect(url.toString(), 301);
  },
};

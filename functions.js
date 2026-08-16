export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-outpost",
      path: new URL(request.url).pathname,
    });
  },
};

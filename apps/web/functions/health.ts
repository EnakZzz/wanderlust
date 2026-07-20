export const onRequest: PagesFunction = async () => {
  return Response.json(
    { ok: true, service: "wanderlust-api" },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "no-store"
      }
    }
  );
};

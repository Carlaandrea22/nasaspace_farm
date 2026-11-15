import { getAuth } from "../../../../server/auth";

const headers = { "Cache-Control": "no-store" };
const actions = new Set(["/api/auth/sign-in/username", "/api/auth/sign-in/email", "/api/auth/sign-up/email", "/api/auth/sign-out"]);

async function handle(request: Request) {
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (!(method === "GET" && path === "/api/auth/get-session") &&
    !(method === "POST" && actions.has(path))) {
    return Response.json({ message: "Ruta no disponible." }, { status: 404, headers });
  }

  try {
    const auth = await getAuth();
    if (auth) {
      const response = await auth.handler(request);
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set("Cache-Control", "no-store");
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    }
    if (method === "GET") return Response.json(null, { headers });
  } catch (error) {
    console.error("Error al inicializar o consultar la cuenta", error);
  }
  return Response.json({ message: "La cuenta no está disponible en este momento." }, { status: 503, headers });
}

export { handle as GET, handle as POST };

import { logout, readSession, type AuthEnv } from "../_auth";

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => readSession(request, env);

export const onRequestPost: PagesFunction<AuthEnv> = async () => logout();

export const onRequestOptions: PagesFunction<AuthEnv> = async () => new Response(null, { status: 204 });

import { getAuthConfig, json, type AuthEnv } from "../_auth";

export const onRequestGet: PagesFunction<AuthEnv> = async ({ env }) => json(getAuthConfig(env));

export const onRequestOptions: PagesFunction<AuthEnv> = async () => new Response(null, { status: 204 });

import { startOAuth, type AuthEnv } from "../../_auth";

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => startOAuth(request, env, "apple");

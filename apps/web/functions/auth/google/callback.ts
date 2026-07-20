import { completeOAuth, type AuthEnv } from "../../_auth";

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => completeOAuth(request, env, "google");

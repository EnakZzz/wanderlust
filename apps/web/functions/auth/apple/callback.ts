import { completeOAuth, type AuthEnv } from "../../_auth";

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => completeOAuth(request, env, "apple");

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => completeOAuth(request, env, "apple");

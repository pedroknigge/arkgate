import { session } from "@routepack/auth";

export function auth() {
  return session();
}

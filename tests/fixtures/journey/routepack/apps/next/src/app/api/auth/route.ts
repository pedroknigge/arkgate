import { auth } from "../../../auth/server";

export function POST() {
  return auth();
}

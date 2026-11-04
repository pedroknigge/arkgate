import { auth } from "../../../auth/server";

export function GET() {
  return auth();
}

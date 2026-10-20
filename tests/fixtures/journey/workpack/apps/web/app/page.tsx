import { router } from '@repo/api';
import { auth } from '@repo/auth';
import { db } from '@repo/data';
import { Button } from '@repo/ui';
import { email } from '@repo/validators';

export function Page() {
  return { Button, auth, db, email, router };
}

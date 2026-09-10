// src/app/users/page.tsx
import { db } from '@/src/db';
import { users } from '@/src/db/schema';

export default async function UsersPage() {
  const allUsers = await db.select().from(users);

  return (
    <ul>
      {allUsers.map((user) => (
        <li key={user.id}>{user.displayName}</li>
      ))}
    </ul>
  );
}
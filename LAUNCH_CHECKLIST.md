# Cypher Launch Checklist

## Vercel

1. Import the project into Vercel.
2. Confirm the build command is `npm run build`.
3. Confirm the output directory is `dist`.
4. Deploy from the project root.

## Firebase Authentication

1. In Firebase Console -> Authentication -> Settings -> Authorized domains, add:
   - Your Vercel production domain
   - Any custom domain you plan to use
2. Confirm Email/Password sign-in is enabled.

## Firebase Realtime Database Rules

Use locked-down per-user rules:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

## Data Shape

The app now stores user data under:

- `/users/{uid}/boxes`
- `/users/{uid}/offices`

If you still have legacy root data under `/boxes` or `/offices`, migrate it before launch if you need to keep it.

## Pre-Launch Smoke Test

1. Sign in with a real Firebase user on the deployed site.
2. Confirm unauthenticated access to `/index.html` redirects to `/login.html`.
3. Add a box and add an office.
4. Check a box out to an existing office.
5. Confirm check-out to a missing office is blocked.
6. Check the box back in.
7. Open Box Summary and Office Summary and test the jump/highlight behavior.
8. Open Outstanding and confirm overdue cards render correctly.
9. Confirm log out returns to the login page.

## Operational Notes

- If multiple people share one Firebase account, they share one `uid` and therefore one dataset.
- If each person should only see their own data, each person needs their own Firebase user account.

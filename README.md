# Drop A Note

A simple notepad that lives in your Chrome toolbar. Sign in with Google, jot something down, and your notes sync across every browser you're signed in on.

## Features

- One-click popup: **+ New**, type, done
- Autosave while you type (the popup shows "Saving…" then "Saved")
- Notes sync through your Google account; edits are saved automatically when the connection is available
- Saves even if the popup closes mid-typing
- Delete needs two clicks, so you can't remove a note by accident

## Install (from source)

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/Drop-A-Note-Chrome-Extension.git
cd Drop-A-Note-Chrome-Extension/extension
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select the `extension/dist` folder

To create a shareable ZIP, run `npm run build`, then zip the contents of `extension/dist`
(not the `dist` folder itself). Before publishing, upload the ZIP in the Chrome Web Store
Developer Dashboard and provide a publicly reachable privacy policy URL. The extension
does not collect analytics or sell data; its privacy policy should explain that note
content is stored in the configured Firebase project and accessed only for the signed-in
Google account.

> **Note:** sign-in only works for the extension ID registered with the OAuth client in `manifest.json`. If you're running your own copy, follow *Run your own backend* below.

## Run your own backend

Drop A Note uses Firebase Authentication and Firestore. To point it at your own project:

1. **Firebase:** create a project, add a Web app, and paste its config into `extension/src/firebase.js`. Enable **Firestore Database** and the **Google** sign-in provider.
2. **Extension key:** run `node gen-key.mjs` inside `extension/`. Put the printed public key in the `"key"` field of `extension/public/manifest.json`. Keep the generated `key.pem` private (it's git-ignored). The printed extension ID stays the same every time you load the extension.
3. **Google Cloud OAuth client:** sign-in uses `chrome.identity.launchWebAuthFlow`, so it works in Chrome, Brave and Edge. In the **same Google Cloud project as the Firebase config** (`projectId: drop-a-note`, project number `163907376482`), use an OAuth client of type **Web application** (the current client ID is configured in `extension/public/background.js`) and add this exact authorized redirect URI: `https://odlameecjipmbmbejkplpemijjgpljce.chromiumapp.org/`. Put that client ID in `extension/public/background.js` (`CLIENT_ID`). A client from another project causes Firebase `auth/invalid-credential` because its access-token audience is wrong. Verify the extension ID on `chrome://extensions`; the current manifest key produces `odlameecjipmbmbejkplpemijjgpljce`.
4. **Firestore rules:** publish rules so each user can only touch their own notes:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/notes/{noteId} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
5. Rebuild with `npm run build` and reload the extension.

## How it works

- `public/background.js`: runs the Google sign-in window (`chrome.identity.launchWebAuthFlow`) in the service worker
- `src/auth.js`: signs in to Firebase with the token the service worker obtained
- `src/notes.js`: Firestore reads and writes at `users/{uid}/notes/{noteId}`
- `src/main.js`: the popup UI (login, note list, editor)
- `src/firebase.js`: Firebase setup with a popup-safe in-memory cache

## Privacy

- The extension asks for the `identity` permission only, with the `openid`, `email` and `profile` scopes
- Notes are stored in Firestore under your user ID, and the security rules above stop other users reading them
- There is no analytics or tracking

## Development

```bash
cd extension
npm run dev      # Vite dev server
npm run build    # production build into extension/dist
```

After each build, click the reload icon on the extension card in `chrome://extensions`.

## License

[MIT](LICENSE)
# Drop A Note

A simple notepad that lives in your Chrome toolbar. Sign in with Google, jot something down, and your notes sync across every browser you're signed in on.

## Features

- One-click popup: **+ New**, type, done
- Autosave while you type (the popup shows "Saving…" then "Saved")
- Notes sync through your Google account and are cached offline, so they still work without a connection
- Saves even if the popup closes mid-typing
- Delete needs two clicks, so you can't remove a note by accident

## Install (from source)

Requires [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/<nethsarag>/Drop-A-Note-Chrome-Extension.git
cd Drop-A-Note-Chrome-Extension/extension
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select the `extension/dist` folder

> **Note:** sign-in only works for the extension ID registered with the OAuth client in `manifest.json`. If you're running your own copy, follow *Run your own backend* below.

## Run your own backend

Drop A Note uses Firebase Authentication and Firestore. To point it at your own project:

1. **Firebase:** create a project, add a Web app, and paste its config into `extension/src/firebase.js`. Enable **Firestore Database** and the **Google** sign-in provider.
2. **Extension key:** run `node gen-key.mjs` inside `extension/`. Put the printed public key in the `"key"` field of `extension/public/manifest.json`. Keep the generated `key.pem` private (it's git-ignored). The printed extension ID stays the same every time you load the extension.
3. **Google Cloud OAuth client:** in the same project, create an OAuth client of type **Chrome Extension** using that extension ID. Put its client ID in `manifest.json` under `oauth2.client_id`.
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

- `src/auth.js`: gets a Google token with `chrome.identity` and signs in to Firebase with it
- `src/notes.js`: Firestore reads and writes at `users/{uid}/notes/{noteId}`
- `src/main.js`: the popup UI (login, note list, editor)
- `src/firebase.js`: Firebase setup with a persistent offline cache

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
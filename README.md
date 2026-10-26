# Messenger Cleaner

A small Android app that **unsends your own Messenger messages for everyone, in bulk**.

Facebook Messenger only lets you unsend one message at a time (tap the message, "…", Unsend, "Unsend for everyone", Remove). On a chat with hundreds or thousands of messages that is a daunting job. Messenger Cleaner does those taps for you, from the very first message to the latest.

> Not affiliated with, endorsed by, or connected to Meta Platforms, Inc. "Facebook" and "Messenger" are trademarks of their respective owners.

## What it does

1. Shows `facebook.com/messages` in an in-app browser. You log in yourself.
2. You open a conversation and tap **Unsend all**.
3. The app first scrolls to the top to load the whole history, then walks **from the oldest message down to the newest**, one screen at a time. For each of **your own** messages it:
   - reveals the message's action toolbar,
   - taps **More actions**, then **Unsend**,
   - picks **Unsend for everyone** and confirms with **Remove**.
4. It keeps going until the bottom of the conversation, then re-checks the whole chat until a full pass finds nothing left to unsend, so one run is meant to be enough.

Messages from other people are never touched. The **Stop** button halts it at any time.

Works on text, photos, videos, stickers and cards such as pinned locations and ended live-location shares (see [Limitations](#limitations) for what has actually been tested).

## Install

Download `MessengerCleaner.apk` from the [latest release](../../releases/latest) and open it on your phone. Android will ask you to allow installing from unknown sources.

The APK is signed with a standard debug key, so Play Protect may warn about it. Build it yourself (below) if you prefer not to trust a binary.

## Use

1. Open the app and log in to Facebook.
2. Open the chat you want to clean and wait until the messages have loaded.
3. Tap **Unsend all** and leave the app open on screen. It keeps the screen awake.

The status line shows progress, e.g. `Unsent 120, skipped 2`, and says
`Finished: reached the start, nothing left to unsend.` when done.

Tips:

- Don't switch to another app or tap a message notification while it runs; the page can pause or lose its place.
- Do one chat at a time. The **Speed** button cycles Careful, Normal and Fast (default). It only changes the fixed pauses between steps; faster means a higher chance Facebook slows you down, so drop to Normal or Careful if that happens.
- **Unsending is permanent.** There is no undo. Try it on a throwaway chat first.

## How it works

The app is a single `WebView` activity plus one injected script, [`unsend.js`](app/src/main/assets/unsend.js).

- Messages are found through Facebook's `role="article"` elements. Your own messages are laid out right-to-left (`row-reverse`), received ones left-to-right.
- Hovering a message makes its toolbar appear without opening photos or location cards. The script then taps through the menus using **real Android touch events** (`MotionEvent`), because Facebook ignores script-generated clicks on several of these buttons.
- Menus and dialogs are matched by their **visible** text, never by `aria-label`, because the confirmation dialog contains a hidden, disabled duplicate "Remove" button.
- It loads the history by jumping to the top until nothing older arrives, then scrolls down in screen-sized steps and waits for the layout to stop moving before each message, since lazy-loading photos shift the page while it works.
- **Escape is only pressed when a menu or dialog is open.** In Messenger, Escape with nothing open closes the whole conversation.

## Build

Requirements: JDK 17+ and the Android SDK (platform 37, build-tools 36).

```bash
./gradlew assembleDebug
```

The APK is written to `app/build/outputs/apk/debug/`, and a copy named `MessengerCleaner.apk` is placed in `release/`.

## Limitations

- **Facebook changes its site often.** The script relies on Facebook's page structure and on English button text. If the UI changes, or your account is not set to English, it may skip messages. The text patterns live in the `L` object at the top of `unsend.js`; add your language there.
- **Tested on** a handful of one-to-one chats: text, a pinned location, ended live-location shares, screenshots/photos and videos. Voice messages, files, stickers/GIFs and group chats have not been tested end to end.
- Some message types do not offer "Unsend for everyone". They are skipped, and the skip count goes up.
- It automates Facebook's web interface, which Meta's terms may not allow. Use it only on your own account, at your own risk. Heavy automated activity can trigger temporary blocks.
- Android only.

## Privacy

The app loads Facebook's own website and talks to no other server. Your login lives in the app's private WebView storage on your device. The app has no analytics, no tracking and no extra network code.

## License

[MIT](LICENSE)

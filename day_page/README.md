# JAIMIE Day Page v1
A standalone vanilla HTML/CSS/JS implementation of the supplied Day-page wireframe.

Includes:
- Previous / next day cycling and TODAY
- Separate data per calendar date
- Schedule entries with optional time and notes
- Main Quest tasks
- Manual up/down reordering for schedule entries, quests, and reminders
- Edit controls for schedule entries, quests, and reminders
- Tick/untick, delete, and postpone-to-next-day
- Daily completion percentage
- Persistent Reminders visible across all dates
- localStorage persistence
- Responsive JAIMIE dark/orange UI

No framework or build step required.

## Schedule desktop notifications

1. Serve JAIMIE on localhost or HTTPS in a desktop browser (for example Edge or Chrome).
2. On Day, click **Enable notifications** and allow the browser permission request.
3. Use **Test notification** to check the popup and Windows sound settings.
4. Add/edit a Schedule entry, set its time, and choose **At scheduled time** or **5/10/15 minutes before**. Existing entries default to **Off**.

Test notification also works independently, without enabling scheduled reminders; it can request permission directly. Blocked or unsupported browsers show recovery instructions when clicked. A test is reported as requested until the browser confirms it was shown; this cannot confirm Windows sound or override Do Not Disturb. If controls remain stuck on “Loading” after an update, hard-refresh the Day page (Ctrl+Shift+R).

Keep at least one JAIMIE page open on the same origin. The shared sidebar runs checks every 15 seconds; background-tab throttling, a sleeping computer, and Windows Do Not Disturb can delay or suppress notifications. Reminders up to five minutes late are delivered when checking resumes; older reminders are skipped rather than replayed in a burst. Nothing runs after all JAIMIE tabs close. This is desktop browser notification support, not a background service or Web Push implementation.

Permission/enabled state and delivery receipts stay local to the browser. Web Locks coordinate multiple tabs to avoid duplicate reminders. The entry's stable ID, time and reminder offset survive edits/reordering; the scheduler reads current saved data so deletion or turning the reminder off cancels it. Changing its time/offset creates a new reminder. Click a notification to open its Day date. Task titles can appear in Windows notifications/lock screens; notes are not included. Windows/browser settings control the normal notification sound.

Date keys now use the computer's local calendar date, not UTC. Existing saved date keys are not renamed or migrated; entries saved near midnight by the older UTC-based implementation may need to be reviewed manually.

Automated scheduler tests (mock notifications, no real popups):

```bash
node --test scripts/schedule-notifications.test.mjs
```

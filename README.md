# Google Docs Highlight Tools

Highlight Tools is a personal Google Workspace add-on that opens from the right-hand side panel in Docs. It uses the same standalone Apps Script installation and update workflow as Sentence Tools.

## Install for your Google account

Use Node.js 22 or newer. In this folder, run:

```powershell
npm ci
npm run clasp:account
```

1. Enable the **Google Apps Script API** in [Apps Script user settings](https://script.google.com/home/usersettings).
2. If clasp shows that you are signed out or using a different account, run `npm run clasp:login` and sign in with the account you use in Google Docs.
3. Run `npm run setup`. It runs the checks, creates a dedicated **Highlight Tools** Apps Script project, uploads the build, and opens the editor.
4. In Apps Script, choose **Deploy → Test deployments → Install → Done**.
5. Refresh a Google Doc. Open **Highlight Tools** from the right-hand side panel and authorize it when prompted. The add-on is available in other Docs opened with the same account. [Google’s personal installation guide](https://developers.google.com/workspace/add-ons/how-tos/testing-workspace-addons)

Run `npm.cmd run setup -- --dry-run` in PowerShell to preview setup locally. If you already have a standalone Apps Script project dedicated to this add-on, use `npm.cmd run setup -- --script-id YOUR_SCRIPT_ID` on first setup. Find the ID under **Project Settings → IDs → Script ID**. An upload replaces the linked project's source.

## Use Highlight Tools

- **Apply or remove highlights.** Select text, then click a labeled color or **Remove highlight**. The action uses the selection at the time you click, including partial selections and text in lists and tables.
- **Manage sets.** Choose a saved set from the dropdown. Open **Manage sets** to create a set or edit, duplicate, reorder, or delete the active set. Enter one color and label per line, such as `#FFFF00 Important`. Arrange those lines in the order you want on the home card. Sets follow your Google account across Docs.
- **Extract highlights.** Choose document order or group by color. Export the highlighted text from the active tab to a new Google Doc, the end of the current tab, or an existing Google Doc link. The color column uses the active set's labels and shows the hex value for other colors.
- **Import or share sets.** Export selected sets to a separate Doc or append the active set as a share block using **Associate active set with this tab**. In a tab with shared blocks, use **Find shared sets in this tab** to select and import them. **Manage sets** also has an option to suggest imports when the sidebar opens.

## Bring over sets from Highlight Tool

In the original add-on, open **Extensions → Highlight Tool → Export Library** and export the sets you want to keep. Open the resulting Doc, then choose **Highlight Tools → Import or share sets → Find shared sets in this tab**. Highlight Tools reads the original share blocks. Existing highlights are already part of the document, so you can extract them directly. [Original Highlight Tool documentation](https://jsonchin.github.io/highlight_tool/)

## Update or uninstall

Run `npm run upload` after changing files in `src/`. Refresh Docs and open Highlight Tools again. The **Build** timestamp on the home card identifies the loaded version. Use `npm run clasp:open` to open the linked project or `npm run clasp:status` to check the upload file list. The two upload files are `dist/Code.gs` and `dist/appsscript.json`.

If project creation was interrupted, find **Highlight Tools** in [Apps Script](https://script.google.com/home) and recover with its Script ID using `npm.cmd run setup -- --script-id YOUR_SCRIPT_ID`. If no project was created, retry with `npm.cmd run setup -- --retry-create`. Outside PowerShell on Windows, `npm` works in place of `npm.cmd`.

To uninstall, open the dedicated project and choose **Deploy → Test deployments → Uninstall → Done**.

## Permissions and verification

Highlight Tools uses Google Docs permissions to format the open document and to create or append to the other Docs you choose as export destinations. Its saved library is stored in Apps Script user properties. The add-on uses no external service for document text or saved palettes.

Run `npm run check` for the automated checks and build. In Docs, verify by applying and removing a highlight from part of a sentence, switching sets in a second document, extracting to the current tab and a new Doc, and importing a library exported from the original Highlight Tool. If a Docs write fails midway, inspect the selection or destination before retrying. Editing and exporting through Apps Script can involve more than one write.
